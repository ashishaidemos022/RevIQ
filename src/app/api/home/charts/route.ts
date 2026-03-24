import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';

/** Stages excluded from open pipeline entirely (closed/dead/won) */
const EXCLUDED_STAGES = [
  'Closed Lost',
  'Dead-Duplicate',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
  'Stage 7-Closed Won',
  'Stage 8-Closed Won: Finance',
];

/** Early pipeline stages (SS0–SS2) */
const SS0_SS2_STAGES = [
  'Stage 0',
  'Stage 1-Business Discovery',
  'Stage 1-Renewal Placeholder',
  'Stage 2-Renewal Under Management',
  'Stage 2-Solution Discovery',
];

/** Qualified pipeline stages (SS3+) */
const QUALIFIED_STAGES = [
  'Stage 3-Evaluation',
  'Stage 3-Proposal',
  'Stage 4-Shortlist',
  'Stage 4-Verbal',
  'Stage 5-Vendor of Choice',
  'Stage 6-Commit',
];

function getStageGroup(stage: string): string | null {
  if (EXCLUDED_STAGES.includes(stage)) return null;
  if (SS0_SS2_STAGES.includes(stage)) return 'SS0-SS2';
  if (QUALIFIED_STAGES.includes(stage)) return 'Qualified Pipeline';
  return null; // unknown stages are excluded
}

/**
 * Returns aggregated chart data for the Home dashboard:
 * - ACV by month (closed-won, last 12 months)
 * - Pipeline by stage group + close month (current & next fiscal quarter only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    // ACV by month: closed-won opps with ACV and close_date
    const closedOpps = await fetchAll<{ acv: number | null; close_date: string | null }>(() => {
      let q = db
        .from('opportunities')
        .select('acv, close_date')
        .eq('is_closed_won', true)
        .not('close_date', 'is', null);
      return scopedQuery(q, 'owner_user_id', scope);
    });

    // Group by month
    const acvByMonth: Record<string, number> = {};
    for (const o of closedOpps) {
      if (!o.close_date) continue;
      const month = o.close_date.substring(0, 7); // YYYY-MM
      acvByMonth[month] = (acvByMonth[month] || 0) + (o.acv || 0);
    }

    // Pipeline by stage group + close month: open opps in current & next fiscal quarter
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const nextQ = fiscalQuarter < 4 ? fiscalQuarter + 1 : 1;
    const nextFY = fiscalQuarter < 4 ? fiscalYear : fiscalYear + 1;

    const rangeStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const rangeEnd = getQuarterEndDate(nextFY, nextQ);

    const startStr = rangeStart.toISOString().split('T')[0];
    const endStr = rangeEnd.toISOString().split('T')[0];

    const openOpps = await fetchAll<{
      id: string;
      name: string | null;
      stage: string | null;
      acv: number | null;
      close_date: string | null;
      owner_user_id: string | null;
      users: { full_name: string } | null;
    }>(() => {
      let q = db
        .from('opportunities')
        .select('id, name, stage, acv, close_date, owner_user_id, users!opportunities_owner_user_id_fkey(full_name)')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .gte('close_date', startStr)
        .lte('close_date', endStr);
      return scopedQuery(q, 'owner_user_id', scope);
    });

    // Group by close month + stage group (excluding closed/dead stages)
    // Shape: { "2026-03": { "SS0-SS2": { count, acv }, "Qualified Pipeline": { count, acv } } }
    const pipelineByMonthAndGroup: Record<string, Record<string, { count: number; acv: number }>> = {};
    const pipelineByStage: Record<string, { count: number; acv: number }> = {};
    // Deal-level data keyed by "month|group" for drill-down
    const pipelineDeals: Record<string, Array<{ id: string; name: string; owner: string; acv: number; stage: string }>> = {};
    for (const o of openOpps) {
      if (!o.close_date) continue;
      const group = getStageGroup(o.stage || '');
      if (!group) continue; // excluded stage

      const month = o.close_date.substring(0, 7);
      if (!pipelineByMonthAndGroup[month]) pipelineByMonthAndGroup[month] = {};
      if (!pipelineByMonthAndGroup[month][group]) pipelineByMonthAndGroup[month][group] = { count: 0, acv: 0 };
      pipelineByMonthAndGroup[month][group].count++;
      pipelineByMonthAndGroup[month][group].acv += o.acv || 0;

      // Deal-level data for drill-down
      const dealKey = `${month}|${group}`;
      if (!pipelineDeals[dealKey]) pipelineDeals[dealKey] = [];
      pipelineDeals[dealKey].push({
        id: o.id,
        name: o.name || 'Unnamed',
        owner: o.users?.full_name || 'Unknown',
        acv: o.acv || 0,
        stage: o.stage || 'Unknown',
      });

      // Flat view for backward compat
      const stage = o.stage || 'Other';
      if (!pipelineByStage[stage]) pipelineByStage[stage] = { count: 0, acv: 0 };
      pipelineByStage[stage].count++;
      pipelineByStage[stage].acv += o.acv || 0;
    }

    // Sort deals by ACV descending
    for (const key of Object.keys(pipelineDeals)) {
      pipelineDeals[key].sort((a, b) => b.acv - a.acv);
    }

    return NextResponse.json({
      data: {
        acvByMonth,
        pipelineByStage,
        pipelineByMonthAndGroup,
        pipelineDeals,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
