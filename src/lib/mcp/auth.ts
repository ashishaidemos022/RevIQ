/**
 * MCP request authentication — validates Bearer tokens.
 *
 * Reuses the same JWT_SECRET and jose library as the web app's session system.
 */

import { jwtVerify } from 'jose';
import { SessionUser, UserRole } from '@/types';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET environment variable');
  return new TextEncoder().encode(secret);
}

/**
 * Extract and validate the Bearer token from a request's Authorization header.
 * Returns the authenticated user or null if invalid/missing.
 */
export async function authenticateMcpRequest(
  request: Request
): Promise<SessionUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      user_id: payload.user_id as string,
      role: payload.role as UserRole,
      email: payload.email as string,
      full_name: payload.full_name as string,
    };
  } catch {
    return null;
  }
}
