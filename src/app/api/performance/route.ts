import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const scope = await resolveDataScope(user);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    // Expect quarters as JSON: [{ fy: 2027, q: 1 }, ...]
    const quartersParam = url.searchParams.get('quarters');
    const ownerId = url.searchParams.get('owner_user_id');

    if (!quartersParam) {
      return NextResponse.json({ error: 'quarters parameter required' }, { status: 400 });
    }

    const quarters: Array<{ fy: number; q: number }> = JSON.parse(quartersParam);
    const results: Record<string, {
      fiscalYear: number;
      fiscalQuarter: number;
      label: string;
      acvClosed: number;
      dealsClosed: number;
      quotaAttainment: number;
      activePilots: number;
      pilotConversionRate: number;
      commissionEarned: number;
      totalActivities: number;
    }> = {};

    for (const { fy, q } of quarters) {
      const start = getQuarterStartDate(fy, q);
      const end = getQuarterEndDate(fy, q);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const label = `Q${q} FY${fy}`;

      // Closed-won opportunities in quarter
      let oppsQuery = db
        .from('opportunities')
        .select('acv, is_paid_pilot, is_closed_won')
        .eq('is_closed_won', true)
        .gte('close_date', startStr)
        .lte('close_date', endStr);
      if (ownerId) oppsQuery = oppsQuery.eq('owner_user_id', ownerId);
      else if (!scope.allAccess) oppsQuery = oppsQuery.in('owner_user_id', scope.userIds);
      const { data: closedOpps } = await oppsQuery;

      const acvClosed = (closedOpps || []).reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
      const dealsClosed = (closedOpps || []).length;

      // Active pilots at quarter end
      let pilotsQuery = db
        .from('opportunities')
        .select('is_closed_won, is_closed_lost, is_paid_pilot')
        .eq('is_paid_pilot', true)
        .lte('paid_pilot_start_date', endStr);
      if (ownerId) pilotsQuery = pilotsQuery.eq('owner_user_id', ownerId);
      else if (!scope.allAccess) pilotsQuery = pilotsQuery.in('owner_user_id', scope.userIds);
      const { data: pilots } = await pilotsQuery;

      const activePilots = (pilots || []).filter(
        (p: { is_closed_won: boolean; is_closed_lost: boolean }) => !p.is_closed_won && !p.is_closed_lost
      ).length;
      const convertedPilots = (pilots || []).filter(
        (p: { is_closed_won: boolean }) => p.is_closed_won
      ).length;
      const pilotConversionRate = (pilots || []).length > 0
        ? (convertedPilots / (pilots || []).length) * 100
        : 0;

      // Commission earned
      let commQuery = db
        .from('commissions')
        .select('commission_amount')
        .eq('fiscal_year', fy)
        .eq('fiscal_quarter', q)
        .eq('is_finalized', true);
      if (ownerId) commQuery = commQuery.eq('user_id', ownerId);
      else if (!scope.allAccess) commQuery = commQuery.in('user_id', scope.userIds);
      const { data: comms } = await commQuery;

      const commissionEarned = (comms || []).reduce(
        (s: number, c: { commission_amount: number | null }) => s + (c.commission_amount || 0), 0
      );

      // Activities
      let actQuery = db
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .gte('activity_date', startStr)
        .lte('activity_date', endStr);
      if (ownerId) actQuery = actQuery.eq('owner_user_id', ownerId);
      else if (!scope.allAccess) actQuery = actQuery.in('owner_user_id', scope.userIds);
      const { count: totalActivities } = await actQuery;

      // Quota for attainment
      let quotaQuery = db
        .from('quotas')
        .select('quota_amount')
        .eq('fiscal_year', fy)
        .eq('quota_type', 'revenue')
        .is('fiscal_quarter', null);
      if (ownerId) quotaQuery = quotaQuery.eq('user_id', ownerId);
      else if (!scope.allAccess) quotaQuery = quotaQuery.in('user_id', scope.userIds);
      const { data: quotas } = await quotaQuery;

      const totalQuota = (quotas || []).reduce(
        (s: number, q: { quota_amount: number }) => s + q.quota_amount, 0
      );

      // Get YTD ACV for attainment (all quarters in same FY up to current quarter)
      let ytdAcvClosed = 0;
      for (let qi = 1; qi <= q; qi++) {
        const qiStart = getQuarterStartDate(fy, qi);
        const qiEnd = getQuarterEndDate(fy, qi);
        let ytdQuery = db
          .from('opportunities')
          .select('acv')
          .eq('is_closed_won', true)
          .gte('close_date', qiStart.toISOString().split('T')[0])
          .lte('close_date', qiEnd.toISOString().split('T')[0]);
        if (ownerId) ytdQuery = ytdQuery.eq('owner_user_id', ownerId);
        else if (!scope.allAccess) ytdQuery = ytdQuery.in('owner_user_id', scope.userIds);
        const { data: ytdOpps } = await ytdQuery;
        ytdAcvClosed += (ytdOpps || []).reduce(
          (s: number, o: { acv: number | null }) => s + (o.acv || 0), 0
        );
      }

      const quotaAttainment = totalQuota > 0 ? (ytdAcvClosed / totalQuota) * 100 : 0;

      results[label] = {
        fiscalYear: fy,
        fiscalQuarter: q,
        label,
        acvClosed,
        dealsClosed,
        quotaAttainment,
        activePilots,
        pilotConversionRate,
        commissionEarned,
        totalActivities: totalActivities || 0,
      };
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleAuthError(error);
  }
}
