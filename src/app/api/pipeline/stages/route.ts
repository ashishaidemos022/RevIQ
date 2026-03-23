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

    // Fetch ALL open opps with stage info (paginated)
    const opps = await fetchAll<OppRow>(() => {
      let q = db
        .from('opportunities')
        .select('id, name, stage, acv, probability, close_date, is_paid_pilot, last_stage_changed_at, accounts(id, name), users!opportunities_owner_user_id_fkey(id, full_name, email)')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false);
      q = scopedQuery(q, 'owner_user_id', scope);
      if (typeFilter) q = q.eq('type', typeFilter);
      if (stageFilter) q = q.in('stage', stageFilter.split(','));
      if (isPaidPilot === 'true') q = q.eq('is_paid_pilot', true);
      if (isPaidPilot === 'false') q = q.eq('is_paid_pilot', false);
      return q.order('close_date', { ascending: false });
    });

    // Aggregate by stage
    const stageMap: Record<string, {
      deals: number;
      totalAcv: number;
      weightedAcv: number;
      totalDaysInStage: number;
      daysCount: number;
    }> = {};

    const now = Date.now();
    for (const o of opps) {
      const stage = o.stage || 'Other';
      if (!stageMap[stage]) {
        stageMap[stage] = { deals: 0, totalAcv: 0, weightedAcv: 0, totalDaysInStage: 0, daysCount: 0 };
      }
      const s = stageMap[stage];
      s.deals++;
      s.totalAcv += o.acv || 0;
      s.weightedAcv += (o.acv || 0) * ((o.probability || 0) / 100);
      if (o.last_stage_changed_at) {
        s.totalDaysInStage += Math.floor((now - new Date(o.last_stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
        s.daysCount++;
      }
    }

    const stages = Object.entries(stageMap).map(([stage, data]) => ({
      stage,
      deals: data.deals,
      totalAcv: data.totalAcv,
      weightedAcv: data.weightedAcv,
      avgDaysInStage: data.daysCount > 0 ? Math.round(data.totalDaysInStage / data.daysCount) : 0,
    }));

    return NextResponse.json({ data: { stages, opportunities: opps } });
  } catch (error) {
    return handleAuthError(error);
  }
}
