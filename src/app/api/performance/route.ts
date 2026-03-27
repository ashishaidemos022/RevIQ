import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery, batchedIn } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { resolveQuotaUserId } from '@/lib/quota-resolver';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { AE_ROLES } from '@/lib/constants';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

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
      weeklyAcv: number[];
      acvDeals: { id: string; name: string; owner: string; acv: number }[];
      dealsClosedDeals: { id: string; name: string; owner: string; acv: number }[];
    }> = {};

    // Helper to apply owner/scope filter on split_owner_user_id
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

      // Closed-won opportunities in quarter via splits — paginated to avoid 1000-row cap
      const closedSplits = await fetchAll<{
        split_owner_user_id: string;
        split_percentage: number;
        opportunities: {
          id: string;
          name: string | null;
          acv: number | null;
          ai_acv: number | null;
          sub_type: string | null;
          close_date: string | null;
          users: { full_name: string } | null;
        };
      }>(() =>
        applyScope(
          db.from('opportunity_splits')
            .select('split_owner_user_id, split_percentage, opportunities!inner(id, name, acv, ai_acv, sub_type, close_date, users:users!opportunities_owner_user_id_fkey(full_name))')
            .eq('split_type', REVENUE_SPLIT_TYPE)
            .eq('opportunities.is_closed_won', true)
            .gte('opportunities.close_date', startStr)
            .lte('opportunities.close_date', endStr),
          'split_owner_user_id'
        )
      );

      const acvClosed = closedSplits.reduce((s, row) => s + splitAcv(row.opportunities.acv, row.split_percentage), 0);

      // Weekly cumulative ACV for pacing chart (13 weeks per quarter)
      const weeklyAcv: number[] = new Array(13).fill(0);
      for (const row of closedSplits) {
        if (!row.opportunities.close_date) continue;
        const dayInQ = Math.floor((new Date(row.opportunities.close_date).getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.min(Math.floor(dayInQ / 7), 12);
        weeklyAcv[weekIdx] += splitAcv(row.opportunities.acv, row.split_percentage);
      }
      // Convert to cumulative
      for (let i = 1; i < 13; i++) {
        weeklyAcv[i] += weeklyAcv[i - 1];
      }
      const cxaClosed = closedSplits.reduce((s, row) => s + splitAcv(row.opportunities.ai_acv, row.split_percentage), 0);
      // Deals Closed: only count deals with a valid sub_type AND acv > 0
      const countableSplits = closedSplits.filter(
        row => row.opportunities.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(row.opportunities.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (row.opportunities.acv || 0) > 0
      );
      const dealsClosed = countableSplits.length;
      const dealsClosedWithCxa = countableSplits.filter(row => (row.opportunities.ai_acv || 0) > 0).length;

      // Deal-level data for drill-down
      const acvDeals = closedSplits
        .map(row => ({ id: row.opportunities.id, name: row.opportunities.name || 'Unnamed', owner: row.opportunities.users?.full_name || 'Unknown', acv: splitAcv(row.opportunities.acv, row.split_percentage) }))
        .sort((a, b) => b.acv - a.acv);
      const dealsClosedDeals = countableSplits
        .map(row => ({ id: row.opportunities.id, name: row.opportunities.name || 'Unnamed', owner: row.opportunities.users?.full_name || 'Unknown', acv: splitAcv(row.opportunities.acv, row.split_percentage) }))
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
        // Booked pilots in quarter — paid pilots with a booked stage and close date in quarter, via splits
        const pilotSplits = await fetchAll<{
          split_owner_user_id: string;
          split_percentage: number;
          opportunities: { stage: string };
        }>(() =>
          applyScope(
            db.from('opportunity_splits')
              .select('split_owner_user_id, split_percentage, opportunities!inner(stage)')
              .eq('split_type', REVENUE_SPLIT_TYPE)
              .eq('opportunities.is_paid_pilot', true)
              .in('opportunities.stage', BOOKED_PILOT_STAGES)
              .gte('opportunities.close_date', startStr)
              .lte('opportunities.close_date', endStr),
            'split_owner_user_id'
          )
        );

        bookedPilots = pilotSplits.length;

        // Commission earned — paginated (stays on commissions table, scoped by user_id)
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

      // Get YTD ACV for attainment (all quarters in same FY up to current quarter) via splits
      let ytdAcvClosed = 0;
      if (fy >= 2027) {
        for (let qi = 1; qi <= q; qi++) {
          const qiStart = getQuarterStartDate(fy, qi);
          const qiEnd = getQuarterEndDate(fy, qi);
          const ytdSplits = await fetchAll<{
            split_percentage: number;
            opportunities: { acv: number | null };
          }>(() =>
            applyScope(
              db.from('opportunity_splits')
                .select('split_percentage, opportunities!inner(acv)')
                .eq('split_type', REVENUE_SPLIT_TYPE)
                .eq('opportunities.is_closed_won', true)
                .gte('opportunities.close_date', qiStart.toISOString().split('T')[0])
                .lte('opportunities.close_date', qiEnd.toISOString().split('T')[0]),
              'split_owner_user_id'
            )
          );
          ytdAcvClosed += ytdSplits.reduce((s, row) => s + splitAcv(row.opportunities.acv, row.split_percentage), 0);
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
        weeklyAcv,
        acvDeals,
        dealsClosedDeals,
      };
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleAuthError(error);
  }
}
