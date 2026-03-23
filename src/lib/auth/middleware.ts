import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './session';
import { UserRole, SessionUser } from '@/types';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getSupabaseClient } from '@/lib/supabase/client';
import { VIEW_AS_ROLES } from '@/lib/constants';

const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
const WRITE_ROLES: UserRole[] = ['revops_rw'];

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthError('Unauthorized', 401);
  }
  return session;
}

export function requireRole(user: SessionUser, ...allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError('Forbidden', 403);
  }
}

export function canWrite(user: SessionUser): boolean {
  return WRITE_ROLES.includes(user.role);
}

/**
 * Reads the `viewAs` query param, validates the caller is allowed to impersonate,
 * and returns the target user's SessionUser. Returns null if not impersonating.
 */
export async function resolveViewAs(
  request: NextRequest,
  authenticatedUser: SessionUser
): Promise<SessionUser | null> {
  const viewAsId = request.nextUrl.searchParams.get('viewAs');
  if (!viewAsId) return null;

  if (!VIEW_AS_ROLES.includes(authenticatedUser.role as UserRole)) {
    throw new AuthError('Forbidden: cannot use View As', 403);
  }

  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', viewAsId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new AuthError('View As target user not found', 404);
  }

  return {
    user_id: data.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role as UserRole,
  };
}

export interface DataScope {
  allAccess: boolean;
  userIds: string[];
  /** The root user ID for subtree-based scoping (used for RPC-based filtering) */
  rootUserId?: string;
}

export async function resolveDataScope(
  user: SessionUser,
  viewAsUser?: SessionUser | null
): Promise<DataScope> {
  const targetUser = viewAsUser ?? user;

  if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
    return { allAccess: true, userIds: [] };
  }

  // Check for permission overrides
  const db = getSupabaseClient();
  const { data: override } = await db
    .from('permission_overrides')
    .select('effective_role, reference_user_ids')
    .eq('user_id', targetUser.user_id)
    .eq('is_active', true)
    .single();

  if (override) {
    // New reference-user-based overrides: union the org subtrees of all reference users
    const refIds: string[] = override.reference_user_ids || [];
    if (refIds.length > 0) {
      const allUserIds = new Set<string>([targetUser.user_id]);
      for (const refId of refIds) {
        allUserIds.add(refId);
        const refSubtree = await getOrgSubtree(refId);
        refSubtree.forEach(id => allUserIds.add(id));
      }
      return { allAccess: false, userIds: [...allUserIds] };
    }

    // Legacy effective_role-based overrides
    if (override.effective_role && FULL_ACCESS_ROLES.includes(override.effective_role as UserRole)) {
      return { allAccess: true, userIds: [] };
    }
  }

  // For AEs (all AE types), only their own data
  if (['other', 'commercial_ae', 'enterprise_ae', 'pbm'].includes(targetUser.role) && !override) {
    return { allAccess: false, userIds: [targetUser.user_id] };
  }

  // For managers+, get org subtree
  const subtree = await getOrgSubtree(targetUser.user_id);
  return { allAccess: false, userIds: [targetUser.user_id, ...subtree], rootUserId: targetUser.user_id };
}

/**
 * Applies scope filtering to a Supabase query on a user ID column.
 * For small user lists (<= 50), uses .in() directly.
 * For large lists, batches into multiple .in() clauses joined with .or()
 * to avoid PostgREST URL length limits.
 */
const SCOPE_BATCH_SIZE = 50;

export function scopedQuery<T>(
  query: T,
  column: string,
  scope: DataScope
): T {
  if (scope.allAccess) return query;
  if (scope.userIds.length <= SCOPE_BATCH_SIZE) {
    return (query as any).in(column, scope.userIds) as T;
  }
  // Batch into chunks and join with OR
  const chunks: string[] = [];
  for (let i = 0; i < scope.userIds.length; i += SCOPE_BATCH_SIZE) {
    const batch = scope.userIds.slice(i, i + SCOPE_BATCH_SIZE);
    chunks.push(`${column}.in.(${batch.join(',')})`);
  }
  return (query as any).or(chunks.join(',')) as T;
}

/**
 * Applies batched .in() filtering for a raw array of IDs.
 * Use this when you have a derived ID list (not a DataScope) that may exceed PostgREST limits.
 */
export function batchedIn<T>(
  query: T,
  column: string,
  ids: string[]
): T {
  if (ids.length === 0) return query;
  if (ids.length <= SCOPE_BATCH_SIZE) {
    return (query as any).in(column, ids) as T;
  }
  const chunks: string[] = [];
  for (let i = 0; i < ids.length; i += SCOPE_BATCH_SIZE) {
    const batch = ids.slice(i, i + SCOPE_BATCH_SIZE);
    chunks.push(`${column}.in.(${batch.join(',')})`);
  }
  return (query as any).or(chunks.join(',')) as T;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  console.error('Unexpected error:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
