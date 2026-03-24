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
import { getDirectReports } from '@/lib/supabase/queries/hierarchy';
import { fetchAll } from '@/lib/supabase/fetch-all';

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
        // Resolve direct reports for this manager
        const reports = await getDirectReports(entityId);
        memberIds = reports.length > 0 ? reports : [entityId];
        teamSize = reports.length;
      } else {
        memberIds = [entityId];
      }

      // Fetch rolling quarter data for this entity's members
      const quarterData: CompareEntity['quarters'] = [];

      for (const q of quarters) {
        const startStr = getQuarterStartDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0];
        const endStr = getQuarterEndDate(q.fiscalYear, q.fiscalQuarter).toISOString().split('T')[0];

        // Closed-won ACV
        const closedOpps = await fetchAll<{ acv: number | null }>(() =>
          batchedIn(
            db.from('opportunities')
              .select('acv')
              .eq('is_closed_won', true)
              .gte('close_date', startStr)
              .lte('close_date', endStr),
            'owner_user_id',
            memberIds
          )
        );

        const acvClosed = closedOpps.reduce((s, o) => s + (o.acv || 0), 0);
        const dealsClosed = closedOpps.length;

        // Activities count
        let actQuery = db
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .gte('activity_date', startStr)
          .lte('activity_date', endStr);
        actQuery = batchedIn(actQuery, 'owner_user_id', memberIds);
        const { count: actCount } = await actQuery;

        // Active pilots
        const pilots = await fetchAll<{ is_closed_won: boolean; is_closed_lost: boolean }>(() =>
          batchedIn(
            db.from('opportunities')
              .select('is_closed_won, is_closed_lost')
              .eq('is_paid_pilot', true)
              .lte('paid_pilot_start_date', endStr),
            'owner_user_id',
            memberIds
          )
        );
        const activePilots = pilots.filter(p => !p.is_closed_won && !p.is_closed_lost).length;

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
