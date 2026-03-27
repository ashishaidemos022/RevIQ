import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { getStageGroup } from '@/lib/stage-groups';
import { REVENUE_SPLIT_TYPE, splitAcv, getOpp } from '@/lib/splits/query-helpers';

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

    // ACV by month: closed-won opps with ACV, ai_acv, close_date, deal name, owner
    const closedOpps = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: {
        id: string;
        name: string | null;
        acv: number | null;
        ai_acv: number | null;
        close_date: string | null;
        users: { full_name: string } | null;
      };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(id, name, acv, ai_acv, close_date, users!opportunities_owner_user_id_fkey(full_name))')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', true)
        .not('opportunities.close_date', 'is', null);
      return scopedQuery(q, 'split_owner_user_id', scope);
    });

    // Group by month + collect deal-level data
    const acvByMonth: Record<string, number> = {};
    const cxaAcvByMonth: Record<string, number> = {};
    const ccaasAcvByMonth: Record<string, number> = {};
    const acvDeals: Record<string, Array<{ id: string; name: string; owner: string; acv: number }>> = {};
    for (const row of closedOpps) {
      const o = getOpp(row);
      if (!o.close_date) continue;
      const month = o.close_date.substring(0, 7); // YYYY-MM
      const acv = splitAcv(o.acv, row.split_percentage);
      const cxaAcv = splitAcv(o.ai_acv, row.split_percentage);
      const ccaasAcv = acv - cxaAcv;
      acvByMonth[month] = (acvByMonth[month] || 0) + acv;
      cxaAcvByMonth[month] = (cxaAcvByMonth[month] || 0) + cxaAcv;
      ccaasAcvByMonth[month] = (ccaasAcvByMonth[month] || 0) + ccaasAcv;

      if (!acvDeals[month]) acvDeals[month] = [];
      acvDeals[month].push({
        id: o.id,
        name: o.name || 'Unnamed',
        owner: o.users?.full_name || 'Unknown',
        acv,
      });
    }

    // Sort ACV deals by ACV descending
    for (const key of Object.keys(acvDeals)) {
      acvDeals[key].sort((a, b) => b.acv - a.acv);
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
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: {
        id: string;
        name: string | null;
        stage: string | null;
        acv: number | null;
        close_date: string | null;
        users: { full_name: string } | null;
      };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(id, name, stage, acv, close_date, users!opportunities_owner_user_id_fkey(full_name))')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', false)
        .eq('opportunities.is_closed_lost', false)
        .gte('opportunities.close_date', startStr)
        .lte('opportunities.close_date', endStr);
      return scopedQuery(q, 'split_owner_user_id', scope);
    });

    // Group by close month + stage group (excluding closed/dead stages)
    // Shape: { "2026-03": { "SS0-SS2": { count, acv }, "Qualified Pipeline": { count, acv } } }
    const pipelineByMonthAndGroup: Record<string, Record<string, { count: number; acv: number }>> = {};
    const pipelineByStage: Record<string, { count: number; acv: number }> = {};
    // Deal-level data keyed by "month|group" for drill-down
    const pipelineDeals: Record<string, Array<{ id: string; name: string; owner: string; acv: number; stage: string }>> = {};
    for (const row of openOpps) {
      const o = getOpp(row);
      if (!o.close_date) continue;
      const group = getStageGroup(o.stage || '');
      if (!group) continue; // excluded stage

      const acv = splitAcv(o.acv, row.split_percentage);
      const month = o.close_date.substring(0, 7);
      if (!pipelineByMonthAndGroup[month]) pipelineByMonthAndGroup[month] = {};
      if (!pipelineByMonthAndGroup[month][group]) pipelineByMonthAndGroup[month][group] = { count: 0, acv: 0 };
      pipelineByMonthAndGroup[month][group].count++;
      pipelineByMonthAndGroup[month][group].acv += acv;

      // Deal-level data for drill-down
      const dealKey = `${month}|${group}`;
      if (!pipelineDeals[dealKey]) pipelineDeals[dealKey] = [];
      pipelineDeals[dealKey].push({
        id: o.id,
        name: o.name || 'Unnamed',
        owner: o.users?.full_name || 'Unknown',
        acv,
        stage: o.stage || 'Unknown',
      });

      // Flat view for backward compat
      const stage = o.stage || 'Other';
      if (!pipelineByStage[stage]) pipelineByStage[stage] = { count: 0, acv: 0 };
      pipelineByStage[stage].count++;
      pipelineByStage[stage].acv += acv;
    }

    // Sort deals by ACV descending
    for (const key of Object.keys(pipelineDeals)) {
      pipelineDeals[key].sort((a, b) => b.acv - a.acv);
    }

    return NextResponse.json({
      data: {
        acvByMonth,
        cxaAcvByMonth,
        ccaasAcvByMonth,
        acvDeals,
        pipelineByStage,
        pipelineByMonthAndGroup,
        pipelineDeals,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
