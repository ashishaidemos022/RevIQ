import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { resolveQuotaUserId } from '@/lib/quota-resolver';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;
    const db = getSupabaseClient();

    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter).toISOString().split('T')[0];
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter).toISOString().split('T')[0];
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];

    // Resolve PBMs
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      return NextResponse.json({
        acv_closed_qtd: 0,
        acv_closed_ytd: 0,
        deals_closed_qtd: 0,
        quota_attainment_qtd: 0,
        quota_attainment_ytd: 0,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
      });
    }

    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
    const creditedOppSfIds = [...creditMap.keys()];

    // Fetch credited opps with close data
    let acvClosedQTD = 0;
    let acvClosedYTD = 0;
    let dealsClosedQTD = 0;

    if (creditedOppSfIds.length > 0) {
      for (let i = 0; i < creditedOppSfIds.length; i += 500) {
        const batch = creditedOppSfIds.slice(i, i + 500);
        const { data: opps } = await db
          .from('opportunities')
          .select('salesforce_opportunity_id, acv, close_date, is_closed_won, sub_type')
          .eq('is_closed_won', true)
          .in('salesforce_opportunity_id', batch);

        (opps || []).forEach(o => {
          const acv = parseFloat(o.acv) || 0;
          const cd = o.close_date || '';

          if (cd >= fyStartStr && cd <= fyEndStr) {
            acvClosedYTD += acv;
          }
          if (cd >= qStart && cd <= qEnd) {
            acvClosedQTD += acv;
            if (o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && acv > 0) {
              dealsClosedQTD++;
            }
          }
        });
      }
    }

    // Commissions for PBMs
    let commissionEarnedQTD = 0;
    let commissionProjectedQTD = 0;

    if (pbmLocalIds.length > 0) {
      const { data: commissions } = await db
        .from('commissions')
        .select('commission_amount, is_finalized, fiscal_quarter')
        .in('user_id', pbmLocalIds)
        .eq('fiscal_year', fiscalYear)
        .eq('fiscal_quarter', fiscalQuarter);

      (commissions || []).forEach(c => {
        const amt = parseFloat(c.commission_amount) || 0;
        if (c.is_finalized) {
          commissionEarnedQTD += amt;
        } else {
          commissionProjectedQTD += amt;
        }
      });
    }

    // Quota — use target user's own quota (not sum of subordinates)
    let quotaAttainmentYTD = 0;
    let quotaAttainmentQTD = 0;
    const quotaUserId = await resolveQuotaUserId(targetUser, db);
    const { data: quotas } = await db
      .from('quotas')
      .select('quota_amount, fiscal_quarter')
      .eq('user_id', quotaUserId)
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue');

    const annualQuota = (quotas || [])
      .filter(q => q.fiscal_quarter === null)
      .reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);
    const quarterlyQuota = (quotas || [])
      .filter(q => q.fiscal_quarter === fiscalQuarter)
      .reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);

    if (annualQuota > 0) {
      quotaAttainmentYTD = (acvClosedYTD / annualQuota) * 100;
    }
    if (quarterlyQuota > 0) {
      quotaAttainmentQTD = (acvClosedQTD / quarterlyQuota) * 100;
    }

    // Quarterly pacing: 20% after Month 1, 50% after Month 2, 100% by end of Month 3
    const now = new Date();
    const qStartDate = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qStartMonth = qStartDate.getMonth();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const qStartYear = qStartDate.getFullYear();
    const monthsSinceStart = (currentYear - qStartYear) * 12 + (currentMonth - qStartMonth);
    const monthInQuarter = Math.max(0, Math.min(2, monthsSinceStart));
    const milestones = [20, 50, 100];
    const prevMilestone = monthInQuarter === 0 ? 0 : milestones[monthInQuarter - 1];
    const nextMilestone = milestones[monthInQuarter];
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const totalDaysInMonth = monthEnd.getDate();
    const dayOfMonth = Math.min(now.getDate(), totalDaysInMonth);
    const monthProgress = dayOfMonth / totalDaysInMonth;
    const quarterPacePercent = Math.min(
      prevMilestone + (nextMilestone - prevMilestone) * monthProgress,
      100
    );

    return NextResponse.json({
      acv_closed_qtd: acvClosedQTD,
      acv_closed_ytd: acvClosedYTD,
      deals_closed_qtd: dealsClosedQTD,
      quota_attainment_qtd: quotaAttainmentQTD,
      quota_attainment_ytd: quotaAttainmentYTD,
      quarter_pace_percent: quarterPacePercent,
      fiscal_year: fiscalYear,
      fiscal_quarter: fiscalQuarter,
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
