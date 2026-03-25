import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { getStageGroup } from '@/lib/stage-groups';

/**
 * Returns chart data for the PBM Home dashboard:
 * - ACV by month (closed-won, last 12 months) + deal drill-down
 * - Pipeline by stage group + close month (current & next FQ) + deal drill-down
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;
    const db = getSupabaseClient();

    // Resolve PBM user IDs for the current viewer
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      return NextResponse.json({ data: { acvByMonth: {}, acvDeals: {}, pipelineByStage: {}, pipelineByMonthAndGroup: {}, pipelineDeals: {} } });
    }

    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
    const creditedOppSfIds = [...creditMap.keys()];

    if (creditedOppSfIds.length === 0) {
      return NextResponse.json({ data: { acvByMonth: {}, acvDeals: {}, pipelineByStage: {}, pipelineByMonthAndGroup: {}, pipelineDeals: {} } });
    }

    // Fetch all credited opps with fields needed for charts
    type OppRow = {
      id: string;
      salesforce_opportunity_id: string;
      name: string | null;
      stage: string | null;
      acv: number | null;
      ai_acv: number | null;
      close_date: string | null;
      is_closed_won: boolean;
      is_closed_lost: boolean;
      users: { full_name: string } | null;
    };

    let allOpps: OppRow[] = [];
    for (let i = 0; i < creditedOppSfIds.length; i += 500) {
      const batch = creditedOppSfIds.slice(i, i + 500);
      const { data } = await db
        .from('opportunities')
        .select('id, salesforce_opportunity_id, name, stage, acv, ai_acv, close_date, is_closed_won, is_closed_lost, users!opportunities_owner_user_id_fkey(full_name)')
        .in('salesforce_opportunity_id', batch);
      if (data) allOpps = allOpps.concat(data as unknown as OppRow[]);
    }

    // --- ACV by Month (closed-won) ---
    const acvByMonth: Record<string, number> = {};
    const cxaAcvByMonth: Record<string, number> = {};
    const ccaasAcvByMonth: Record<string, number> = {};
    const acvDeals: Record<string, Array<{ id: string; name: string; owner: string; acv: number }>> = {};

    for (const o of allOpps) {
      if (!o.is_closed_won || !o.close_date) continue;
      const month = o.close_date.substring(0, 7);
      const acv = parseFloat(String(o.acv)) || 0;
      const cxaAcv = parseFloat(String(o.ai_acv)) || 0;
      const ccaasAcv = acv - cxaAcv;
      acvByMonth[month] = (acvByMonth[month] || 0) + acv;
      cxaAcvByMonth[month] = (cxaAcvByMonth[month] || 0) + cxaAcv;
      ccaasAcvByMonth[month] = (ccaasAcvByMonth[month] || 0) + ccaasAcv;

      if (!acvDeals[month]) acvDeals[month] = [];
      acvDeals[month].push({
        id: o.id,
        name: o.name || 'Unnamed',
        owner: o.users?.full_name || 'Unknown',
        acv,
      });
    }

    for (const key of Object.keys(acvDeals)) {
      acvDeals[key].sort((a, b) => b.acv - a.acv);
    }

    // --- Pipeline by stage group + close month (current & next FQ) ---
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const nextQ = fiscalQuarter < 4 ? fiscalQuarter + 1 : 1;
    const nextFY = fiscalQuarter < 4 ? fiscalYear : fiscalYear + 1;
    const startStr = getQuarterStartDate(fiscalYear, fiscalQuarter).toISOString().split('T')[0];
    const endStr = getQuarterEndDate(nextFY, nextQ).toISOString().split('T')[0];

    const pipelineByMonthAndGroup: Record<string, Record<string, { count: number; acv: number }>> = {};
    const pipelineByStage: Record<string, { count: number; acv: number }> = {};
    const pipelineDeals: Record<string, Array<{ id: string; name: string; owner: string; acv: number; stage: string }>> = {};

    for (const o of allOpps) {
      if (o.is_closed_won || o.is_closed_lost) continue;
      if (!o.close_date || o.close_date < startStr || o.close_date > endStr) continue;

      const group = getStageGroup(o.stage || '');
      if (!group) continue;

      const acv = parseFloat(String(o.acv)) || 0;
      const month = o.close_date.substring(0, 7);

      if (!pipelineByMonthAndGroup[month]) pipelineByMonthAndGroup[month] = {};
      if (!pipelineByMonthAndGroup[month][group]) pipelineByMonthAndGroup[month][group] = { count: 0, acv: 0 };
      pipelineByMonthAndGroup[month][group].count++;
      pipelineByMonthAndGroup[month][group].acv += acv;

      const dealKey = `${month}|${group}`;
      if (!pipelineDeals[dealKey]) pipelineDeals[dealKey] = [];
      pipelineDeals[dealKey].push({
        id: o.id,
        name: o.name || 'Unnamed',
        owner: o.users?.full_name || 'Unknown',
        acv,
        stage: o.stage || 'Unknown',
      });

      const stage = o.stage || 'Other';
      if (!pipelineByStage[stage]) pipelineByStage[stage] = { count: 0, acv: 0 };
      pipelineByStage[stage].count++;
      pipelineByStage[stage].acv += acv;
    }

    for (const key of Object.keys(pipelineDeals)) {
      pipelineDeals[key].sort((a, b) => b.acv - a.acv);
    }

    return NextResponse.json({
      data: {
        acvByMonth,
        cxaAcvByMonth,
        ccaasAcvByMonth,
        acvDeals,
        pipelineByStage,
        pipelineByMonthAndGroup,
        pipelineDeals,
      },
    });
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
