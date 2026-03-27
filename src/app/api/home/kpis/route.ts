import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { resolveQuotaUserId } from '@/lib/quota-resolver';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
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

    // Closed-won QTD via opportunity_splits (paginated)
    const qtdSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number;
      opportunities: { acv: number | null; ai_acv: number | null; sub_type: string | null };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, ai_acv, sub_type)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', true)
        .gte('opportunities.close_date', qStartStr)
        .lte('opportunities.close_date', qEndStr);
      return scopedQuery(q, 'split_owner_user_id', scope);
    });

    const acvClosedQTD = qtdSplits.reduce((s, r) => s + splitAcv(r.opportunities.acv, r.split_percentage), 0);
    const cxaAcvClosedQTD = qtdSplits.reduce((s, r) => s + splitAcv(r.opportunities.ai_acv, r.split_percentage), 0);
    const countableQtdSplits = qtdSplits.filter(
      r => r.opportunities.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(r.opportunities.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (r.opportunities.acv || 0) > 0
    );
    const dealsClosedQTD = countableQtdSplits.length;
    const dealsWithCxaQTD = countableQtdSplits.filter(r => (r.opportunities.ai_acv || 0) > 0).length;
    const pctClosedDealsWithCxa = dealsClosedQTD > 0 ? (dealsWithCxaQTD / dealsClosedQTD) * 100 : 0;

    // Closed-won YTD via opportunity_splits (paginated)
    const ytdSplits = await fetchAll<{
      split_percentage: number;
      opportunities: { acv: number | null };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_percentage, opportunities!inner(acv)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', true)
        .gte('opportunities.close_date', fyStartStr)
        .lte('opportunities.close_date', fyEndStr);
      return scopedQuery(q, 'split_owner_user_id', scope);
    });

    const acvClosedYTD = ytdSplits.reduce((s, r) => s + splitAcv(r.opportunities.acv, r.split_percentage), 0);

    // Quota — use target user's own quota (not sum of subordinates)
    const targetUser = viewAsUser ?? user;
    const quotaUserId = await resolveQuotaUserId(targetUser, db);

    const { data: quotas } = await db
      .from('quotas')
      .select('quota_amount, fiscal_quarter')
      .eq('user_id', quotaUserId)
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue');

    const annualQuota = (quotas || [])
      .filter(q => q.fiscal_quarter === null || q.fiscal_quarter === undefined)
      .reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);
    const quarterlyQuota = (quotas || [])
      .filter(q => q.fiscal_quarter === fiscalQuarter)
      .reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);

    const quotaAttainmentYTD = annualQuota > 0 ? (acvClosedYTD / annualQuota) * 100 : 0;
    const quotaAttainmentQTD = quarterlyQuota > 0 ? (acvClosedQTD / quarterlyQuota) * 100 : 0;

    // Quarterly pacing: 20% after Month 1, 50% after Month 2, 100% by end of Month 3
    const now = new Date();
    const qStartMonth = qStart.getMonth();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthInQuarter: number;
    const qStartYear = qStart.getFullYear();
    const monthsSinceStart = (currentYear - qStartYear) * 12 + (currentMonth - qStartMonth);
    monthInQuarter = Math.max(0, Math.min(2, monthsSinceStart));

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
      data: {
        acvClosedQTD,
        cxaAcvClosedQTD,
        acvClosedYTD,
        dealsClosedQTD,
        pctClosedDealsWithCxa,
        quotaAttainmentQTD,
        quotaAttainmentYTD,
        quarterPacePercent,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
