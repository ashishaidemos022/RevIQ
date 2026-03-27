import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

interface SplitOppRow {
  split_owner_user_id: string;
  split_percentage: number;
  opportunities: {
    id: string;
    name: string;
    stage: string | null;
    acv: number | null;
    reporting_acv: number | null;
    probability: number | null;
    close_date: string | null;
    is_paid_pilot: boolean;
    last_stage_changed_at: string | null;
    mgmt_forecast_category: string | null;
    cxa_committed_arr: number | null;
    days_in_current_stage: number | null;
    accounts: { id: string; name: string } | null;
    users: { id: string; full_name: string; email: string } | null;
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    const url = request.nextUrl;
    const typeFilter = url.searchParams.get('type');
    const stageFilter = url.searchParams.get('stage');
    const isPaidPilot = url.searchParams.get('is_paid_pilot');
    const acvMin = url.searchParams.get('acv_min');
    const acvMax = url.searchParams.get('acv_max');

    // Fetch ALL open opps via opportunity_splits (paginated)
    const splitRows = await fetchAll<SplitOppRow>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(id, name, stage, acv, reporting_acv, probability, close_date, is_paid_pilot, last_stage_changed_at, mgmt_forecast_category, cxa_committed_arr, days_in_current_stage, accounts(id, name), users!opportunities_owner_user_id_fkey(id, full_name, email))')
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
      return q.order('close_date', { referencedTable: 'opportunities', ascending: false });
    });

    // Flatten split rows into opportunity-like records with split-adjusted ACV
    const opps = splitRows.map((row) => ({
      id: row.opportunities.id,
      name: row.opportunities.name,
      stage: row.opportunities.stage,
      acv: splitAcv(row.opportunities.acv, row.split_percentage),
      reporting_acv: splitAcv(row.opportunities.reporting_acv, row.split_percentage),
      probability: row.opportunities.probability,
      close_date: row.opportunities.close_date,
      is_paid_pilot: row.opportunities.is_paid_pilot,
      last_stage_changed_at: row.opportunities.last_stage_changed_at,
      mgmt_forecast_category: row.opportunities.mgmt_forecast_category,
      cxa_committed_arr: splitAcv(row.opportunities.cxa_committed_arr, row.split_percentage),
      days_in_current_stage: row.opportunities.days_in_current_stage,
      accounts: row.opportunities.accounts,
      users: row.opportunities.users,
    }));

    // Aggregate by stage
    const stageMap: Record<string, {
      deals: number;
      totalAcv: number;
      totalCxaAcv: number;
      totalDaysInStage: number;
      daysCount: number;
    }> = {};

    for (const o of opps) {
      const stage = o.stage || 'Other';
      if (!stageMap[stage]) {
        stageMap[stage] = { deals: 0, totalAcv: 0, totalCxaAcv: 0, totalDaysInStage: 0, daysCount: 0 };
      }
      const s = stageMap[stage];
      s.deals++;
      s.totalAcv += o.acv || 0;
      s.totalCxaAcv += o.cxa_committed_arr || 0;
      if (o.days_in_current_stage != null) {
        s.totalDaysInStage += o.days_in_current_stage;
        s.daysCount++;
      }
    }

    const stages = Object.entries(stageMap).map(([stage, data]) => ({
      stage,
      deals: data.deals,
      totalAcv: data.totalAcv,
      totalCxaAcv: data.totalCxaAcv,
      avgDaysInStage: data.daysCount > 0 ? Math.round(data.totalDaysInStage / data.daysCount) : 0,
    }));

    return NextResponse.json({ data: { stages, opportunities: opps } });
  } catch (error) {
    return handleAuthError(error);
  }
}
