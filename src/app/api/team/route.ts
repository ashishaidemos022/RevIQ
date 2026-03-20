import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';

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

    // Get AEs in scope
    let usersQuery = db
      .from('users')
      .select('id, full_name, email, role, region')
      .in('role', ['commercial_ae', 'enterprise_ae'])
      .eq('is_active', true);

    if (!scope.allAccess) {
      usersQuery = usersQuery.in('id', scope.userIds);
    }

    const { data: aes } = await usersQuery;
    if (!aes || aes.length === 0) {
      return NextResponse.json({ data: { aes: [], summary: { acvClosedQTD: 0, avgAttainment: 0, activePilots: 0, activitiesQTD: 0 } } });
    }

    const aeIds = aes.map(ae => ae.id);

    // Get opportunities for all AEs
    const { data: allOpps } = await db
      .from('opportunities')
      .select('owner_user_id, acv, is_closed_won, is_closed_lost, is_paid_pilot, close_date')
      .in('owner_user_id', aeIds);

    // Get quotas
    const { data: quotas } = await db
      .from('quotas')
      .select('user_id, quota_amount')
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue')
      .is('fiscal_quarter', null)
      .in('user_id', aeIds);

    // Get activities QTD
    const { data: acts } = await db
      .from('activities')
      .select('owner_user_id')
      .in('owner_user_id', aeIds)
      .gte('activity_date', qStartStr)
      .lte('activity_date', qEndStr);

    // Get commissions QTD
    const { data: comms } = await db
      .from('commissions')
      .select('user_id, commission_amount, is_finalized')
      .eq('fiscal_year', fiscalYear)
      .eq('fiscal_quarter', fiscalQuarter)
      .in('user_id', aeIds);

    // Build per-AE data
    const quotaMap: Record<string, number> = {};
    (quotas || []).forEach((q: { user_id: string; quota_amount: number }) => {
      quotaMap[q.user_id] = q.quota_amount;
    });

    const activityCount: Record<string, number> = {};
    (acts || []).forEach((a: { owner_user_id: string | null }) => {
      if (a.owner_user_id) activityCount[a.owner_user_id] = (activityCount[a.owner_user_id] || 0) + 1;
    });

    const commMap: Record<string, number> = {};
    (comms || []).forEach((c: { user_id: string; commission_amount: number | null }) => {
      commMap[c.user_id] = (commMap[c.user_id] || 0) + (c.commission_amount || 0);
    });

    const aeData = aes.map(ae => {
      const aeOpps = (allOpps || []).filter((o: { owner_user_id: string | null }) => o.owner_user_id === ae.id);

      const closedWonQTD = aeOpps.filter((o: { is_closed_won: boolean; close_date: string | null }) =>
        o.is_closed_won && o.close_date && o.close_date >= qStartStr && o.close_date <= qEndStr
      );
      const closedWonYTD = aeOpps.filter((o: { is_closed_won: boolean; close_date: string | null }) =>
        o.is_closed_won && o.close_date && o.close_date >= fyStartStr && o.close_date <= fyEndStr
      );

      const acvClosedQTD = closedWonQTD.reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
      const acvClosedYTD = closedWonYTD.reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
      const quota = quotaMap[ae.id] || 0;
      const attainment = quota > 0 ? (acvClosedYTD / quota) * 100 : 0;
      const activePilots = aeOpps.filter((o: { is_paid_pilot: boolean; is_closed_won: boolean; is_closed_lost: boolean }) =>
        o.is_paid_pilot && !o.is_closed_won && !o.is_closed_lost
      ).length;

      return {
        ...ae,
        acv_closed_qtd: acvClosedQTD,
        acv_closed_ytd: acvClosedYTD,
        annual_quota: quota,
        attainment,
        active_pilots: activePilots,
        activities_qtd: activityCount[ae.id] || 0,
        commission_qtd: commMap[ae.id] || 0,
      };
    });

    // Team summary
    const totalAcvQTD = aeData.reduce((s, ae) => s + ae.acv_closed_qtd, 0);
    const avgAttainment = aeData.length > 0
      ? aeData.reduce((s, ae) => s + ae.attainment, 0) / aeData.length
      : 0;
    const totalPilots = aeData.reduce((s, ae) => s + ae.active_pilots, 0);
    const totalActivities = aeData.reduce((s, ae) => s + ae.activities_qtd, 0);

    return NextResponse.json({
      data: {
        aes: aeData,
        summary: {
          acvClosedQTD: totalAcvQTD,
          avgAttainment,
          activePilots: totalPilots,
          activitiesQTD: totalActivities,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
