import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/mcp/oauth-config';

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * MCP clients fetch this to discover which authorization server
 * protects the /api/mcp resource.
 *
 * Path follows the spec: /.well-known/oauth-protected-resource{resource_path}
 * Since our MCP endpoint is /api/mcp, this lives at:
 * /.well-known/oauth-protected-resource/api/mcp
 */
export async function GET() {
  const base = getBaseUrl();

  return NextResponse.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: ['read:data'],
    resource_name: 'TD RevenueIQ MCP Server',
  });
}
