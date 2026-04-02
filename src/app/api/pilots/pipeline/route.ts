import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv, flattenSplitRows } from '@/lib/splits/query-helpers';
import {
  getCurrentFiscalPeriod,
  getForwardQuarters,
  getQuarterStartDate,
  getQuarterEndDate,
  getFiscalYear,
  getFiscalQuarter,
} from '@/lib/fiscal';

/**
 * GET /api/pilots/pipeline
 *
 * For each account with an active/booked pilot, returns the pilot info
 * plus all open (non-pilot) pipeline on that account grouped by fiscal quarter
 * (current Q + 3 forward quarters).
 *
 * This is Stephen's "pilot-to-pipeline linkage" view: for every pilot in motion,
 * what downstream ACV is sitting on the account waiting for the pilot to land?
 */

const BOOKED_STAGES = [
  'Stage 8-Closed Won: Finance',
  'Stage 7-Closed Won',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
];

const CLOSED_STAGES = [
  ...BOOKED_STAGES,
  'Closed Lost',
  'Dead-Duplicate',
];

const PILOT_SPLIT_SELECT = [
  'split_owner_user_id',
  'split_percentage',
  'opportunities!inner(id, salesforce_opportunity_id, name, stage, acv, close_date,',
  'paid_pilot_start_date, paid_pilot_end_date, pilot_status, pilot_implementation_stage,',
  'is_closed_won, is_closed_lost, is_paid_pilot, sf_created_date,',
  'parent_pilot_opportunity_sf_id, account_id,',
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
  pilot_implementation_stage: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  sf_created_date: string | null;
  parent_pilot_opportunity_sf_id: string | null;
  account_id: string | null;
  accounts: { id: string; name: string; industry: string | null; region: string | null } | null;
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
  is_paid_pilot: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    // 1. Fetch all paid pilot opportunities (active + booked, not closed-lost)
    const rawSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: Record<string, unknown>;
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select(PILOT_SPLIT_SELECT)
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_paid_pilot', true)
        .eq('opportunities.is_closed_lost', false);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      return q.order('opportunities(close_date)', { ascending: false });
    });

    const pilots = flattenSplitRows(rawSplits) as PilotRow[];

    // 2. Collect unique account IDs from pilot opportunities
    const accountIds = [...new Set(
      pilots
        .map(p => p.account_id || p.accounts?.id)
        .filter((id): id is string => !!id)
    )];

    if (accountIds.length === 0) {
      return NextResponse.json({ data: [], quarters: [] });
    }

    // 3. Fetch all open (non-pilot) pipeline on these accounts
    //    "Open" = not closed-won, not closed-lost, not dead
    const pipelineRows: PipelineOpp[] = [];
    for (let i = 0; i < accountIds.length; i += 50) {
      const batch = accountIds.slice(i, i + 50);
      const { data, error } = await db
        .from('opportunities')
        .select('id, name, stage, acv, close_date, account_id, is_paid_pilot')
        .in('account_id', batch)
        .eq('is_paid_pilot', false)
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .not('stage', 'in', `(${CLOSED_STAGES.join(',')})`)
        .order('close_date', { ascending: true });

      if (error) throw error;
      if (data) pipelineRows.push(...(data as PipelineOpp[]));
    }

    // 4. Build quarter buckets (current + 3 forward)
    const quarters = getForwardQuarters(4);
    const quarterRanges = quarters.map(q => ({
      ...q,
      start: getQuarterStartDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0],
      end: getQuarterEndDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0],
    }));

    // 5. Group pipeline opps by account and quarter
    const pipelineByAccount: Record<string, Record<string, { acv: number; count: number; opps: Array<{ name: string; stage: string; acv: number; close_date: string }> }>> = {};

    for (const opp of pipelineRows) {
      const acctId = opp.account_id;
      if (!acctId) continue;

      if (!pipelineByAccount[acctId]) {
        pipelineByAccount[acctId] = {};
        for (const q of quarters) {
          pipelineByAccount[acctId][q.label] = { acv: 0, count: 0, opps: [] };
        }
      }

      const closeDate = opp.close_date;
      if (!closeDate) continue;

      // Find which quarter this close date falls into
      for (const qr of quarterRanges) {
        if (closeDate >= qr.start && closeDate <= qr.end) {
          pipelineByAccount[acctId][qr.label].acv += Number(opp.acv) || 0;
          pipelineByAccount[acctId][qr.label].count += 1;
          pipelineByAccount[acctId][qr.label].opps.push({
            name: opp.name,
            stage: opp.stage,
            acv: Number(opp.acv) || 0,
            close_date: closeDate,
          });
          break;
        }
      }
    }

    // 6. Build response rows — one per pilot, enriched with account pipeline
    const now = new Date();
    const PILOT_DURATION_DAYS = 90; // default assumed duration

    const enriched = pilots.map(p => {
      const acctId = p.account_id || p.accounts?.id || '';
      const pipeline = pipelineByAccount[acctId] || {};
      const totalPipelineAcv = Object.values(pipeline).reduce((s, q) => s + q.acv, 0);

      // Determine pilot status
      let status: string;
      if (p.is_closed_won) status = 'Converted';
      else if (p.is_closed_lost) status = 'Lost';
      else if (p.paid_pilot_end_date && new Date(p.paid_pilot_end_date) < now) status = 'Expired';
      else if (BOOKED_STAGES.includes(p.stage)) status = 'Booked';
      else status = 'In Funnel';

      // Estimated go-live: pilot close date + 90 days (heuristic)
      let estimatedGoLive: string | null = null;
      if (p.close_date && BOOKED_STAGES.includes(p.stage)) {
        const goLive = new Date(p.close_date);
        goLive.setDate(goLive.getDate() + PILOT_DURATION_DAYS);
        estimatedGoLive = goLive.toISOString().split('T')[0];
      } else if (p.paid_pilot_end_date) {
        estimatedGoLive = p.paid_pilot_end_date;
      }

      // Risk: if estimated go-live extends beyond current quarter end and there's pipeline in current Q
      const { fiscalYear: curFY, fiscalQuarter: curFQ } = getCurrentFiscalPeriod();
      const curQEnd = getQuarterEndDate(curFY, curFQ).toISOString().split('T')[0];
      const curQLabel = `Q${curFQ} FY${curFY}`;
      const curQPipeline = pipeline[curQLabel]?.acv || 0;
      const atRisk = !!(estimatedGoLive && estimatedGoLive > curQEnd && curQPipeline > 0);

      return {
        pilot_id: p.id,
        pilot_name: p.name,
        pilot_sf_id: p.salesforce_opportunity_id,
        pilot_stage: p.stage,
        pilot_acv: splitAcv(p.acv, p.split_pct),
        pilot_close_date: p.close_date,
        pilot_start_date: p.paid_pilot_start_date,
        pilot_end_date: p.paid_pilot_end_date,
        pilot_status: status,
        pilot_implementation_stage: p.pilot_implementation_stage,
        estimated_go_live: estimatedGoLive,
        at_risk: atRisk,
        account_id: acctId,
        account_name: p.accounts?.name || '—',
        account_region: p.accounts?.region || null,
        ae_name: p.users?.full_name || '—',
        pipeline_by_quarter: pipeline,
        total_pipeline_acv: totalPipelineAcv,
      };
    });

    // Sort: at-risk first, then by total pipeline descending
    enriched.sort((a, b) => {
      if (a.at_risk !== b.at_risk) return a.at_risk ? -1 : 1;
      return b.total_pipeline_acv - a.total_pipeline_acv;
    });

    return NextResponse.json({
      data: enriched,
      quarters: quarters.map(q => q.label),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
