import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { resolveQuotaUserId } from '@/lib/quota-resolver';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
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
      quotaAttainment: number | null;
      annualQuota: number | null;
      activePilots: number | null;
      pilotConversionRate: number | null;
      commissionEarned: number | null;
      totalActivities: number | null;
    }> = {};

    // Helper to apply owner/scope filter
    const applyScope = <T>(query: T, column: string): T => {
      if (ownerId) return (query as any).eq(column, ownerId) as T;
      return scopedQuery(query, column, scope);
    };

    for (const { fy, q } of quarters) {
      const start = getQuarterStartDate(fy, q);
      const end = getQuarterEndDate(fy, q);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const label = `Q${q} FY${fy}`;

      // Closed-won opportunities in quarter — paginated to avoid 1000-row cap
      const closedOpps = await fetchAll<{ acv: number | null }>(() =>
        applyScope(
          db.from('opportunities')
            .select('acv')
            .eq('is_closed_won', true)
            .gte('close_date', startStr)
            .lte('close_date', endStr),
          'owner_user_id'
        )
      );

      const acvClosed = closedOpps.reduce((s, o) => s + (o.acv || 0), 0);
      const dealsClosed = closedOpps.length;

      // These metrics are N/A before FY2027
      let activePilots: number | null = null;
      let pilotConversionRate: number | null = null;
      let commissionEarned: number | null = null;
      let totalActivities: number | null = null;

      if (fy >= 2027) {
        // Active pilots at quarter end — paginated
        const pilots = await fetchAll<{ is_closed_won: boolean; is_closed_lost: boolean }>(() =>
          applyScope(
            db.from('opportunities')
              .select('is_closed_won, is_closed_lost')
              .eq('is_paid_pilot', true)
              .lte('paid_pilot_start_date', endStr),
            'owner_user_id'
          )
        );

        activePilots = pilots.filter(p => !p.is_closed_won && !p.is_closed_lost).length;
        const convertedPilots = pilots.filter(p => p.is_closed_won).length;
        pilotConversionRate = pilots.length > 0
          ? (convertedPilots / pilots.length) * 100
          : 0;

        // Commission earned — paginated
        const comms = await fetchAll<{ commission_amount: number | null }>(() =>
          applyScope(
            db.from('commissions')
              .select('commission_amount')
              .eq('fiscal_year', fy)
              .eq('fiscal_quarter', q)
              .eq('is_finalized', true),
            'user_id'
          )
        );

        commissionEarned = comms.reduce((s, c) => s + (c.commission_amount || 0), 0);

        // Activities — use server-side count (no 1000-row issue)
        let actQuery = db
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .gte('activity_date', startStr)
          .lte('activity_date', endStr);
        actQuery = applyScope(actQuery, 'owner_user_id');
        const { count } = await actQuery;
        totalActivities = count || 0;
      }

      // Quota — use target user's own quota (not sum of subordinates)
      const targetUser = viewAsUser ?? user;
      const quotaUserId = ownerId || await resolveQuotaUserId(targetUser, db);

      let totalQuota = 0;
      if (fy >= 2027) {
        const { data: quotaRows } = await db
          .from('quotas')
          .select('quota_amount')
          .eq('user_id', quotaUserId)
          .eq('fiscal_year', fy)
          .eq('quota_type', 'revenue')
          .is('fiscal_quarter', null);
        totalQuota = (quotaRows || []).reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);
      }

      // Get YTD ACV for attainment (all quarters in same FY up to current quarter)
      let ytdAcvClosed = 0;
      if (fy >= 2027) {
        for (let qi = 1; qi <= q; qi++) {
          const qiStart = getQuarterStartDate(fy, qi);
          const qiEnd = getQuarterEndDate(fy, qi);
          const ytdOpps = await fetchAll<{ acv: number | null }>(() =>
            applyScope(
              db.from('opportunities')
                .select('acv')
                .eq('is_closed_won', true)
                .gte('close_date', qiStart.toISOString().split('T')[0])
                .lte('close_date', qiEnd.toISOString().split('T')[0]),
              'owner_user_id'
            )
          );
          ytdAcvClosed += ytdOpps.reduce((s, o) => s + (o.acv || 0), 0);
        }
      }

      // No quota data before FY2027
      const quotaAttainment = fy < 2027 ? null : (totalQuota > 0 ? (ytdAcvClosed / totalQuota) * 100 : 0);

      results[label] = {
        fiscalYear: fy,
        fiscalQuarter: q,
        label,
        acvClosed,
        dealsClosed,
        quotaAttainment,
        annualQuota: fy < 2027 ? null : totalQuota,
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
