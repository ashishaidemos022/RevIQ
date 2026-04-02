import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/mcp/oauth-config';

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * MCP clients discover this to learn where to send auth requests.
 */
export async function GET() {
  const base = getBaseUrl();

  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read:data'],
  });
}
