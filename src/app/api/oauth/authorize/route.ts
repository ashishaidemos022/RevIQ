import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CONFIG } from '@/lib/mcp/oauth-config';
import { storeAuthCode, cleanupExpiredCodes, getClient } from '@/lib/mcp/oauth-store';
import { generateAuthCode } from '@/lib/mcp/oauth-utils';

/**
 * POST /api/oauth/authorize
 *
 * Receives the persona selection from the authorize page,
 * generates an authorization code, and redirects back to the client.
 */
export async function POST(request: NextRequest) {
  cleanupExpiredCodes();

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const userId = form.get('user_id') as string;
  const role = form.get('role') as string;
  const fullName = form.get('full_name') as string;
  const email = form.get('email') as string;
  const clientId = form.get('client_id') as string;
  const redirectUri = form.get('redirect_uri') as string;
  const state = form.get('state') as string;
  const codeChallenge = form.get('code_challenge') as string;
  const codeChallengeMethod = form.get('code_challenge_method') as string || 'S256';

  // Validate required fields
  if (!userId || !role || !fullName || !email) {
    return NextResponse.json({ error: 'Missing user fields' }, { status: 400 });
  }
  if (!redirectUri) {
    return NextResponse.json({ error: 'Missing redirect_uri' }, { status: 400 });
  }
  if (!codeChallenge) {
    return NextResponse.json({ error: 'Missing code_challenge (PKCE required)' }, { status: 400 });
  }
  if (codeChallengeMethod !== 'S256') {
    return NextResponse.json({ error: 'Only S256 code_challenge_method is supported' }, { status: 400 });
  }

  // Validate client if registered
  const effectiveClientId = clientId || OAUTH_CONFIG.defaultClientId;
  const client = getClient(effectiveClientId);
  if (client && client.redirectUris.length > 0) {
    if (!client.redirectUris.includes(redirectUri)) {
      return NextResponse.json({ error: 'redirect_uri not registered for this client' }, { status: 400 });
    }
  }

  // Generate auth code
  const code = generateAuthCode();
  storeAuthCode(code, {
    userId,
    role,
    email,
    fullName,
    clientId: effectiveClientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: Date.now() + OAUTH_CONFIG.codeLifetimeSec * 1000,
  });

  // Build redirect URL
  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  // Return the redirect URI in JSON (the client-side page handles the redirect)
  return NextResponse.json({ redirect_uri: redirect.toString() });
}
