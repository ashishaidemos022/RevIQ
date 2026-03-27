import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery, batchedIn } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { resolveQuotaUserId } from '@/lib/quota-resolver';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { AE_ROLES } from '@/lib/constants';

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
      cxaClosed: number;
      dealsClosedWithCxa: number;
      quotaAttainment: number | null;
      annualQuota: number | null;
      bookedPilots: number | null;
      commissionEarned: number | null;
      totalActivities: number | null;
      acvDeals: { id: string; name: string; owner: string; acv: number }[];
      dealsClosedDeals: { id: string; name: string; owner: string; acv: number }[];
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
      const closedOpps = await fetchAll<{
        id: string;
        name: string | null;
        acv: number | null;
        ai_acv: number | null;
        sub_type: string | null;
        users: { full_name: string } | null;
      }>(() =>
        applyScope(
          db.from('opportunities')
            .select('id, name, acv, ai_acv, sub_type, users!opportunities_owner_user_id_fkey(full_name)')
            .eq('is_closed_won', true)
            .gte('close_date', startStr)
            .lte('close_date', endStr),
          'owner_user_id'
        )
      );

      const acvClosed = closedOpps.reduce((s, o) => s + (o.acv || 0), 0);
      const cxaClosed = closedOpps.reduce((s, o) => s + (o.ai_acv || 0), 0);
      // Deals Closed: only count deals with a valid sub_type AND acv > 0
      const countableOpps = closedOpps.filter(
        o => o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (o.acv || 0) > 0
      );
      const dealsClosed = countableOpps.length;
      const dealsClosedWithCxa = countableOpps.filter(o => (o.ai_acv || 0) > 0).length;

      // Deal-level data for drill-down
      const acvDeals = closedOpps
        .map(o => ({ id: o.id, name: o.name || 'Unnamed', owner: o.users?.full_name || 'Unknown', acv: o.acv || 0 }))
        .sort((a, b) => b.acv - a.acv);
      const dealsClosedDeals = countableOpps
        .map(o => ({ id: o.id, name: o.name || 'Unnamed', owner: o.users?.full_name || 'Unknown', acv: o.acv || 0 }))
        .sort((a, b) => b.acv - a.acv);

      // These metrics are N/A before FY2027
      let bookedPilots: number | null = null;
      let commissionEarned: number | null = null;
      let totalActivities: number | null = null;

      const BOOKED_PILOT_STAGES = [
        'Stage 8-Closed Won: Finance',
        'Stage 7-Closed Won',
        'Stage 6-Closed-Won: Finance Approved',
        'Stage 5-Closed Won',
      ];

      if (fy >= 2027) {
        // Booked pilots in quarter — paid pilots with a booked stage and close date in quarter
        const pilots = await fetchAll<{ stage: string }>(() =>
          applyScope(
            db.from('opportunities')
              .select('stage')
              .eq('is_paid_pilot', true)
              .in('stage', BOOKED_PILOT_STAGES)
              .gte('close_date', startStr)
              .lte('close_date', endStr),
            'owner_user_id'
          )
        );

        bookedPilots = pilots.length;

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

        // Activities from activity_daily_summary via AE SF IDs only
        if (ownerId) {
          // Verify the owner is an AE before counting activities
          const { data: ownerSfRow } = await db
            .from('users')
            .select('salesforce_user_id, role')
            .eq('id', ownerId)
            .single();
          if (ownerSfRow?.salesforce_user_id && AE_ROLES.includes(ownerSfRow.role as typeof AE_ROLES[number])) {
            const actRows = await fetchAll<{ activity_count: number }>(() =>
              db.from('activity_daily_summary')
                .select('activity_count')
                .eq('owner_sf_id', ownerSfRow.salesforce_user_id)
                .gte('activity_date', startStr)
                .lte('activity_date', endStr)
            );
            totalActivities = actRows.reduce((s, r) => s + (r.activity_count || 0), 0);
          }
        } else {
          // Scoped query — resolve only AE SF IDs in scope
          const scopeUserIds = scope.allAccess ? null : scope.userIds;
          let sfQuery = db.from('users').select('salesforce_user_id').in('role', AE_ROLES).not('salesforce_user_id', 'is', null);
          if (scopeUserIds) sfQuery = sfQuery.in('id', scopeUserIds);
          const { data: sfRows } = await sfQuery;
          const sfIds = (sfRows || []).map((u: { salesforce_user_id: string }) => u.salesforce_user_id);
          if (sfIds.length > 0) {
            const actRows = await fetchAll<{ activity_count: number }>(() =>
              batchedIn(
                db.from('activity_daily_summary')
                  .select('activity_count')
                  .gte('activity_date', startStr)
                  .lte('activity_date', endStr),
                'owner_sf_id',
                sfIds
              )
            );
            totalActivities = actRows.reduce((s, r) => s + (r.activity_count || 0), 0);
          }
        }
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
        cxaClosed,
        dealsClosedWithCxa,
        quotaAttainment,
        annualQuota: fy < 2027 ? null : totalQuota,
        bookedPilots,
        commissionEarned,
        totalActivities,
        acvDeals,
        dealsClosedDeals,
      };
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleAuthError(error);
  }
}
