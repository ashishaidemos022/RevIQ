import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserFromExtra, fmtCurrency, fmtPct } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { MANAGER_PLUS_ROLES } from '@/lib/constants';
import { REVENUE_SPLIT_TYPE, splitAcv } from '@/lib/splits/query-helpers';

export function registerGetTeamOverview(server: McpServer) {
  server.registerTool('get_team_overview', {
    title: 'Get Team Overview',
    description:
      'Returns team performance summary: each AE in the user\'s org tree with their ' +
      'ACV closed QTD, YTD, quota attainment, and active pilots. ' +
      'Only available to managers and above — AEs will get an access denied error.',
    inputSchema: {
      sort_by: z.enum(['acv_qtd', 'acv_ytd', 'attainment', 'name']).optional()
        .describe('Sort field. Default: acv_qtd'),
    },
  }, async (args, extra) => {
    const user = getUserFromExtra(extra);

    if (!MANAGER_PLUS_ROLES.includes(user.role)) {
      return {
        content: [{ type: 'text' as const, text: 'Access denied. Team overview requires manager or above role.' }],
        isError: true,
      };
    }

    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];

    // Get org subtree
    const FULL_ACCESS = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
    const isFullAccess = FULL_ACCESS.includes(user.role);

    let aeQuery = db
      .from('users')
      .select('id, full_name, region, role')
      .in('role', ['commercial_ae', 'enterprise_ae'])
      .eq('is_active', true);

    if (!isFullAccess) {
      const subtree = await getOrgSubtree(user.user_id);
      const teamIds = [user.user_id, ...subtree];
      aeQuery = aeQuery.in('id', teamIds);
    }

    const { data: teamAEs } = await aeQuery;

    if (!teamAEs || teamAEs.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No AEs found in your team.' }] };
    }

    const aeIds = teamAEs.map(ae => ae.id);

    // QTD revenue via splits
    const { data: qtdSplits } = await db
      .from('opportunity_splits')
      .select('split_owner_user_id, split_percentage, opportunities!inner(acv)')
      .eq('split_type', REVENUE_SPLIT_TYPE)
      .eq('opportunities.is_closed_won', true)
      .in('split_owner_user_id', aeIds)
      .gte('opportunities.close_date', qStartStr)
      .lte('opportunities.close_date', qEndStr);

    // YTD revenue via splits
    const { data: ytdSplits } = await db
      .from('opportunity_splits')
      .select('split_owner_user_id, split_percentage, opportunities!inner(acv)')
      .eq('split_type', REVENUE_SPLIT_TYPE)
      .eq('opportunities.is_closed_won', true)
      .in('split_owner_user_id', aeIds)
      .gte('opportunities.close_date', fyStartStr)
      .lte('opportunities.close_date', fyEndStr);

    // Quotas
    const { data: quotas } = await db
      .from('quotas')
      .select('user_id, quota_amount, fiscal_quarter')
      .in('user_id', aeIds)
      .eq('fiscal_year', fiscalYear)
      .eq('quota_type', 'revenue');

    // Aggregate
    const aeMetrics: Record<string, { qtd: number; ytd: number; quota: number }> = {};
    aeIds.forEach(id => { aeMetrics[id] = { qtd: 0, ytd: 0, quota: 0 }; });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (qtdSplits || []).forEach((s: any) => {
      const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
      if (opp && aeMetrics[s.split_owner_user_id]) {
        aeMetrics[s.split_owner_user_id].qtd += splitAcv(opp.acv, s.split_percentage);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ytdSplits || []).forEach((s: any) => {
      const opp = Array.isArray(s.opportunities) ? s.opportunities[0] : s.opportunities;
      if (opp && aeMetrics[s.split_owner_user_id]) {
        aeMetrics[s.split_owner_user_id].ytd += splitAcv(opp.acv, s.split_percentage);
      }
    });

    (quotas || []).forEach(q => {
      if (aeMetrics[q.user_id] && (q.fiscal_quarter === null || q.fiscal_quarter === undefined)) {
        aeMetrics[q.user_id].quota += parseFloat(q.quota_amount) || 0;
      }
    });

    const roster = teamAEs.map(ae => {
      const m = aeMetrics[ae.id];
      const attainment = m.quota > 0 ? (m.ytd / m.quota) * 100 : 0;
      return {
        name: ae.full_name,
        region: ae.region || 'N/A',
        role: ae.role,
        acv_closed_qtd: m.qtd,
        acv_closed_ytd: m.ytd,
        annual_quota: m.quota,
        attainment_pct: attainment,
      };
    });

    // Sort
    const sortField = args.sort_by || 'acv_qtd';
    roster.sort((a, b) => {
      if (sortField === 'name') return a.name.localeCompare(b.name);
      if (sortField === 'acv_ytd') return b.acv_closed_ytd - a.acv_closed_ytd;
      if (sortField === 'attainment') return b.attainment_pct - a.attainment_pct;
      return b.acv_closed_qtd - a.acv_closed_qtd;
    });

    const formatted = roster.map(r => ({
      ...r,
      acv_closed_qtd: fmtCurrency(r.acv_closed_qtd),
      acv_closed_ytd: fmtCurrency(r.acv_closed_ytd),
      annual_quota: fmtCurrency(r.annual_quota),
      attainment_pct: fmtPct(r.attainment_pct),
    }));

    // Team totals
    const teamQtd = roster.reduce((s, r) => s + r.acv_closed_qtd, 0);
    const teamYtd = roster.reduce((s, r) => s + r.acv_closed_ytd, 0);
    const avgAttainment = roster.length > 0
      ? roster.reduce((s, r) => s + r.attainment_pct, 0) / roster.length
      : 0;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            period: `Q${fiscalQuarter} FY${fiscalYear}`,
            team_summary: {
              ae_count: roster.length,
              total_acv_qtd: fmtCurrency(teamQtd),
              total_acv_ytd: fmtCurrency(teamYtd),
              avg_attainment: fmtPct(avgAttainment),
            },
            roster: formatted,
          }, null, 2),
        },
      ],
    };
  });
}
