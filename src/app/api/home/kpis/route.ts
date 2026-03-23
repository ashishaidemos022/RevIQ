import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';

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

    // Closed-won QTD
    let qtdQuery = db
      .from('opportunities')
      .select('acv')
      .eq('is_closed_won', true)
      .gte('close_date', qStartStr)
      .lte('close_date', qEndStr);
    qtdQuery = scopedQuery(qtdQuery, 'owner_user_id', scope);
    const { data: qtdOpps } = await qtdQuery;

    const acvClosedQTD = (qtdOpps || []).reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);
    const dealsClosedQTD = (qtdOpps || []).length;

    // Closed-won YTD
    let ytdQuery = db
      .from('opportunities')
      .select('acv')
      .eq('is_closed_won', true)
      .gte('close_date', fyStartStr)
      .lte('close_date', fyEndStr);
    ytdQuery = scopedQuery(ytdQuery, 'owner_user_id', scope);
    const { data: ytdOpps } = await ytdQuery;

    const acvClosedYTD = (ytdOpps || []).reduce((s: number, o: { acv: number | null }) => s + (o.acv || 0), 0);

    // Quota
    const effectiveUserId = (viewAsUser ?? user).user_id;
    let quotaQuery = db
      .from('quotas')
      .select('quota_amount, fiscal_quarter')
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue');

    // For individual users (AEs), get their specific quota
    // For managers+, get aggregate quota for their org
    if (scope.allAccess) {
      // CRO/C-level: no filter, sum all quotas
    } else if (scope.userIds.length === 1) {
      quotaQuery = quotaQuery.eq('user_id', scope.userIds[0]);
    } else {
      quotaQuery = scopedQuery(quotaQuery, 'user_id', scope);
    }
    const { data: quotas } = await quotaQuery;

    const annualQuota = (quotas || [])
      .filter((q: { fiscal_quarter: number | null }) => q.fiscal_quarter === null || q.fiscal_quarter === undefined)
      .reduce((s: number, q: { quota_amount: number }) => s + (q.quota_amount || 0), 0);
    const quarterlyQuota = (quotas || [])
      .filter((q: { fiscal_quarter: number | null }) => q.fiscal_quarter === fiscalQuarter)
      .reduce((s: number, q: { quota_amount: number }) => s + (q.quota_amount || 0), 0);

    const quotaAttainmentYTD = annualQuota > 0 ? (acvClosedYTD / annualQuota) * 100 : 0;
    const quotaAttainmentQTD = quarterlyQuota > 0 ? (acvClosedQTD / quarterlyQuota) * 100 : 0;

    // Quarterly pacing
    const now = new Date();
    const totalDaysInQuarter = Math.ceil((qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24)));
    const quarterPacePercent = Math.min((daysElapsed / totalDaysInQuarter) * 100, 100);

    return NextResponse.json({
      data: {
        acvClosedQTD,
        acvClosedYTD,
        dealsClosedQTD,
        quotaAttainmentQTD,
        quotaAttainmentYTD,
        quarterPacePercent,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
