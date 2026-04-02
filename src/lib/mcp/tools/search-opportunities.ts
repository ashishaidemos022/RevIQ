import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getScope, fmtCurrency } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { scopedQuery } from '@/lib/auth/middleware';

export function registerSearchOpportunities(server: McpServer) {
  server.registerTool('search_opportunities', {
    title: 'Search Opportunities',
    description:
      'Search and filter opportunities visible to the authenticated user. ' +
      'Filter by ACV amount, stage, close date range, account name, paid pilot status, etc. ' +
      'Results are scoped by the user\'s role — AEs see only their own deals, managers see their team, CRO sees all.',
    inputSchema: {
      min_acv: z.number().optional().describe('Minimum ACV in dollars'),
      max_acv: z.number().optional().describe('Maximum ACV in dollars'),
      stage: z.string().optional().describe('Stage name filter (exact match)'),
      status: z.enum(['open', 'closed_won', 'closed_lost', 'all']).optional().describe('Deal status filter. Default: all'),
      is_paid_pilot: z.boolean().optional().describe('Filter to paid pilots only'),
      account_name: z.string().optional().describe('Partial account name match (case-insensitive)'),
      close_date_from: z.string().optional().describe('Earliest close date (YYYY-MM-DD)'),
      close_date_to: z.string().optional().describe('Latest close date (YYYY-MM-DD)'),
      sort_by: z.enum(['acv', 'close_date', 'stage']).optional().describe('Sort field. Default: close_date'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
    },
  }, async (args, extra) => {
    const scope = await getScope(extra);
    const db = getSupabaseClient();

    let query = db
      .from('opportunities')
      .select('name, stage, acv, close_date, is_closed_won, is_closed_lost, is_paid_pilot, type, sub_type, accounts(name), users!opportunities_owner_user_id_fkey(full_name)');

    query = scopedQuery(query, 'owner_user_id', scope);

    // Status filter
    if (args.status === 'open') {
      query = query.eq('is_closed_won', false).eq('is_closed_lost', false);
    } else if (args.status === 'closed_won') {
      query = query.eq('is_closed_won', true);
    } else if (args.status === 'closed_lost') {
      query = query.eq('is_closed_lost', true);
    }

    if (args.min_acv) query = query.gte('acv', args.min_acv);
    if (args.max_acv) query = query.lte('acv', args.max_acv);
    if (args.stage) query = query.eq('stage', args.stage);
    if (args.is_paid_pilot !== undefined) query = query.eq('is_paid_pilot', args.is_paid_pilot);
    if (args.close_date_from) query = query.gte('close_date', args.close_date_from);
    if (args.close_date_to) query = query.lte('close_date', args.close_date_to);
    if (args.account_name) query = query.ilike('accounts.name', `%${args.account_name}%`);

    const sortCol = args.sort_by === 'acv' ? 'acv' : args.sort_by === 'stage' ? 'stage' : 'close_date';
    const sortAsc = sortCol === 'stage';
    query = query.order(sortCol, { ascending: sortAsc, nullsFirst: false });

    const limit = args.limit || 25;
    query = query.range(0, limit - 1);

    const { data, error } = await query;

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No opportunities found matching your criteria.' }] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = data.map((opp: any) => ({
      opportunity: opp.name,
      account: opp.accounts?.name || 'N/A',
      owner: opp.users?.full_name || 'N/A',
      stage: opp.stage,
      acv: fmtCurrency(opp.acv || 0),
      close_date: opp.close_date,
      status: opp.is_closed_won ? 'Closed Won' : opp.is_closed_lost ? 'Closed Lost' : 'Open',
      type: opp.type || 'N/A',
      paid_pilot: opp.is_paid_pilot ? 'Yes' : 'No',
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ count: formatted.length, opportunities: formatted }, null, 2),
        },
      ],
    };
  });
}
