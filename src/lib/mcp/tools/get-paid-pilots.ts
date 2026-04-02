import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getScope, fmtCurrency } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { scopedQuery } from '@/lib/auth/middleware';

export function registerGetPaidPilots(server: McpServer) {
  server.registerTool('get_paid_pilots', {
    title: 'Get Paid Pilots',
    description:
      'Returns paid pilot opportunities: active pilots, conversion rate, at-risk pilots ' +
      '(expiring within 30 days), and pilot details. Scoped to the user\'s role.',
    inputSchema: {
      status: z.enum(['active', 'converted', 'expired', 'lost', 'all']).optional()
        .describe('Filter by pilot status. Default: all'),
      at_risk_only: z.boolean().optional()
        .describe('If true, only return pilots expiring within 30 days'),
    },
  }, async (args, extra) => {
    const scope = await getScope(extra);
    const db = getSupabaseClient();

    let query = db
      .from('opportunities')
      .select('name, stage, acv, close_date, is_closed_won, is_closed_lost, paid_pilot_start_date, paid_pilot_end_date, accounts(name), users!opportunities_owner_user_id_fkey(full_name)')
      .eq('is_paid_pilot', true);

    query = scopedQuery(query, 'owner_user_id', scope);

    const { data, error } = await query.order('paid_pilot_end_date', { ascending: true, nullsFirst: false });

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No paid pilots found.' }] };
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pilots = data.map((opp: any) => {
      let status: string;
      if (opp.is_closed_won) status = 'Converted';
      else if (opp.is_closed_lost) status = 'Lost';
      else if (opp.paid_pilot_end_date && opp.paid_pilot_end_date < todayStr) status = 'Expired';
      else status = 'Active';

      const daysRemaining = opp.paid_pilot_end_date
        ? Math.ceil((new Date(opp.paid_pilot_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        opportunity: opp.name,
        account: opp.accounts?.name || 'N/A',
        owner: opp.users?.full_name || 'N/A',
        acv: fmtCurrency(opp.acv || 0),
        stage: opp.stage,
        status,
        pilot_start: opp.paid_pilot_start_date,
        pilot_end: opp.paid_pilot_end_date,
        days_remaining: daysRemaining,
        at_risk: status === 'Active' && daysRemaining !== null && daysRemaining <= 30,
      };
    });

    // Apply filters
    let filtered = pilots;
    if (args.status && args.status !== 'all') {
      filtered = filtered.filter((p: { status: string }) => p.status.toLowerCase() === args.status);
    }
    if (args.at_risk_only) {
      filtered = filtered.filter((p: { at_risk: boolean }) => p.at_risk);
    }

    // Summary
    const active = pilots.filter((p: { status: string }) => p.status === 'Active').length;
    const converted = pilots.filter((p: { status: string }) => p.status === 'Converted').length;
    const total = pilots.length;
    const atRisk = pilots.filter((p: { at_risk: boolean }) => p.at_risk).length;
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) + '%' : '0%';

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              total_pilots: total,
              active,
              converted,
              conversion_rate: conversionRate,
              at_risk: atRisk,
            },
            pilots: filtered,
          }, null, 2),
        },
      ],
    };
  });
}
