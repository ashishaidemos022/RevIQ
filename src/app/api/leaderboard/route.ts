import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod, getQuarterLabel } from '@/lib/fiscal';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const board = url.searchParams.get('board') || 'revenue'; // revenue | pipeline | pilots | activities
    const period = url.searchParams.get('period') || 'qtd'; // qtd | ytd | mtd | prev_qtd | all_open | custom
    const aeType = url.searchParams.get('ae_type') || 'combined'; // combined | commercial | enterprise
    const region = url.searchParams.get('region') || 'combined'; // combined | AMER | EMEA | APAC
    const managerIdsParam = url.searchParams.get('manager_ids'); // comma-separated manager user IDs, empty = all
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    // Date range
    let startStr: string | undefined;
    let endStr: string | undefined;

    if (period === 'qtd') {
      const start = getQuarterStartDate(fiscalYear, fiscalQuarter);
      const end = getQuarterEndDate(fiscalYear, fiscalQuarter);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'prev_qtd') {
      // Previous fiscal quarter
      let prevQ = fiscalQuarter - 1;
      let prevFY = fiscalYear;
      if (prevQ === 0) { prevQ = 4; prevFY--; }
      const start = getQuarterStartDate(prevFY, prevQ);
      const end = getQuarterEndDate(prevFY, prevQ);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'ytd') {
      const { start, end } = getFiscalYearRange(fiscalYear);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'mtd') {
      const now = new Date();
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endStr = now.toISOString().split('T')[0];
    }

    // Determine which AE roles to include (combined = both commercial + enterprise only)
    const aeRoles =
      aeType === 'commercial' ? ['commercial_ae'] :
      aeType === 'enterprise' ? ['enterprise_ae'] :
      ['commercial_ae', 'enterprise_ae']; // combined

    // If manager_ids provided, resolve their direct reports to filter AEs
    let managerAeIds: string[] | null = null;
    if (managerIdsParam) {
      const managerIds = managerIdsParam.split(',').filter(Boolean);
      if (managerIds.length > 0) {
        const { data: hierarchyRows } = await db
          .from('user_hierarchy')
          .select('user_id')
          .in('manager_id', managerIds)
          .is('effective_to', null);
        managerAeIds = (hierarchyRows ?? []).map(r => r.user_id);
      }
    }

    // Get AEs filtered by role type and optionally region
    let aeQuery = db
      .from('users')
      .select('id, full_name, region')
      .in('role', aeRoles)
      .eq('is_active', true);

    if (region !== 'combined') {
      aeQuery = aeQuery.eq('region', region);
    }

    if (managerAeIds !== null) {
      if (managerAeIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      aeQuery = aeQuery.in('id', managerAeIds);
    }

    const { data: allAEs } = await aeQuery;

    if (!allAEs || allAEs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const aeIds = allAEs.map(ae => ae.id);

    // Resolve manager names for all AEs via user_hierarchy
    const { data: hierarchyRows } = await db
      .from('user_hierarchy')
      .select('user_id, manager_id')
      .in('user_id', aeIds)
      .is('effective_to', null);

    const managerIdSet = new Set((hierarchyRows ?? []).map(r => r.manager_id).filter(Boolean));
    const { data: managerUsers } = managerIdSet.size > 0
      ? await db.from('users').select('id, full_name').in('id', [...managerIdSet])
      : { data: [] };

    const managerNameMap: Record<string, string> = {};
    (managerUsers ?? []).forEach((m: { id: string; full_name: string }) => { managerNameMap[m.id] = m.full_name; });

    const aeManagerMap: Record<string, string | null> = {};
    (hierarchyRows ?? []).forEach((r: { user_id: string; manager_id: string }) => {
      aeManagerMap[r.user_id] = managerNameMap[r.manager_id] ?? null;
    });

    const entries: Array<{
      rank: number;
      user_id: string;
      full_name: string;
      region: string | null;
      manager_name: string | null;
      primary_metric: number;
      secondary_metrics: Record<string, number>;
      secondary_labels?: Record<string, string>;
      is_current_user: boolean;
    }> = [];

    if (board === 'revenue') {
      // Revenue leaderboard via opportunity_splits
      let query = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, sub_type)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', true)
        .in('split_owner_user_id', aeIds);
      if (startStr) query = query.gte('opportunities.close_date', startStr);
      if (endStr) query = query.lte('opportunities.close_date', endStr);
      const { data: splits } = await query;

      // Aggregate per AE (split-adjusted ACV)
      const aeData: Record<string, { acv: number; deals: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (splits || []).forEach((s: any) => {
        const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
        if (!opp) return;
        const id = s.split_owner_user_id;
        if (!aeData[id]) aeData[id] = { acv: 0, deals: 0 };
        aeData[id].acv += splitAcv(opp.acv, s.split_percentage);
        if (opp.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(opp.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (opp.acv || 0) > 0) {
          aeData[id].deals++;
        }
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { acv: 0, deals: 0 };
        const acvWithMultiplier = data.acv;
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: acvWithMultiplier,
          secondary_metrics: {
            acv_closed: data.acv,
            deals_closed: data.deals,
          },
          is_current_user: ae.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pipeline') {
      // Pipeline leaderboard: opportunities created (sf_created_date) within the period via splits
      let query = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, reporting_acv, ai_acv, created_by_sf_id)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .gt('opportunities.acv', 0)
        .in('split_owner_user_id', aeIds);
      if (startStr) query = query.gte('opportunities.sf_created_date', startStr);
      if (endStr) query = query.lte('opportunities.sf_created_date', endStr);
      const { data: splits } = await query;

      // Resolve creator roles via created_by_sf_id → users.salesforce_user_id
      const creatorSfIds = [...new Set((splits || []).map(s => (s.opportunities as any).created_by_sf_id).filter(Boolean))] as string[];
      const creatorRoleMap: Record<string, string> = {};
      if (creatorSfIds.length > 0) {
        for (let i = 0; i < creatorSfIds.length; i += 500) {
          const batch = creatorSfIds.slice(i, i + 500);
          const { data: creators } = await db
            .from('users')
            .select('salesforce_user_id, role')
            .in('salesforce_user_id', batch);
          (creators || []).forEach(u => { creatorRoleMap[u.salesforce_user_id] = u.role; });
        }
      }

      const aeData: Record<string, { total: number; ae_created: number; cxa_acv_created: number; deals: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (splits || []).forEach((s: any) => {
        const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
        if (!opp) return;
        const id = s.split_owner_user_id;
        const acv = splitAcv(opp.reporting_acv || opp.acv, s.split_percentage);
        if (!aeData[id]) aeData[id] = { total: 0, ae_created: 0, cxa_acv_created: 0, deals: 0 };
        aeData[id].total += acv;
        aeData[id].deals++;
        aeData[id].cxa_acv_created += splitAcv(opp.ai_acv, s.split_percentage);
        // AE Created ACV: creator role contains 'ae'
        if (opp.created_by_sf_id) {
          const creatorRole = (creatorRoleMap[opp.created_by_sf_id] || '').toLowerCase();
          if (creatorRole.includes('ae')) {
            aeData[id].ae_created += acv;
          }
        }
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { total: 0, ae_created: 0, cxa_acv_created: 0, deals: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            ae_created: data.ae_created,
            cxa_acv_created: data.cxa_acv_created,
            open_deals: data.deals,
            avg_deal_size: data.deals > 0 ? data.total / data.deals : 0,
          },
          is_current_user: ae.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pilots') {
      // Pilots leaderboard via opportunity_splits
      const { data: splits } = await db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(is_closed_won, is_closed_lost, paid_pilot_start_date, close_date, sf_created_date, created_at)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_paid_pilot', true)
        .in('split_owner_user_id', aeIds);

      const aeData: Record<string, { booked: number; open: number; totalDuration: number; bookedCount: number; numCreated: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (splits || []).forEach((s: any) => {
        const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
        if (!opp) return;
        const id = s.split_owner_user_id;
        if (!aeData[id]) aeData[id] = { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0 };

        if (opp.is_closed_won) {
          aeData[id].booked++;
          aeData[id].bookedCount++;
          if (opp.sf_created_date) {
            const created = new Date(opp.sf_created_date).getTime();
            const end = opp.close_date ? new Date(opp.close_date).getTime() : Date.now();
            aeData[id].totalDuration += Math.floor((end - created) / (1000 * 60 * 60 * 24));
          }
        } else if (!opp.is_closed_lost) {
          aeData[id].open++;
        }

        const createdDate = (opp.sf_created_date || opp.created_at || '').split('T')[0];
        if (createdDate) {
          const inRange = (!startStr || createdDate >= startStr) && (!endStr || createdDate <= endStr);
          if (inRange) {
            aeData[id].numCreated++;
          }
        }
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.booked,
          secondary_metrics: {
            open_pilots: data.open,
            avg_duration: data.bookedCount > 0 ? Math.round(data.totalDuration / data.bookedCount) : 0,
            num_created: data.numCreated,
          },
          is_current_user: ae.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'activities') {
      // Look up SF IDs for AEs to query activity_daily_summary
      const { data: aeSfUsers } = await db
        .from('users')
        .select('id, salesforce_user_id')
        .in('id', aeIds)
        .not('salesforce_user_id', 'is', null);

      const sfIdToUserId = new Map<string, string>();
      (aeSfUsers || []).forEach((u: { id: string; salesforce_user_id: string }) => {
        sfIdToUserId.set(u.salesforce_user_id, u.id);
      });
      const sfIds = [...sfIdToUserId.keys()];

      let actQuery = db
        .from('activity_daily_summary')
        .select('owner_sf_id, activity_count, call_count, email_count, linkedin_count, meeting_count');
      if (sfIds.length > 0) actQuery = actQuery.in('owner_sf_id', sfIds);
      else actQuery = actQuery.in('owner_sf_id', ['__none__']);
      if (startStr) actQuery = actQuery.gte('activity_date', startStr);
      if (endStr) actQuery = actQuery.lte('activity_date', endStr);
      const { data: acts } = await actQuery;

      const aeData: Record<string, { total: number; call: number; email: number; meeting: number; linkedin: number }> = {};
      (acts || []).forEach((a: { owner_sf_id: string; activity_count: number; call_count: number; email_count: number; meeting_count: number; linkedin_count: number }) => {
        const userId = sfIdToUserId.get(a.owner_sf_id);
        if (!userId) return;
        if (!aeData[userId]) aeData[userId] = { total: 0, call: 0, email: 0, meeting: 0, linkedin: 0 };
        aeData[userId].total += a.activity_count || 0;
        aeData[userId].call += a.call_count || 0;
        aeData[userId].email += a.email_count || 0;
        aeData[userId].meeting += a.meeting_count || 0;
        aeData[userId].linkedin += a.linkedin_count || 0;
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { total: 0, call: 0, email: 0, meeting: 0, linkedin: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            calls: data.call,
            emails: data.email,
            meetings: data.meeting,
            linkedin: data.linkedin,
          },
          is_current_user: ae.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    }

    // Assign ranks
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    return handleAuthError(error);
  }
}
