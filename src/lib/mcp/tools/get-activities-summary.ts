import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserFromExtra, getScope } from './helpers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from '@/lib/fiscal';

export function registerGetActivitiesSummary(server: McpServer) {
  server.registerTool('get_activities_summary', {
    title: 'Get Activities Summary',
    description:
      'Returns activity counts (calls, emails, meetings, LinkedIn) for the current quarter. ' +
      'Scoped to the authenticated user\'s role — AEs see their own, managers see their team.',
    inputSchema: {
      fiscal_year: z.number().optional().describe('Fiscal year. Defaults to current.'),
      fiscal_quarter: z.number().min(1).max(4).optional().describe('Fiscal quarter. Defaults to current.'),
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
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];

    // Get user SF IDs for scope
    let sfIds: string[] = [];
    if (scope.allAccess) {
      const { data: sfUsers } = await db
        .from('users')
        .select('salesforce_user_id')
        .in('role', ['commercial_ae', 'enterprise_ae'])
        .not('salesforce_user_id', 'is', null);
      sfIds = (sfUsers || []).map(u => u.salesforce_user_id).filter(Boolean);
    } else {
      const { data: sfUsers } = await db
        .from('users')
        .select('salesforce_user_id')
        .in('id', scope.userIds)
        .not('salesforce_user_id', 'is', null);
      sfIds = (sfUsers || []).map(u => u.salesforce_user_id).filter(Boolean);
    }

    if (sfIds.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ period: `Q${fq} FY${fy}`, total: 0, calls: 0, emails: 0, meetings: 0, linkedin: 0 }, null, 2),
        }],
      };
    }

    const { data: acts } = await db
      .from('activity_daily_summary')
      .select('activity_count, call_count, email_count, meeting_count, linkedin_count')
      .in('owner_sf_id', sfIds)
      .gte('activity_date', qStartStr)
      .lte('activity_date', qEndStr);

    const totals = (acts || []).reduce(
      (acc, a) => ({
        total: acc.total + (a.activity_count || 0),
        calls: acc.calls + (a.call_count || 0),
        emails: acc.emails + (a.email_count || 0),
        meetings: acc.meetings + (a.meeting_count || 0),
        linkedin: acc.linkedin + (a.linkedin_count || 0),
      }),
      { total: 0, calls: 0, emails: 0, meetings: 0, linkedin: 0 }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            period: `Q${fq} FY${fy}`,
            ...totals,
          }, null, 2),
        },
      ],
    };
  });
}
