import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';

/**
 * Returns aggregated chart data for the Home dashboard:
 * - ACV by month (closed-won, last 12 months)
 * - Pipeline by stage (open opps)
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

    // Pipeline by stage: open opps with stage and ACV
    const openOpps = await fetchAll<{ stage: string | null; acv: number | null }>(() => {
      let q = db
        .from('opportunities')
        .select('stage, acv')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false);
      return scopedQuery(q, 'owner_user_id', scope);
    });

    // Group by stage
    const pipelineByStage: Record<string, { count: number; acv: number }> = {};
    for (const o of openOpps) {
      const stage = o.stage || 'Other';
      if (!pipelineByStage[stage]) pipelineByStage[stage] = { count: 0, acv: 0 };
      pipelineByStage[stage].count++;
      pipelineByStage[stage].acv += o.acv || 0;
    }

    return NextResponse.json({
      data: {
        acvByMonth,
        pipelineByStage,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
