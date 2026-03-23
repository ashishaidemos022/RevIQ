import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';

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

    // All open opportunities (no limit)
    let openQuery = db
      .from('opportunities')
      .select('acv, probability, close_date')
      .eq('is_closed_won', false)
      .eq('is_closed_lost', false);
    openQuery = scopedQuery(openQuery, 'owner_user_id', scope);

    // Apply filters from query params
    const url = request.nextUrl;
    const typeFilter = url.searchParams.get('type');
    const stageFilter = url.searchParams.get('stage');
    const isPaidPilot = url.searchParams.get('is_paid_pilot');

    if (typeFilter) openQuery = openQuery.eq('type', typeFilter);
    if (stageFilter) {
      const stages = stageFilter.split(',');
      openQuery = openQuery.in('stage', stages);
    }
    if (isPaidPilot === 'true') openQuery = openQuery.eq('is_paid_pilot', true);
    if (isPaidPilot === 'false') openQuery = openQuery.eq('is_paid_pilot', false);

    const { data: openOpps } = await openQuery;
    const opps = openOpps || [];

    const totalPipelineAcv = opps.reduce((s, o) => s + (o.acv || 0), 0);
    const weightedPipelineAcv = opps.reduce((s, o) => s + (o.acv || 0) * ((o.probability || 0) / 100), 0);
    const dealCount = opps.length;
    const avgDealSize = dealCount > 0 ? totalPipelineAcv / dealCount : 0;
    const closingThisQuarter = opps.filter((o) => {
      if (!o.close_date) return false;
      return o.close_date >= qStartStr && o.close_date <= qEndStr;
    }).length;

    return NextResponse.json({
      data: {
        totalPipelineAcv,
        weightedPipelineAcv,
        dealCount,
        avgDealSize,
        closingThisQuarter,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
