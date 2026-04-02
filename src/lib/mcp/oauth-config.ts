/**
 * OAuth 2.0 configuration for MCP server authentication.
 *
 * Since the demo environment has no Okta, we provide a lightweight
 * OAuth 2.0 Authorization Code + PKCE flow where "logging in" means
 * picking a demo persona.
 */

export const OAUTH_CONFIG = {
  /** Public client — no client_secret required (PKCE protects the flow) */
  defaultClientId: 'mcp-client',

  /** Auth code lifetime in seconds */
  codeLifetimeSec: 120,

  /** Access token lifetime in seconds (8 hours) */
  tokenLifetimeSec: 8 * 60 * 60,

  /** Scopes the server understands (informational only for now) */
  supportedScopes: ['read:data'] as const,
} as const;

/** Derive the base URL at runtime so it works in dev and on Vercel */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}
