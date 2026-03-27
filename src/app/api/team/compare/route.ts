import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  requireAuth,
  resolveDataScope,
  resolveViewAs,
  handleAuthError,
  batchedIn,
} from '@/lib/auth/middleware';
import {
  getCurrentFiscalPeriod,
  getRollingQuarters,
  getQuarterStartDate,
  getQuarterEndDate,
} from '@/lib/fiscal';

import { fetchAll } from '@/lib/supabase/fetch-all';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { AE_ROLES } from '@/lib/constants';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

const MANAGER_PLUS = ['leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

interface CompareEntity {
  id: string;
  name: string;
  teamSize?: number;
  quarters: Array<{
    label: string;
    acvClosed: number;
    dealsClosed: number;
    activities: number;
    activePilots: number;
    commissionEarned: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!MANAGER_PLUS.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    const url = request.nextUrl;
    const userIdsParam = url.searchParams.get('userIds');
    const mode = url.searchParams.get('mode') || 'individual'; // individual | team

    if (!userIdsParam) {
      return NextResponse.json({ error: 'userIds parameter required' }, { status: 400 });
    }

    const requestedIds = userIdsParam.split(',').filter(Boolean);

    if (requestedIds.length < 2 || requestedIds.length > 4) {
      return NextResponse.json({ error: 'Must compare 2-4 entities' }, { status: 400 });
    }

    // Validate all requested IDs are within caller's scope
    if (!scope.allAccess) {
      const scopeSet = new Set(scope.userIds);
      for (const id of requestedIds) {
        if (!scopeSet.has(id)) {
          return NextResponse.json({ error: 'Access denied: user not in your org scope' }, { status: 403 });
        }
      }
    }

    // Get 4 rolling quarters
    const quarters = getRollingQuarters(4);

    // Resolve which user IDs to query for each entity
    const entities: CompareEntity[] = [];

    for (const entityId of requestedIds) {
      // Get entity name
      const { data: entityUser } = await db
        .from('users')
        .select('id, full_name')
        .eq('id', entityId)
        .single();

      if (!entityUser) continue;

      let memberIds: string[];
      let teamSize: number | undefined;

      if (mode === 'team') {
        // Resolve full subtree for this manager, filtered to AEs/PBMs
        const { getOrgSubtree } = await import('@/lib/supabase/queries/hierarchy');
        const subtreeIds = await getOrgSubtree(entityId);
        if (subtreeIds.length > 0) {
          const { data: aeMembers } = await db
            .from('users')
            .select('id')
            .in('id', subtreeIds)
            .in('role', [...AE_ROLES, 'pbm'])
            .eq('is_active', true);
          memberIds = (aeMembers || []).map(m => m.id);
        } else {
          memberIds = [entityId];
        }
        teamSize = memberIds.length;
      } else {
        memberIds = [entityId];
      }

      // Fetch rolling quarter data for this entity's members
      const quarterData: CompareEntity['quarters'] = [];

      for (const q of quarters) {
        const startStr = getQuarterStartDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0];
        const endStr = getQuarterEndDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0];

        // Closed-won ACV via opportunity_splits
        const closedSplits = await fetchAll<{
          split_owner_user_id: string;
          split_percentage: number | string;
          opportunities: { acv: number | null; sub_type: string | null };
        }>(() =>
          batchedIn(
            db.from('opportunity_splits')
              .select('split_owner_user_id, split_percentage, opportunities!inner(acv, sub_type)')
              .eq('split_type', REVENUE_SPLIT_TYPE)
              .eq('opportunities.is_closed_won', true)
              .gte('opportunities.close_date', startStr)
              .lte('opportunities.close_date', endStr),
            'split_owner_user_id',
            memberIds
          )
        );

        const acvClosed = closedSplits.reduce((s, row) => s + splitAcv(row.opportunities.acv, row.split_percentage), 0);
        const dealsClosed = closedSplits.filter(
          row => row.opportunities.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(row.opportunities.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (row.opportunities.acv || 0) > 0
        ).length;

        // Activities count from activity_daily_summary via AE SF IDs only
        const { data: memberSfUsers } = await db
          .from('users')
          .select('salesforce_user_id')
          .in('id', memberIds)
          .in('role', AE_ROLES)
          .not('salesforce_user_id', 'is', null);
        const memberSfIds = (memberSfUsers || []).map((u: { salesforce_user_id: string }) => u.salesforce_user_id);

        let actCount = 0;
        if (memberSfIds.length > 0) {
          const actRows = await fetchAll<{ activity_count: number }>(() =>
            batchedIn(
              db.from('activity_daily_summary')
                .select('activity_count')
                .gte('activity_date', startStr)
                .lte('activity_date', endStr),
              'owner_sf_id',
              memberSfIds
            )
          );
          actCount = actRows.reduce((s, r) => s + (r.activity_count || 0), 0);
        }

        // Active pilots via opportunity_splits
        const pilotSplits = await fetchAll<{
          split_owner_user_id: string;
          opportunities: { is_closed_won: boolean; is_closed_lost: boolean };
        }>(() =>
          batchedIn(
            db.from('opportunity_splits')
              .select('split_owner_user_id, opportunities!inner(is_closed_won, is_closed_lost)')
              .eq('split_type', REVENUE_SPLIT_TYPE)
              .eq('opportunities.is_paid_pilot', true)
              .lte('opportunities.paid_pilot_start_date', endStr),
            'split_owner_user_id',
            memberIds
          )
        );
        const activePilots = pilotSplits.filter(p => !p.opportunities.is_closed_won && !p.opportunities.is_closed_lost).length;

        // Commission earned
        const comms = await fetchAll<{ commission_amount: number | null }>(() =>
          batchedIn(
            db.from('commissions')
              .select('commission_amount')
              .eq('fiscal_year', q.fiscalYear)
              .eq('fiscal_quarter', q.fiscalQuarter)
              .eq('is_finalized', true),
            'user_id',
            memberIds
          )
        );
        const commissionEarned = comms.reduce((s, c) => s + (c.commission_amount || 0), 0);

        quarterData.push({
          label: q.label,
          acvClosed,
          dealsClosed,
          activities: actCount || 0,
          activePilots,
          commissionEarned,
        });
      }

      entities.push({
        id: entityId,
        name: entityUser.full_name,
        ...(teamSize !== undefined && { teamSize }),
        quarters: quarterData,
      });
    }

    return NextResponse.json({ data: { entities } });
  } catch (error) {
    return handleAuthError(error);
  }
}
