/**
 * Register all MCP tools on the server instance.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWhoAmI } from './who-am-i';
import { registerGetMyKpis } from './get-my-kpis';
import { registerSearchOpportunities } from './search-opportunities';
import { registerGetPipelineSummary } from './get-pipeline-summary';
import { registerGetLeaderboard } from './get-leaderboard';
import { registerGetPaidPilots } from './get-paid-pilots';
import { registerGetTeamOverview } from './get-team-overview';
import { registerGetAccountDetails } from './get-account-details';
import { registerGetActivitiesSummary } from './get-activities-summary';

export function registerAllTools(server: McpServer) {
  registerWhoAmI(server);
  registerGetMyKpis(server);
  registerSearchOpportunities(server);
  registerGetPipelineSummary(server);
  registerGetLeaderboard(server);
  registerGetPaidPilots(server);
  registerGetTeamOverview(server);
  registerGetAccountDetails(server);
  registerGetActivitiesSummary(server);
}
