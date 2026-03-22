import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';

const MANAGER_PLUS = ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

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
      .select('id, full_name, email, role, region')
      .in('role', ['commercial_ae', 'enterprise_ae', 'pbm'])
      .eq('is_active', true);

    if (!scope.allAccess) {
      usersQuery = usersQuery.in('id', scope.userIds);
    }

    const { data: aes } = await usersQuery;
    if (!aes || aes.length === 0) {
      return NextResponse.json({ data: { aes: [], summary: { acvClosedQTD: 0, avgAttainment: 0, activePilots: 0, activitiesQTD: 0 } } });
    }

    const allMembers = aes;
    const allIds = allMembers.map(m => m.id);
    const aeMembers = allMembers.filter(m => m.role !== 'pbm');
    const pbmMembers = allMembers.filter(m => m.role === 'pbm');
    const aeIds = aeMembers.map(ae => ae.id);
    const pbmIds = pbmMembers.map(p => p.id);

    // Get opportunities for AEs (owner-based)
    const { data: allOpps } = aeIds.length > 0
      ? await db
          .from('opportunities')
          .select('owner_user_id, acv, is_closed_won, is_closed_lost, is_paid_pilot, close_date')
          .in('owner_user_id', aeIds)
      : { data: [] };

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

    // Get quotas (annual + current quarter)
    const { data: quotas } = await db
      .from('quotas')
      .select('user_id, quota_amount, fiscal_quarter')
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue')
      .in('user_id', allIds);

    // Get activities QTD
    const { data: acts } = await db
      .from('activities')
      .select('owner_user_id')
      .in('owner_user_id', allIds)
      .gte('activity_date', qStartStr)
      .lte('activity_date', qEndStr);

    // Get commissions QTD
    const { data: comms } = await db
      .from('commissions')
      .select('user_id, commission_amount, is_finalized')
      .eq('fiscal_year', fiscalYear)
      .eq('fiscal_quarter', fiscalQuarter)
      .in('user_id', allIds);

    // Build shared lookup maps
    const annualQuotaMap: Record<string, number> = {};
    const quarterlyQuotaMap: Record<string, number> = {};
    (quotas || []).forEach((q: { user_id: string; quota_amount: number; fiscal_quarter: number | null }) => {
      if (q.fiscal_quarter === null || q.fiscal_quarter === undefined) {
        annualQuotaMap[q.user_id] = (annualQuotaMap[q.user_id] || 0) + (q.quota_amount || 0);
      } else if (q.fiscal_quarter === fiscalQuarter) {
        quarterlyQuotaMap[q.user_id] = (quarterlyQuotaMap[q.user_id] || 0) + (q.quota_amount || 0);
      }
    });

    const activityCount: Record<string, number> = {};
    (acts || []).forEach((a: { owner_user_id: string | null }) => {
      if (a.owner_user_id) activityCount[a.owner_user_id] = (activityCount[a.owner_user_id] || 0) + 1;
    });

    const commMap: Record<string, number> = {};
    (comms || []).forEach((c: { user_id: string; commission_amount: number | null }) => {
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
        const aeOpps = (allOpps || []).filter((o: { owner_user_id: string | null }) => o.owner_user_id === member.id);
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

    return NextResponse.json({
      data: {
        aes: aeData,
        summary: {
          acvClosedQTD: totalAcvQTD,
          avgAttainment,
          avgAttainmentQTD,
          activePilots: totalPilots,
          activitiesQTD: totalActivities,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
