import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';

interface OppRow {
  id: string;
  name: string;
  stage: string | null;
  acv: number | null;
  probability: number | null;
  close_date: string | null;
  is_paid_pilot: boolean;
  last_stage_changed_at: string | null;
  mgmt_forecast_category: string | null;
  cxa_committed_arr: number | null;
  days_in_current_stage: number | null;
  accounts: { id: string; name: string } | null;
  users: { id: string; full_name: string; email: string } | null;
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

    // Fetch ALL open opps with stage info (paginated)
    const opps = await fetchAll<OppRow>(() => {
      let q = db
        .from('opportunities')
        .select('id, name, stage, acv, probability, close_date, is_paid_pilot, last_stage_changed_at, mgmt_forecast_category, cxa_committed_arr, days_in_current_stage, accounts(id, name), users!opportunities_owner_user_id_fkey(id, full_name, email)')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false);
      q = scopedQuery(q, 'owner_user_id', scope);
      if (typeFilter) q = q.in('type', typeFilter.split(','));
      if (stageFilter) q = q.in('stage', stageFilter.split(','));
      if (isPaidPilot === 'true') q = q.eq('is_paid_pilot', true);
      if (isPaidPilot === 'false') q = q.eq('is_paid_pilot', false);
      if (acvMin) q = q.gte('acv', Number(acvMin));
      if (acvMax) q = q.lte('acv', Number(acvMax));
      return q.order('close_date', { ascending: false });
    });

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
