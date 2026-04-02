import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getScope, fmtCurrency } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';
import { REVENUE_SPLIT_TYPE, splitAcv, getOpp } from '@/lib/splits/query-helpers';

export function registerGetPipelineSummary(server: McpServer) {
  server.registerTool('get_pipeline_summary', {
    title: 'Get Pipeline Summary',
    description:
      'Returns open pipeline KPIs: total pipeline ACV, weighted pipeline, deal count, ' +
      'average deal size, and deals closing this quarter. Broken down by stage. ' +
      'Scoped to the authenticated user\'s role.',
    inputSchema: {
      is_paid_pilot: z.boolean().optional().describe('Filter to paid pilots only'),
    },
  }, async (args, extra) => {
    const scope = await getScope(extra);
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];

    const splits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number;
      opportunities: { acv: number | null; probability: number | null; close_date: string | null; stage: string | null };
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_percentage, opportunities!inner(acv, probability, close_date, stage)')
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_closed_won', false)
        .eq('opportunities.is_closed_lost', false);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      if (args.is_paid_pilot) q = q.eq('opportunities.is_paid_pilot', true);
      return q;
    });

    const totalAcv = splits.reduce((s, o) => s + splitAcv(getOpp(o).acv, o.split_percentage), 0);
    const weightedAcv = splits.reduce((s, o) => {
      const opp = getOpp(o);
      return s + splitAcv(opp.acv, o.split_percentage) * ((opp.probability || 0) / 100);
    }, 0);
    const dealCount = splits.length;
    const avgDealSize = dealCount > 0 ? totalAcv / dealCount : 0;
    const closingThisQ = splits.filter(o => {
      const cd = getOpp(o).close_date;
      return cd && cd >= qStartStr && cd <= qEndStr;
    }).length;

    // Stage breakdown
    const byStage: Record<string, { count: number; acv: number }> = {};
    splits.forEach(o => {
      const opp = getOpp(o);
      const stage = opp.stage || 'Unknown';
      if (!byStage[stage]) byStage[stage] = { count: 0, acv: 0 };
      byStage[stage].count++;
      byStage[stage].acv += splitAcv(opp.acv, o.split_percentage);
    });

    const stageBreakdown = Object.entries(byStage)
      .sort((a, b) => b[1].acv - a[1].acv)
      .map(([stage, data]) => ({
        stage,
        deals: data.count,
        acv: fmtCurrency(data.acv),
      }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            period: `Q${fiscalQuarter} FY${fiscalYear}`,
            total_pipeline_acv: fmtCurrency(totalAcv),
            weighted_pipeline_acv: fmtCurrency(weightedAcv),
            deal_count: dealCount,
            avg_deal_size: fmtCurrency(avgDealSize),
            closing_this_quarter: closingThisQ,
            by_stage: stageBreakdown,
          }, null, 2),
        },
      ],
    };
  });
}
