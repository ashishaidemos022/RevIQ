/**
 * OAuth utility functions — PKCE verification and code generation.
 */

import crypto from 'crypto';

/** Generate a cryptographically random authorization code */
export function generateAuthCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Generate a cryptographically random client ID */
export function generateClientId(): string {
  return `client-${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Verify PKCE code_verifier against the stored code_challenge.
 * Only S256 is supported.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method !== 'S256') return false;

  const hash = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return hash === codeChallenge;
}
