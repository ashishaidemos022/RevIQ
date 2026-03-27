import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';

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

    // Helper to build the base open-opps query with filters applied
    const buildOpenQuery = () => {
      let q = db
        .from('opportunities')
        .select('acv, probability, close_date, mgmt_forecast_category')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false);
      q = scopedQuery(q, 'owner_user_id', scope);
      if (typeFilter) q = q.in('type', typeFilter.split(','));
      if (stageFilter) q = q.in('stage', stageFilter.split(','));
      if (isPaidPilot === 'true') q = q.eq('is_paid_pilot', true);
      if (isPaidPilot === 'false') q = q.eq('is_paid_pilot', false);
      if (acvMin) q = q.gte('acv', Number(acvMin));
      if (acvMax) q = q.lte('acv', Number(acvMax));
      return q;
    };

    // Fetch ALL open opps (paginated to avoid 1000-row default cap)
    const opps = await fetchAll<{ acv: number | null; probability: number | null; close_date: string | null; mgmt_forecast_category: string | null }>(buildOpenQuery);

    const totalPipelineAcv = opps.reduce((s, o) => s + (o.acv || 0), 0);
    const weightedPipelineAcv = opps.reduce((s, o) => s + (o.acv || 0) * ((o.probability || 0) / 100), 0);
    const dealCount = opps.length;
    const avgDealSize = dealCount > 0 ? totalPipelineAcv / dealCount : 0;
    const closingThisQuarter = opps.filter((o) => {
      if (!o.close_date) return false;
      return o.close_date >= qStartStr && o.close_date <= qEndStr;
    }).length;

    // Forecast category KPIs
    const forecastedPipelineAcv = opps
      .filter(o => o.mgmt_forecast_category === 'Forecast')
      .reduce((s, o) => s + (o.acv || 0), 0);
    const upsidePipelineAcv = opps
      .filter(o => o.mgmt_forecast_category === 'Upside')
      .reduce((s, o) => s + (o.acv || 0), 0);

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
