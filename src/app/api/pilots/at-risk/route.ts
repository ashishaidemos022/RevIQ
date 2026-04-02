import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv, flattenSplitRows } from '@/lib/splits/query-helpers';
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
} from '@/lib/fiscal';
import { EXCLUDED_STAGES } from '@/lib/stage-groups';

/**
 * GET /api/pilots/at-risk
 *
 * Identifies pilots whose downstream pipeline is at risk and categorizes
 * each risk with a type, severity, and actionable context.
 *
 * Risk types:
 * - go_live_past_quarter: Estimated go-live extends beyond current quarter end,
 *   but there's pipeline closing this quarter on the account.
 * - early_stage: Pilot is in early stages (SS0–SS2) with pipeline closing within 60 days.
 * - overdue: Pilot is past its end date but hasn't converted, with open pipeline remaining.
 * - stalled: Pilot has been active 90+ days with no close/conversion.
 *
 * Severity: critical (red) | high (orange) | medium (amber)
 */

const BOOKED_STAGES = [
  'Stage 8-Closed Won: Finance',
  'Stage 7-Closed Won',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
];

const EARLY_PILOT_STAGES = [
  'Stage 0',
  'Stage 1-Business Discovery',
  'Stage 1-Renewal Placeholder',
  'Stage 2-Renewal Under Management',
  'Stage 2-Solution Discovery',
];

const PILOT_DURATION_DAYS = 90;

const PILOT_SELECT = [
  'split_owner_user_id',
  'split_percentage',
  'opportunities!inner(id, salesforce_opportunity_id, name, stage, acv, close_date,',
  'paid_pilot_start_date, paid_pilot_end_date, pilot_status,',
  'is_closed_won, is_closed_lost, is_paid_pilot, sf_created_date, account_id,',
  'accounts(id, name, industry, region),',
  'users!opportunities_owner_user_id_fkey(id, full_name, email))',
].join(' ');

interface PilotRow {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  paid_pilot_start_date: string | null;
  paid_pilot_end_date: string | null;
  pilot_status: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  sf_created_date: string | null;
  account_id: string | null;
  accounts: { id: string; name: string } | null;
  users: { id: string; full_name: string; email: string } | null;
  split_owner_user_id: string;
  split_pct: number;
  [key: string]: unknown;
}

interface PipelineOpp {
  id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  account_id: string | null;
}

type RiskType = 'go_live_past_quarter' | 'early_stage' | 'overdue' | 'stalled';
type Severity = 'critical' | 'high' | 'medium';

interface RiskEntry {
  risk_type: RiskType;
  severity: Severity;
  reason: string;
  pilot_id: string;
  pilot_name: string;
  pilot_stage: string;
  pilot_acv: number;
  pilot_close_date: string | null;
  pilot_start_date: string | null;
  pilot_end_date: string | null;
  estimated_go_live: string | null;
  pilot_age_days: number | null;
  account_id: string;
  account_name: string;
  ae_name: string;
  affected_pipeline_acv: number;
  affected_deals: Array<{ name: string; acv: number; close_date: string | null; stage: string }>;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    // 1. Fetch active/open paid pilots (exclude closed-lost and converted)
    const rawSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: Record<string, unknown>;
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select(PILOT_SELECT)
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_paid_pilot', true)
        .eq('opportunities.is_closed_won', false)
        .eq('opportunities.is_closed_lost', false);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      return q.order('opportunities(close_date)', { ascending: false });
    });

    const pilots = flattenSplitRows(rawSplits) as PilotRow[];

    // 2. Collect account IDs and fetch open pipeline
    const accountIds = [...new Set(
      pilots
        .map(p => p.account_id || p.accounts?.id)
        .filter((id): id is string => !!id)
    )];

    if (accountIds.length === 0) {
      return NextResponse.json({ data: [], summary: { total_risks: 0, total_at_risk_acv: 0, by_type: {} } });
    }

    const pipelineOpps: PipelineOpp[] = [];
    for (let i = 0; i < accountIds.length; i += 50) {
      const batch = accountIds.slice(i, i + 50);
      const { data, error } = await db
        .from('opportunities')
        .select('id, name, stage, acv, close_date, account_id')
        .in('account_id', batch)
        .eq('is_paid_pilot', false)
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .not('stage', 'in', `(${EXCLUDED_STAGES.join(',')})`)
        .order('close_date', { ascending: true });
      if (error) throw error;
      if (data) pipelineOpps.push(...(data as PipelineOpp[]));
    }

    // Index pipeline by account
    const pipelineByAccount: Record<string, PipelineOpp[]> = {};
    for (const opp of pipelineOpps) {
      if (!opp.account_id) continue;
      if (!pipelineByAccount[opp.account_id]) pipelineByAccount[opp.account_id] = [];
      pipelineByAccount[opp.account_id].push(opp);
    }

    // 3. Current quarter boundaries
    const now = new Date();
    const nowMs = now.getTime();
    const { fiscalYear: curFY, fiscalQuarter: curFQ } = getCurrentFiscalPeriod();
    const curQEnd = getQuarterEndDate(curFY, curFQ);
    const curQEndStr = curQEnd.toISOString().split('T')[0];
    const sixtyDaysOut = new Date(nowMs + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 4. Evaluate each pilot for risk
    const risks: RiskEntry[] = [];

    for (const pilot of pilots) {
      const acctId = pilot.account_id || pilot.accounts?.id || '';
      const accountPipeline = pipelineByAccount[acctId] || [];
      if (accountPipeline.length === 0) continue; // No pipeline = no risk to flag

      const pilotAcv = splitAcv(pilot.acv, pilot.split_pct);
      const pilotAge = pilot.sf_created_date
        ? Math.floor((nowMs - new Date(pilot.sf_created_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Compute estimated go-live
      let estimatedGoLive: string | null = null;
      if (pilot.close_date && BOOKED_STAGES.includes(pilot.stage)) {
        const goLive = new Date(pilot.close_date);
        goLive.setDate(goLive.getDate() + PILOT_DURATION_DAYS);
        estimatedGoLive = goLive.toISOString().split('T')[0];
      } else if (pilot.paid_pilot_end_date) {
        estimatedGoLive = pilot.paid_pilot_end_date;
      }

      const baseEntry = {
        pilot_id: pilot.id,
        pilot_name: pilot.name,
        pilot_stage: pilot.stage,
        pilot_acv: pilotAcv,
        pilot_close_date: pilot.close_date,
        pilot_start_date: pilot.paid_pilot_start_date,
        pilot_end_date: pilot.paid_pilot_end_date,
        estimated_go_live: estimatedGoLive,
        pilot_age_days: pilotAge,
        account_id: acctId,
        account_name: pilot.accounts?.name || '—',
        ae_name: pilot.users?.full_name || '—',
      };

      const makeDealList = (opps: PipelineOpp[]) =>
        opps.map(o => ({ name: o.name, acv: Number(o.acv) || 0, close_date: o.close_date, stage: o.stage }));

      // ── Risk: Overdue pilot ──────────────────────────
      // Pilot is past its end date but hasn't converted
      if (pilot.paid_pilot_end_date && new Date(pilot.paid_pilot_end_date) < now) {
        const totalAcv = accountPipeline.reduce((s, o) => s + (Number(o.acv) || 0), 0);
        risks.push({
          ...baseEntry,
          risk_type: 'overdue',
          severity: 'critical',
          reason: `Pilot expired ${formatDaysAgo(pilot.paid_pilot_end_date)} ago with ${formatCurrency(totalAcv)} in open pipeline still on the account.`,
          affected_pipeline_acv: totalAcv,
          affected_deals: makeDealList(accountPipeline),
        });
        continue; // Overdue is the most severe — skip other checks for this pilot
      }

      // ── Risk: Go-live past current quarter ──────────
      // Estimated go-live extends beyond quarter end, but pipeline closes this quarter
      if (estimatedGoLive && estimatedGoLive > curQEndStr) {
        const curQDeals = accountPipeline.filter(o => o.close_date && o.close_date <= curQEndStr);
        const curQAcv = curQDeals.reduce((s, o) => s + (Number(o.acv) || 0), 0);
        if (curQAcv > 0) {
          risks.push({
            ...baseEntry,
            risk_type: 'go_live_past_quarter',
            severity: 'critical',
            reason: `Estimated go-live (${formatDateShort(estimatedGoLive)}) is past Q${curFQ} end. ${formatCurrency(curQAcv)} in current-quarter pipeline may not close.`,
            affected_pipeline_acv: curQAcv,
            affected_deals: makeDealList(curQDeals),
          });
          continue;
        }
      }

      // ── Risk: Early stage with near-term pipeline ───
      // Pilot is in early stages (SS0–SS2) with pipeline closing within 60 days
      if (EARLY_PILOT_STAGES.includes(pilot.stage)) {
        const nearTermDeals = accountPipeline.filter(o => o.close_date && o.close_date <= sixtyDaysOut);
        const nearTermAcv = nearTermDeals.reduce((s, o) => s + (Number(o.acv) || 0), 0);
        if (nearTermAcv > 0) {
          risks.push({
            ...baseEntry,
            risk_type: 'early_stage',
            severity: 'high',
            reason: `Pilot is in "${pilot.stage}" but ${formatCurrency(nearTermAcv)} in pipeline closes within 60 days. Pilot unlikely to complete in time.`,
            affected_pipeline_acv: nearTermAcv,
            affected_deals: makeDealList(nearTermDeals),
          });
          continue;
        }
      }

      // ── Risk: Stalled pilot ─────────────────────────
      // Active for 90+ days with no close/conversion
      if (pilotAge !== null && pilotAge >= 90) {
        const totalAcv = accountPipeline.reduce((s, o) => s + (Number(o.acv) || 0), 0);
        risks.push({
          ...baseEntry,
          risk_type: 'stalled',
          severity: 'medium',
          reason: `Pilot has been active for ${pilotAge} days (target: 60d) with ${formatCurrency(totalAcv)} in downstream pipeline.`,
          affected_pipeline_acv: totalAcv,
          affected_deals: makeDealList(accountPipeline),
        });
      }
    }

    // Sort by severity then by affected ACV descending
    const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
    risks.sort((a, b) => {
      const sev = severityOrder[a.severity] - severityOrder[b.severity];
      if (sev !== 0) return sev;
      return b.affected_pipeline_acv - a.affected_pipeline_acv;
    });

    // Summary
    const totalAtRiskAcv = risks.reduce((s, r) => s + r.affected_pipeline_acv, 0);
    const byType: Record<string, { count: number; acv: number }> = {};
    for (const r of risks) {
      if (!byType[r.risk_type]) byType[r.risk_type] = { count: 0, acv: 0 };
      byType[r.risk_type].count++;
      byType[r.risk_type].acv += r.affected_pipeline_acv;
    }

    return NextResponse.json({
      data: risks,
      summary: {
        total_risks: risks.length,
        total_at_risk_acv: totalAtRiskAcv,
        by_type: byType,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

// ─── Inline helpers (server-side only) ────────────────

function formatDaysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(val);
}
