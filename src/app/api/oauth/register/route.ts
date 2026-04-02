import { NextRequest, NextResponse } from 'next/server';
import { registerClient } from '@/lib/mcp/oauth-store';
import { generateClientId } from '@/lib/mcp/oauth-utils';

/**
 * POST /api/oauth/register
 *
 * RFC 7591 — Dynamic Client Registration.
 * MCP clients that support dynamic registration will call this
 * before starting the OAuth flow.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 });
  }

  const clientName = (body.client_name as string) || 'MCP Client';
  const redirectUris = (body.redirect_uris as string[]) || [];

  const clientId = generateClientId();

  registerClient({
    clientId,
    clientName,
    redirectUris,
    registeredAt: Date.now(),
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
    },
    { status: 201 }
  );
}
