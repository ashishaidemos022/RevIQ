import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getScope, fmtCurrency } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { scopedQuery } from '@/lib/auth/middleware';

export function registerGetAccountDetails(server: McpServer) {
  server.registerTool('get_account_details', {
    title: 'Get Account Details',
    description:
      'Look up an account by name and return its details plus linked opportunities. ' +
      'Opportunities are scoped to the user\'s role.',
    inputSchema: {
      account_name: z.string().describe('Full or partial account name (case-insensitive search)'),
      include_closed: z.boolean().optional().describe('Include closed opportunities. Default: false'),
    },
  }, async (args, extra) => {
    const scope = await getScope(extra);
    const db = getSupabaseClient();

    // Find accounts matching the name
    const { data: accounts, error: acctError } = await db
      .from('accounts')
      .select('id, name, industry, region, salesforce_account_id')
      .ilike('name', `%${args.account_name}%`)
      .limit(5);

    if (acctError) {
      return { content: [{ type: 'text' as const, text: `Error: ${acctError.message}` }], isError: true };
    }

    if (!accounts || accounts.length === 0) {
      return { content: [{ type: 'text' as const, text: `No accounts found matching "${args.account_name}".` }] };
    }

    // For each account, get its opportunities (scoped)
    const results = [];
    for (const account of accounts) {
      let oppQuery = db
        .from('opportunities')
        .select('name, stage, acv, close_date, is_closed_won, is_closed_lost, is_paid_pilot, type, users!opportunities_owner_user_id_fkey(full_name)')
        .eq('account_id', account.id);

      oppQuery = scopedQuery(oppQuery, 'owner_user_id', scope);

      if (!args.include_closed) {
        oppQuery = oppQuery.eq('is_closed_won', false).eq('is_closed_lost', false);
      }

      const { data: opps } = await oppQuery.order('close_date', { ascending: false }).limit(20);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedOpps = (opps || []).map((o: any) => ({
        opportunity: o.name,
        owner: o.users?.full_name || 'N/A',
        stage: o.stage,
        acv: fmtCurrency(o.acv || 0),
        close_date: o.close_date,
        status: o.is_closed_won ? 'Closed Won' : o.is_closed_lost ? 'Closed Lost' : 'Open',
        paid_pilot: o.is_paid_pilot ? 'Yes' : 'No',
      }));

      results.push({
        account: {
          name: account.name,
          industry: account.industry,
          region: account.region,
        },
        opportunities: formattedOpps,
        total_open_acv: fmtCurrency(
          (opps || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((o: any) => !o.is_closed_won && !o.is_closed_lost)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .reduce((s: number, o: any) => s + (o.acv || 0), 0)
        ),
      });
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(results.length === 1 ? results[0] : results, null, 2),
        },
      ],
    };
  });
}
