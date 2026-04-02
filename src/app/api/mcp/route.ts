import { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@/lib/mcp/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { getBaseUrl } from '@/lib/mcp/oauth-config';

/**
 * MCP Streamable HTTP endpoint.
 *
 * Runs in stateless mode (no session tracking) — a fresh transport
 * and server are created per request. Auth comes from the Bearer token.
 */

/** Build the 401 response with WWW-Authenticate header per RFC 9728 */
function unauthorizedResponse(): Response {
  const base = getBaseUrl();
  const resourceMetadataUrl = `${base}/.well-known/oauth-protected-resource/api/mcp`;

  return new Response(
    JSON.stringify({ error: 'Unauthorized — Bearer token required' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
      },
    }
  );
}

function buildAuthInfo(request: NextRequest, user: { user_id: string; role: string; email: string; full_name: string }) {
  return {
    token: request.headers.get('authorization')?.slice(7) || '',
    clientId: 'mcp-client',
    scopes: ['read:data'],
    extra: {
      user_id: user.user_id,
      role: user.role,
      email: user.email,
      full_name: user.full_name,
    },
  };
}

export async function POST(request: NextRequest) {
  const user = await authenticateMcpRequest(request);
  if (!user) return unauthorizedResponse();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  return transport.handleRequest(request, { authInfo: buildAuthInfo(request, user) });
}

export async function GET(request: NextRequest) {
  const user = await authenticateMcpRequest(request);
  if (!user) return unauthorizedResponse();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  return transport.handleRequest(request, { authInfo: buildAuthInfo(request, user) });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
