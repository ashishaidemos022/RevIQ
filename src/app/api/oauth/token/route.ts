import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { OAUTH_CONFIG } from '@/lib/mcp/oauth-config';
import { consumeAuthCode, cleanupExpiredCodes } from '@/lib/mcp/oauth-store';
import { verifyPkce } from '@/lib/mcp/oauth-utils';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET environment variable');
  return new TextEncoder().encode(secret);
}

/**
 * POST /api/oauth/token
 *
 * Exchanges an authorization code + PKCE verifier for a JWT access token.
 */
export async function POST(request: NextRequest) {
  cleanupExpiredCodes();

  // Accept both form-urlencoded and JSON bodies
  const contentType = request.headers.get('content-type') || '';
  let params: Record<string, string>;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    params = Object.fromEntries(form.entries()) as Record<string, string>;
  } else if (contentType.includes('application/json')) {
    params = await request.json();
  } else {
    // Try form-urlencoded as default
    try {
      const text = await request.text();
      params = Object.fromEntries(new URLSearchParams(text).entries());
    } catch {
      return NextResponse.json({ error: 'unsupported_content_type' }, { status: 400 });
    }
  }

  const {
    grant_type,
    code,
    code_verifier,
    redirect_uri,
    client_id,
  } = params;

  // Validate grant_type
  if (grant_type !== 'authorization_code') {
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing code' },
      { status: 400 }
    );
  }

  if (!code_verifier) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing code_verifier (PKCE required)' },
      { status: 400 }
    );
  }

  // Consume the code (single-use)
  const stored = consumeAuthCode(code);
  if (!stored) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid, expired, or already-used authorization code' },
      { status: 400 }
    );
  }

  // Verify redirect_uri matches
  if (redirect_uri && redirect_uri !== stored.redirectUri) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'redirect_uri mismatch' },
      { status: 400 }
    );
  }

  // Verify client_id matches
  if (client_id && client_id !== stored.clientId) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'client_id mismatch' },
      { status: 400 }
    );
  }

  // Verify PKCE
  if (!verifyPkce(code_verifier, stored.codeChallenge, stored.codeChallengeMethod)) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'PKCE verification failed' },
      { status: 400 }
    );
  }

  // Issue JWT access token with the same claims as the web app session
  const accessToken = await new SignJWT({
    user_id: stored.userId,
    role: stored.role,
    email: stored.email,
    full_name: stored.fullName,
    token_type: 'mcp_access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_CONFIG.tokenLifetimeSec}s`)
    .sign(getJwtSecret());

  return NextResponse.json({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: OAUTH_CONFIG.tokenLifetimeSec,
    scope: 'read:data',
  });
}
