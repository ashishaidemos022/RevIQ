import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { resolveQuotaUserId } from '@/lib/quota-resolver';

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

    // Closed-won QTD (paginated)
    const qtdOpps = await fetchAll<{ acv: number | null }>(() => {
      let q = db
        .from('opportunities')
        .select('acv')
        .eq('is_closed_won', true)
        .gte('close_date', qStartStr)
        .lte('close_date', qEndStr);
      return scopedQuery(q, 'owner_user_id', scope);
    });

    const acvClosedQTD = qtdOpps.reduce((s, o) => s + (o.acv || 0), 0);
    const dealsClosedQTD = qtdOpps.length;

    // Closed-won YTD (paginated)
    const ytdOpps = await fetchAll<{ acv: number | null }>(() => {
      let q = db
        .from('opportunities')
        .select('acv')
        .eq('is_closed_won', true)
        .gte('close_date', fyStartStr)
        .lte('close_date', fyEndStr);
      return scopedQuery(q, 'owner_user_id', scope);
    });

    const acvClosedYTD = ytdOpps.reduce((s, o) => s + (o.acv || 0), 0);

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
