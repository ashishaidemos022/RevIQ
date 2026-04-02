/**
 * MCP Server instance with all tool registrations.
 *
 * Creates a fresh McpServer per-request (stateless mode).
 * Each tool validates the authenticated user via `extra.authInfo`
 * and applies the same RBAC as the web API routes.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'td-revenueiq',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerAllTools(server);

  return server;
}
