/**
 * Shared helpers for MCP tool handlers.
 */

import { SessionUser, UserRole } from '@/types';
import { resolveDataScope, DataScope } from '@/lib/auth/middleware';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Extract the authenticated user from the MCP request's authInfo */
export function getUserFromExtra(extra: Extra): SessionUser {
  const authInfo = extra.authInfo;
  if (!authInfo?.extra) {
    throw new Error('Not authenticated');
  }
  const e = authInfo.extra as Record<string, string>;
  return {
    user_id: e.user_id,
    role: e.role as UserRole,
    email: e.email,
    full_name: e.full_name,
  };
}

/** Resolve data scope for the authenticated user */
export async function getScope(extra: Extra): Promise<DataScope> {
  const user = getUserFromExtra(extra);
  return resolveDataScope(user);
}

/** Format currency for display */
export function fmtCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(val);
}

/** Format percentage */
export function fmtPct(val: number): string {
  return `${val.toFixed(1)}%`;
}
