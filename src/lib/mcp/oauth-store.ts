/**
 * In-memory store for OAuth authorization codes and registered clients.
 *
 * No database writes — codes live in memory and expire quickly.
 * Tokens are self-validating JWTs (no storage needed).
 */

import { OAUTH_CONFIG } from './oauth-config';

export interface StoredAuthCode {
  userId: string;
  role: string;
  email: string;
  fullName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
  used: boolean;
}

export interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  registeredAt: number;
}

// --- Auth code store ---

const authCodes = new Map<string, StoredAuthCode>();

export function storeAuthCode(code: string, data: Omit<StoredAuthCode, 'used'>): void {
  authCodes.set(code, { ...data, used: false });
}

export function consumeAuthCode(code: string): StoredAuthCode | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  if (entry.used) return null;
  if (Date.now() > entry.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  entry.used = true;
  // Clean up after a short delay
  setTimeout(() => authCodes.delete(code), 5_000);
  return entry;
}

// Periodic cleanup of expired codes (runs at most once per minute)
let lastCleanup = 0;
export function cleanupExpiredCodes(): void {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [code, entry] of authCodes) {
    if (now > entry.expiresAt) authCodes.delete(code);
  }
}

// --- Dynamic client registration store ---

const registeredClients = new Map<string, RegisteredClient>();

// Pre-register a default client for simple usage
registeredClients.set(OAUTH_CONFIG.defaultClientId, {
  clientId: OAUTH_CONFIG.defaultClientId,
  clientName: 'Default MCP Client',
  redirectUris: [],  // empty = accept any redirect URI
  registeredAt: Date.now(),
});

export function registerClient(client: RegisteredClient): void {
  registeredClients.set(client.clientId, client);
}

export function getClient(clientId: string): RegisteredClient | null {
  return registeredClients.get(clientId) ?? null;
}
