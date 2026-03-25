import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery, batchedIn } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { AE_ROLES } from '@/lib/constants';

const MANAGER_PLUS = ['leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!MANAGER_PLUS.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];

    // Get AEs and PBMs in scope
    let usersQuery = db
      .from('users')
      .select('id, full_name, email, role, region, salesforce_user_id')
      .in('role', ['commercial_ae', 'enterprise_ae', 'pbm'])
      .eq('is_active', true);

    usersQuery = scopedQuery(usersQuery, 'id', scope);

    const { data: aes } = await usersQuery;
    if (!aes || aes.length === 0) {
      return NextResponse.json({ data: { aes: [], summary: { acvClosedQTD: 0, avgAttainment: 0, activePilots: 0, activitiesQTD: 0 } } });
    }

    const allMembers = aes;
    const allIds = allMembers.map(m => m.id);
    const aeMembers = allMembers.filter(m => AE_ROLES.includes(m.role as typeof AE_ROLES[number]));
    const pbmMembers = allMembers.filter(m => m.role === 'pbm');
    const aeIds = aeMembers.map(ae => ae.id);
    const pbmIds = pbmMembers.map(p => p.id);

    // Get opportunities for AEs (owner-based) — paginated to avoid 1000-row cap
    const allOpps = aeIds.length > 0
      ? await fetchAll<{ owner_user_id: string | null; acv: number | null; is_closed_won: boolean; is_closed_lost: boolean; is_paid_pilot: boolean; close_date: string | null }>(() =>
          batchedIn(
            db.from('opportunities').select('owner_user_id, acv, is_closed_won, is_closed_lost, is_paid_pilot, close_date'),
            'owner_user_id',
            aeIds
          )
        )
      : [];

    // Resolve PBM credited opportunities
    const pbmAcvMap: Record<string, { qtd: number; ytd: number }> = {};
    if (pbmIds.length > 0) {
      const pbmSfIdMap = await getPbmSfIdMap(pbmIds);
      const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
      const creditedOppSfIds = [...creditMap.keys()];

      // Build reverse map: pbm_local_id → set of opp SF IDs
      const pbmOppSfIds = new Map<string, Set<string>>();
      creditMap.forEach((credits, oppSfId) => {
        credits.forEach(c => {
          if (!pbmOppSfIds.has(c.pbm_local_id)) pbmOppSfIds.set(c.pbm_local_id, new Set());
          pbmOppSfIds.get(c.pbm_local_id)!.add(oppSfId);
        });
      });

      // Fetch opp details for all credited opps
      if (creditedOppSfIds.length > 0) {
        const oppDetails = new Map<string, { acv: number; close_date: string; is_closed_won: boolean }>();
        for (let i = 0; i < creditedOppSfIds.length; i += 500) {
          const batch = creditedOppSfIds.slice(i, i + 500);
          const { data: opps } = await db
            .from('opportunities')
            .select('salesforce_opportunity_id, acv, close_date, is_closed_won')
            .eq('is_closed_won', true)
            .in('salesforce_opportunity_id', batch);
          (opps || []).forEach(o => {
            oppDetails.set(o.salesforce_opportunity_id, {
              acv: parseFloat(o.acv) || 0,
              close_date: o.close_date || '',
              is_closed_won: o.is_closed_won,
            });
          });
        }

        // Compute per-PBM ACV
        pbmOppSfIds.forEach((oppSfIdSet, pbmLocalId) => {
          let qtd = 0;
          let ytd = 0;
          oppSfIdSet.forEach(sfId => {
            const d = oppDetails.get(sfId);
            if (!d || !d.is_closed_won) return;
            if (d.close_date >= fyStartStr && d.close_date <= fyEndStr) ytd += d.acv;
            if (d.close_date >= qStartStr && d.close_date <= qEndStr) qtd += d.acv;
          });
          pbmAcvMap[pbmLocalId] = { qtd, ytd };
        });
      }
    }

    // Get quotas (annual + current quarter) — paginated
    const quotas = await fetchAll<{ user_id: string; quota_amount: number; fiscal_quarter: number | null }>(() =>
      batchedIn(
        db.from('quotas').select('user_id, quota_amount, fiscal_quarter').eq('fiscal_year', fiscalYear).eq('quota_type', 'revenue'),
        'user_id',
        allIds
      )
    );

    // Get activities QTD from activity_daily_summary via SF IDs
    const aeSfIdToUserId = new Map<string, string>();
    aeMembers.forEach((m: { id: string; salesforce_user_id?: string | null }) => {
      if (m.salesforce_user_id) aeSfIdToUserId.set(m.salesforce_user_id, m.id);
    });
    const aeSfIds = [...aeSfIdToUserId.keys()];

    const actSummaries = aeSfIds.length > 0
      ? await fetchAll<{ owner_sf_id: string; activity_count: number }>(() =>
          batchedIn(
            db.from('activity_daily_summary').select('owner_sf_id, activity_count').gte('activity_date', qStartStr).lte('activity_date', qEndStr),
            'owner_sf_id',
            aeSfIds
          )
        )
      : [];

    // Get commissions QTD — paginated
    const comms = await fetchAll<{ user_id: string; commission_amount: number | null }>(() =>
      batchedIn(
        db.from('commissions').select('user_id, commission_amount, is_finalized').eq('fiscal_year', fiscalYear).eq('fiscal_quarter', fiscalQuarter),
        'user_id',
        allIds
      )
    );

    // Build shared lookup maps
    const annualQuotaMap: Record<string, number> = {};
    const quarterlyQuotaMap: Record<string, number> = {};
    quotas.forEach((q) => {
      if (q.fiscal_quarter === null || q.fiscal_quarter === undefined) {
        annualQuotaMap[q.user_id] = (annualQuotaMap[q.user_id] || 0) + (q.quota_amount || 0);
      } else if (q.fiscal_quarter === fiscalQuarter) {
        quarterlyQuotaMap[q.user_id] = (quarterlyQuotaMap[q.user_id] || 0) + (q.quota_amount || 0);
      }
    });

    const activityCount: Record<string, number> = {};
    actSummaries.forEach((a) => {
      const userId = aeSfIdToUserId.get(a.owner_sf_id);
      if (userId) activityCount[userId] = (activityCount[userId] || 0) + (a.activity_count || 0);
    });

    const commMap: Record<string, number> = {};
    comms.forEach((c) => {
      commMap[c.user_id] = (commMap[c.user_id] || 0) + (c.commission_amount || 0);
    });

    const aeData = allMembers.map(member => {
      let acvClosedQTD: number;
      let acvClosedYTD: number;
      let activePilots: number;

      if (member.role === 'pbm') {
        // PBM: use credited opps
        const pbmAcv = pbmAcvMap[member.id] || { qtd: 0, ytd: 0 };
        acvClosedQTD = pbmAcv.qtd;
        acvClosedYTD = pbmAcv.ytd;
        activePilots = 0; // TODO: resolve PBM pilot count via credit paths if needed
      } else {
        // AE: use owner-based opps
        const aeOpps = allOpps.filter((o: { owner_user_id: string | null }) => o.owner_user_id === member.id);
        const closedWonQTD = aeOpps.filter((o: { is_closed_won: boolean; close_date: string | null }) =>
          o.is_closed_won && o.close_date && o.close_date >= qStartStr && o.close_date <= qEndStr
        );
        const closedWonYTD = aeOpps.filter((o: { is_closed_won: boolean; close_date: string | null }) =>
          o.is_closed_won && o.close_date && o.close_date >= fyStartStr && o.close_date <= fyEndStr
        );
        acvClosedQTD = closedWonQTD.reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
        acvClosedYTD = closedWonYTD.reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
        activePilots = aeOpps.filter((o: { is_paid_pilot: boolean; is_closed_won: boolean; is_closed_lost: boolean }) =>
          o.is_paid_pilot && !o.is_closed_won && !o.is_closed_lost
        ).length;
      }

      const annualQuota = annualQuotaMap[member.id] || 0;
      const quarterlyQuota = quarterlyQuotaMap[member.id] || 0;
      const attainment = annualQuota > 0 ? (acvClosedYTD / annualQuota) * 100 : 0;
      const attainmentQTD = quarterlyQuota > 0 ? (acvClosedQTD / quarterlyQuota) * 100 : 0;

      return {
        ...member,
        acv_closed_qtd: acvClosedQTD,
        acv_closed_ytd: acvClosedYTD,
        annual_quota: annualQuota,
        quarterly_quota: quarterlyQuota,
        attainment,
        attainment_qtd: attainmentQTD,
        active_pilots: activePilots,
        activities_qtd: activityCount[member.id] || 0,
        commission_qtd: commMap[member.id] || 0,
      };
    });

    // Team summary — compute average only for members with quota
    const totalAcvQTD = aeData.reduce((s, ae) => s + ae.acv_closed_qtd, 0);
    const membersWithAnnualQuota = aeData.filter(ae => ae.annual_quota > 0);
    const membersWithQuarterlyQuota = aeData.filter(ae => ae.quarterly_quota > 0);
    const avgAttainment = membersWithAnnualQuota.length > 0
      ? membersWithAnnualQuota.reduce((s, ae) => s + ae.attainment, 0) / membersWithAnnualQuota.length
      : 0;
    const avgAttainmentQTD = membersWithQuarterlyQuota.length > 0
      ? membersWithQuarterlyQuota.reduce((s, ae) => s + ae.attainment_qtd, 0) / membersWithQuarterlyQuota.length
      : 0;
    const totalPilots = aeData.reduce((s, ae) => s + ae.active_pilots, 0);
    const totalActivities = aeData.reduce((s, ae) => s + ae.activities_qtd, 0);

    // Fetch leaders in scope (not AEs or PBMs) who manage reports
    let leadersQuery = db
      .from('users')
      .select('id, full_name, email, role, region, salesforce_user_id')
      .eq('role', 'leader')
      .eq('is_active', true);
    leadersQuery = scopedQuery(leadersQuery, 'id', scope);
    const { data: leaders } = await leadersQuery;

    // For each leader, aggregate their subtree's metrics from aeData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaderRows: any[] = [];
    if (leaders && leaders.length > 0) {
      const { getOrgSubtree } = await import('@/lib/supabase/queries/hierarchy');
      const aeDataMap = new Map(aeData.map(ae => [ae.id, ae]));

      for (const leader of leaders) {
        const subtreeIds = await getOrgSubtree(leader.id);
        const subtreeMembers = subtreeIds
          .map(id => aeDataMap.get(id))
          .filter(Boolean) as typeof aeData;

        if (subtreeMembers.length === 0) continue;

        const totalAcvQTD = subtreeMembers.reduce((s, m) => s + m.acv_closed_qtd, 0);
        const totalAcvYTD = subtreeMembers.reduce((s, m) => s + m.acv_closed_ytd, 0);
        const withAnnualQuota = subtreeMembers.filter(m => m.annual_quota > 0);
        const withQuarterlyQuota = subtreeMembers.filter(m => m.quarterly_quota > 0);
        const avgAttainmentYTD = withAnnualQuota.length > 0
          ? withAnnualQuota.reduce((s, m) => s + m.attainment, 0) / withAnnualQuota.length : 0;
        const avgAttainmentQTD = withQuarterlyQuota.length > 0
          ? withQuarterlyQuota.reduce((s, m) => s + m.attainment_qtd, 0) / withQuarterlyQuota.length : 0;

        leaderRows.push({
          id: leader.id,
          full_name: leader.full_name,
          email: leader.email,
          role: leader.role,
          region: leader.region,
          salesforce_user_id: leader.salesforce_user_id,
          acv_closed_qtd: totalAcvQTD,
          acv_closed_ytd: totalAcvYTD,
          annual_quota: 0,
          quarterly_quota: 0,
          attainment: avgAttainmentYTD,
          attainment_qtd: avgAttainmentQTD,
          active_pilots: subtreeMembers.reduce((s, m) => s + m.active_pilots, 0),
          activities_qtd: subtreeMembers.reduce((s, m) => s + m.activities_qtd, 0),
          commission_qtd: 0,
          is_leader_aggregate: true,
          team_size: subtreeMembers.length,
        });
      }
    }

    // Combine AE/PBM data with leader aggregate rows
    const allData = [...aeData, ...leaderRows];

    // Build manager groups from user_hierarchy
    const hierarchyRows = await fetchAll<{ user_id: string; manager_id: string }>(() =>
      batchedIn(
        db.from('user_hierarchy')
          .select('user_id, manager_id')
          .is('effective_to', null),
        'user_id',
        allIds
      )
    );

    const memberToManager: Record<string, string> = {};
    const managerIdSet = new Set<string>();
    hierarchyRows.forEach(row => {
      memberToManager[row.user_id] = row.manager_id;
      managerIdSet.add(row.manager_id);
    });

    // Fetch manager user info for names
    const managerIds = [...managerIdSet];
    const managerInfoMap: Record<string, { full_name: string; role: string }> = {};
    if (managerIds.length > 0) {
      const { data: managers } = await batchedIn(
        db.from('users').select('id, full_name, role'),
        'id',
        managerIds
      );
      (managers || []).forEach(m => {
        managerInfoMap[m.id] = { full_name: m.full_name, role: m.role };
      });
    }

    // Group aeData by manager, compute rolled-up KPIs
    const groupMap = new Map<string, typeof aeData>();
    aeData.forEach(ae => {
      const mgr = memberToManager[ae.id] || '__unassigned__';
      if (!groupMap.has(mgr)) groupMap.set(mgr, []);
      groupMap.get(mgr)!.push(ae);
    });

    const managerGroups = [...groupMap.entries()].map(([managerId, members]) => {
      const info = managerInfoMap[managerId];
      const withQuota = members.filter(m => m.annual_quota > 0);
      const withQQuota = members.filter(m => m.quarterly_quota > 0);
      return {
        managerId: managerId === '__unassigned__' ? null : managerId,
        managerName: info?.full_name ?? 'Unassigned',
        managerRole: info?.role ?? '',
        memberIds: members.map(m => m.id),
        memberCount: members.length,
        summary: {
          acvClosedQTD: members.reduce((s, m) => s + m.acv_closed_qtd, 0),
          acvClosedYTD: members.reduce((s, m) => s + m.acv_closed_ytd, 0),
          avgAttainmentQTD: withQQuota.length > 0
            ? withQQuota.reduce((s, m) => s + m.attainment_qtd, 0) / withQQuota.length
            : 0,
          avgAttainmentYTD: withQuota.length > 0
            ? withQuota.reduce((s, m) => s + m.attainment, 0) / withQuota.length
            : 0,
          activePilots: members.reduce((s, m) => s + m.active_pilots, 0),
          activitiesQTD: members.reduce((s, m) => s + m.activities_qtd, 0),
          commissionQTD: members.reduce((s, m) => s + m.commission_qtd, 0),
        },
      };
    }).sort((a, b) => (a.managerName).localeCompare(b.managerName));

    return NextResponse.json({
      data: {
        aes: allData,
        summary: {
          acvClosedQTD: totalAcvQTD,
          avgAttainment,
          avgAttainmentQTD,
          activePilots: totalPilots,
          activitiesQTD: totalActivities,
        },
        managerGroups,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
