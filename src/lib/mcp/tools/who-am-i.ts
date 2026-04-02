import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserFromExtra } from './helpers';
import { FULL_ACCESS_ROLES, MANAGER_PLUS_ROLES, AE_ROLES } from '@/lib/constants';

export function registerWhoAmI(server: McpServer) {
  server.registerTool('who_am_i', {
    title: 'Who Am I',
    description:
      'Returns the currently authenticated user\'s identity, role, and data access level. ' +
      'Use this to understand what data the current user can see before making other queries.',
  }, async (extra) => {
    const user = getUserFromExtra(extra);

    let accessLevel: string;
    if (FULL_ACCESS_ROLES.includes(user.role)) {
      accessLevel = 'Full company — all regions, all AEs, all data';
    } else if (MANAGER_PLUS_ROLES.includes(user.role)) {
      accessLevel = 'Team view — own data plus all direct and transitive reports';
    } else if (AE_ROLES.includes(user.role)) {
      accessLevel = 'Individual — own opportunities, pipeline, and commissions only';
    } else if (user.role === 'pbm') {
      accessLevel = 'PBM — own PBM-credited opportunities only';
    } else {
      accessLevel = 'Limited — leaderboard access only';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            access_level: accessLevel,
          }, null, 2),
        },
      ],
    };
  });
}
