import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv, getOpp } from '@/lib/splits/query-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];

    // Parse filters from query params
    const url = request.nextUrl;
    const typeFilter = url.searchParams.get('type');
    const stageFilter = url.searchParams.get('stage');
    const isPaidPilot = url.searchParams.get('is_paid_pilot');
    const acvMin = url.searchParams.get('acv_min');
    const acvMax = url.searchParams.get('acv_max');

    // Helper to build the base open-opps query with filters applied via opportunity_splits
    const buildOpenQuery = () => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, probability, close_date, mgmt_forecast_category)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', false)
        .eq('opportunities.is_closed_lost', false);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      if (typeFilter) q = q.in('opportunities.type', typeFilter.split(','));
      if (stageFilter) q = q.in('opportunities.stage', stageFilter.split(','));
      if (isPaidPilot === 'true') q = q.eq('opportunities.is_paid_pilot', true);
      if (isPaidPilot === 'false') q = q.eq('opportunities.is_paid_pilot', false);
      if (acvMin) q = q.gte('opportunities.acv', Number(acvMin));
      if (acvMax) q = q.lte('opportunities.acv', Number(acvMax));
      return q;
    };

    // Fetch ALL open opps (paginated to avoid 1000-row default cap)
    const splits = await fetchAll<{ split_owner_user_id: string; split_percentage: number; opportunities: { acv: number | null; probability: number | null; close_date: string | null; mgmt_forecast_category: string | null } }>(buildOpenQuery);

    const totalPipelineAcv = splits.reduce((s, o) => { const opp = getOpp(o); return s + splitAcv(opp.acv, o.split_percentage); }, 0);
    const weightedPipelineAcv = splits.reduce((s, o) => { const opp = getOpp(o); return s + splitAcv(opp.acv, o.split_percentage) * ((opp.probability || 0) / 100); }, 0);
    const dealCount = splits.length;
    const avgDealSize = dealCount > 0 ? totalPipelineAcv / dealCount : 0;
    const closingThisQuarter = splits.filter((o) => {
      const opp = getOpp(o);
      if (!opp.close_date) return false;
      return opp.close_date >= qStartStr && opp.close_date <= qEndStr;
    }).length;

    // Forecast category KPIs
    const forecastedPipelineAcv = splits
      .filter(o => getOpp(o).mgmt_forecast_category === 'Forecast')
      .reduce((s, o) => { const opp = getOpp(o); return s + splitAcv(opp.acv, o.split_percentage); }, 0);
    const upsidePipelineAcv = splits
      .filter(o => getOpp(o).mgmt_forecast_category === 'Upside')
      .reduce((s, o) => { const opp = getOpp(o); return s + splitAcv(opp.acv, o.split_percentage); }, 0);

    return NextResponse.json({
      data: {
        totalPipelineAcv,
        weightedPipelineAcv,
        dealCount,
        avgDealSize,
        closingThisQuarter,
        forecastedPipelineAcv,
        upsidePipelineAcv,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
