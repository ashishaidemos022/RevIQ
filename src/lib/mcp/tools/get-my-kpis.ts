import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserFromExtra, getScope, fmtCurrency, fmtPct } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { scopedQuery } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { REVENUE_SPLIT_TYPE, splitAcv, getOpp } from '@/lib/splits/query-helpers';
import { resolveQuotaUserId } from '@/lib/quota-resolver';

export function registerGetMyKpis(server: McpServer) {
  server.registerTool('get_my_kpis', {
    title: 'Get My KPIs',
    description:
      'Returns key performance indicators for the authenticated user: ' +
      'ACV closed (QTD & YTD), deals closed QTD, quota attainment %, ' +
      'and quarterly pace. Data is scoped to the user\'s role.',
    inputSchema: {
      fiscal_year: z.number().optional().describe('Fiscal year (e.g. 2027). Defaults to current.'),
      fiscal_quarter: z.number().min(1).max(4).optional().describe('Fiscal quarter 1-4. Defaults to current.'),
    },
  }, async (args, extra) => {
    const user = getUserFromExtra(extra);
    const scope = await getScope(extra);
    const db = getSupabaseClient();

    const currentPeriod = getCurrentFiscalPeriod();
    const fy = args.fiscal_year || currentPeriod.fiscalYear;
    const fq = args.fiscal_quarter || currentPeriod.fiscalQuarter;

    const qStart = getQuarterStartDate(fy, fq);
    const qEnd = getQuarterEndDate(fy, fq);
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fy);
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];

    // Closed-won QTD via opportunity_splits
    const qtdSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number;
      opportunities: { acv: number | null; sub_type: string | null };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, sub_type)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', true)
        .gte('opportunities.close_date', qStartStr)
        .lte('opportunities.close_date', qEndStr);
      return scopedQuery(q, 'split_owner_user_id', scope);
    });

    const acvClosedQTD = qtdSplits.reduce((s, r) => {
      const o = getOpp(r);
      return s + splitAcv(o.acv, r.split_percentage);
    }, 0);

    const dealsClosedQTD = qtdSplits.filter(r => {
      const o = getOpp(r);
      return o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (o.acv || 0) > 0;
    }).length;

    // Closed-won YTD
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

    const acvClosedYTD = ytdSplits.reduce((s, r) => {
      const o = getOpp(r);
      return s + splitAcv(o.acv, r.split_percentage);
    }, 0);

    // Quota
    const quotaUserId = await resolveQuotaUserId(user, db);
    const { data: quotas } = await db
      .from('quotas')
      .select('quota_amount, fiscal_quarter')
      .eq('user_id', quotaUserId)
      .eq('fiscal_year', fy)
      .eq('quota_type', 'revenue');

    const annualQuota = (quotas || [])
      .filter(q => q.fiscal_quarter === null || q.fiscal_quarter === undefined)
      .reduce((s, q) => s + (parseFloat(q.quota_amount) || 0), 0);

    const quotaAttainmentYTD = annualQuota > 0 ? (acvClosedYTD / annualQuota) * 100 : 0;

    const label = `Q${fq} FY${fy}`;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            period: label,
            acv_closed_qtd: fmtCurrency(acvClosedQTD),
            acv_closed_ytd: fmtCurrency(acvClosedYTD),
            deals_closed_qtd: dealsClosedQTD,
            annual_quota: fmtCurrency(annualQuota),
            quota_attainment_ytd: fmtPct(quotaAttainmentYTD),
          }, null, 2),
        },
      ],
    };
  });
}
