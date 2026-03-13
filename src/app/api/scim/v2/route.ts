import { NextRequest, NextResponse } from 'next/server';

function validateScimToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.SCIM_BEARER_TOKEN;
}

// GET /api/scim/v2 — ServiceProviderConfig (Okta connection test)
export async function GET(request: NextRequest) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: null,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication scheme using the OAuth Bearer Token Standard',
      },
    ],
  });
}
