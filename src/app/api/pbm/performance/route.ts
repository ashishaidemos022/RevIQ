import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { resolveQuotaUserId } from '@/lib/quota-resolver';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const quartersParam = url.searchParams.get('quarters');
    if (!quartersParam) {
      return NextResponse.json({ error: 'quarters parameter required' }, { status: 400 });
    }

    const quarters: Array<{ fy: number; q: number }> = JSON.parse(quartersParam);

    // Resolve PBM user IDs
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      const empty: Record<string, unknown> = {};
      for (const { fy, q } of quarters) {
        const label = `Q${q} FY${fy}`;
        empty[label] = {
          fiscalYear: fy, fiscalQuarter: q, label,
          acvClosed: 0, dealsClosed: 0, quotaAttainment: 0,
          activePilots: 0, pilotConversionRate: 0,
          commissionEarned: 0, totalActivities: 0,
        };
      }
      return NextResponse.json({ data: empty });
    }

    // Resolve credited opportunities once (all-time)
    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
    const creditedOppSfIds = [...creditMap.keys()];

    // Fetch all credited opportunities with relevant fields
    let allCreditedOpps: Array<{
      salesforce_opportunity_id: string;
      acv: string | number | null;
      close_date: string | null;
      is_closed_won: boolean;
      is_closed_lost: boolean;
      is_paid_pilot: boolean;
      paid_pilot_start_date: string | null;
    }> = [];

    for (let i = 0; i < creditedOppSfIds.length; i += 500) {
      const batch = creditedOppSfIds.slice(i, i + 500);
      const { data: opps } = await db
        .from('opportunities')
        .select('salesforce_opportunity_id, acv, close_date, is_closed_won, is_closed_lost, is_paid_pilot, paid_pilot_start_date')
        .in('salesforce_opportunity_id', batch);
      if (opps) allCreditedOpps = allCreditedOpps.concat(opps);
    }

    const results: Record<string, unknown> = {};

    for (const { fy, q } of quarters) {
      const start = getQuarterStartDate(fy, q);
      const end = getQuarterEndDate(fy, q);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const label = `Q${q} FY${fy}`;

      // ACV Closed in quarter
      const closedInQ = allCreditedOpps.filter(
        o => o.is_closed_won && o.close_date && o.close_date >= startStr && o.close_date <= endStr
      );
      const acvClosed = closedInQ.reduce((s, o) => s + (parseFloat(String(o.acv)) || 0), 0);
      const dealsClosed = closedInQ.length;

      // These metrics are N/A before FY2027
      let activePilots: number | null = null;
      let pilotConversionRate: number | null = null;
      let commissionEarned: number | null = null;
      let totalActivities: number | null = null;

      if (fy >= 2027) {
        // Active pilots at quarter end
        const pilotsAtEnd = allCreditedOpps.filter(
          o => o.is_paid_pilot && o.paid_pilot_start_date && o.paid_pilot_start_date <= endStr
        );
        activePilots = pilotsAtEnd.filter(o => !o.is_closed_won && !o.is_closed_lost).length;
        const convertedPilots = pilotsAtEnd.filter(o => o.is_closed_won).length;
        pilotConversionRate = pilotsAtEnd.length > 0 ? (convertedPilots / pilotsAtEnd.length) * 100 : 0;

        // Commission earned
        if (pbmLocalIds.length > 0) {
          const { data: comms } = await db
            .from('commissions')
            .select('commission_amount')
            .in('user_id', pbmLocalIds)
            .eq('fiscal_year', fy)
            .eq('fiscal_quarter', q)
            .eq('is_finalized', true);
          commissionEarned = (comms || []).reduce(
            (s, c) => s + (parseFloat(c.commission_amount) || 0), 0
          );
        } else {
          commissionEarned = 0;
        }

        // Activities
        if (pbmLocalIds.length > 0) {
          const { count } = await db
            .from('activities')
            .select('id', { count: 'exact', head: true })
            .in('owner_user_id', pbmLocalIds)
            .gte('activity_date', startStr)
            .lte('activity_date', endStr);
          totalActivities = count || 0;
        } else {
          totalActivities = 0;
        }
      }

      // Quota attainment — YTD ACV / annual quota
      let ytdAcvClosed = 0;
      for (let qi = 1; qi <= q; qi++) {
        const qiStart = getQuarterStartDate(fy, qi).toISOString().split('T')[0];
        const qiEnd = getQuarterEndDate(fy, qi).toISOString().split('T')[0];
        ytdAcvClosed += allCreditedOpps
          .filter(o => o.is_closed_won && o.close_date && o.close_date >= qiStart && o.close_date <= qiEnd)
          .reduce((s, o) => s + (parseFloat(String(o.acv)) || 0), 0);
      }

      // Quota — use target user's own quota (not sum of subordinates)
      let quotaAttainment: number | null = fy < 2027 ? null : 0;
      let annualQuota: number | null = fy < 2027 ? null : 0;
      if (fy >= 2027) {
        const quotaUserId = await resolveQuotaUserId(targetUser, db);
        const { data: quotas } = await db
          .from('quotas')
          .select('quota_amount')
          .eq('user_id', quotaUserId)
          .eq('fiscal_year', fy)
          .eq('quota_type', 'revenue')
          .is('fiscal_quarter', null);
        const totalQuota = (quotas || []).reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);
        annualQuota = totalQuota;
        if (totalQuota > 0) quotaAttainment = (ytdAcvClosed / totalQuota) * 100;
      }

      results[label] = {
        fiscalYear: fy,
        fiscalQuarter: q,
        label,
        acvClosed,
        dealsClosed,
        quotaAttainment,
        annualQuota,
        activePilots,
        pilotConversionRate,
        commissionEarned,
        totalActivities,
      };
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleAuthError(error);
  }
}

async function resolvePbmUserIds(
  targetUser: { user_id: string; role: string },
  db: ReturnType<typeof getSupabaseClient>
): Promise<string[]> {
  const FULL_ACCESS_ROLES = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

  if (targetUser.role === 'pbm') {
    return [targetUser.user_id];
  }

  if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
    const { data } = await db.from('users').select('id').eq('role', 'pbm').eq('is_active', true);
    return (data || []).map(u => u.id);
  }

  const subtree = await getOrgSubtree(targetUser.user_id);
  const allIds = [targetUser.user_id, ...subtree];
  const { data } = await db.from('users').select('id').eq('role', 'pbm').eq('is_active', true).in('id', allIds);
  return (data || []).map(u => u.id);
}
