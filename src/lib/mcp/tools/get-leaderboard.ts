import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fmtCurrency } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

export function registerGetLeaderboard(server: McpServer) {
  server.registerTool('get_leaderboard', {
    title: 'Get Leaderboard',
    description:
      'Returns the AE revenue leaderboard — all AEs ranked by ACV closed. ' +
      'Visible to all roles (AEs can see where they rank). ' +
      'Returns top N entries (default 10).',
    inputSchema: {
      period: z.enum(['qtd', 'ytd']).optional().describe('Time period. Default: qtd'),
      limit: z.number().min(1).max(50).optional().describe('Number of entries. Default: 10'),
    },
  }, async (args, extra) => {
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    const period = args.period || 'qtd';
    let startStr: string;
    let endStr: string;

    if (period === 'ytd') {
      const { start, end } = getFiscalYearRange(fiscalYear);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else {
      const start = getQuarterStartDate(fiscalYear, fiscalQuarter);
      const end = getQuarterEndDate(fiscalYear, fiscalQuarter);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    }

    // Get all AEs
    const { data: allAEs } = await db
      .from('users')
      .select('id, full_name, region')
      .in('role', ['commercial_ae', 'enterprise_ae'])
      .eq('is_active', true);

    if (!allAEs || allAEs.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No AEs found.' }] };
    }

    const aeIds = allAEs.map(ae => ae.id);

    // Revenue via splits
    const { data: splits } = await db
      .from('opportunity_splits')
      .select('split_owner_user_id, split_percentage, opportunities!inner(acv, sub_type)')
      .eq('split_type', REVENUE_SPLIT_TYPE)
      .eq('opportunities.is_closed_won', true)
      .in('split_owner_user_id', aeIds)
      .gte('opportunities.close_date', startStr)
      .lte('opportunities.close_date', endStr);

    const aeData: Record<string, { acv: number; deals: number }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (splits || []).forEach((s: any) => {
      const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
      if (!opp) return;
      const id = s.split_owner_user_id;
      if (!aeData[id]) aeData[id] = { acv: 0, deals: 0 };
      aeData[id].acv += splitAcv(opp.acv, s.split_percentage);
      if (opp.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(opp.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (opp.acv || 0) > 0) {
        aeData[id].deals++;
      }
    });

    const entries = allAEs
      .map(ae => ({
        name: ae.full_name,
        region: ae.region || 'N/A',
        acv_closed: aeData[ae.id]?.acv || 0,
        deals_closed: aeData[ae.id]?.deals || 0,
      }))
      .sort((a, b) => b.acv_closed - a.acv_closed);

    // Assign ranks
    const ranked = entries.slice(0, args.limit || 10).map((e, i) => ({
      rank: i + 1,
      ...e,
      acv_closed: fmtCurrency(e.acv_closed),
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            board: 'Revenue Leaderboard',
            period: period === 'ytd' ? `YTD FY${fiscalYear}` : `Q${fiscalQuarter} FY${fiscalYear}`,
            entries: ranked,
          }, null, 2),
        },
      ],
    };
  });
}
