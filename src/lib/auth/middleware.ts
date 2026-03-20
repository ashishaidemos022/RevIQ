import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './session';
import { UserRole, SessionUser } from '@/types';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getSupabaseClient } from '@/lib/supabase/client';
import { VIEW_AS_ROLES } from '@/lib/constants';

const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
const WRITE_ROLES: UserRole[] = ['cro', 'c_level', 'revops_rw'];

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
  return WRITE_ROLES.includes(user.role) || user.role === 'vp';
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

export async function resolveDataScope(
  user: SessionUser,
  viewAsUser?: SessionUser | null
): Promise<{
  allAccess: boolean;
  userIds: string[];
}> {
  const targetUser = viewAsUser ?? user;

  if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
    return { allAccess: true, userIds: [] };
  }

  // Check for permission overrides
  const db = getSupabaseClient();
  const { data: override } = await db
    .from('permission_overrides')
    .select('effective_role')
    .eq('user_id', targetUser.user_id)
    .eq('is_active', true)
    .single();

  if (override && FULL_ACCESS_ROLES.includes(override.effective_role as UserRole)) {
    return { allAccess: true, userIds: [] };
  }

  // For AEs (all AE types), only their own data
  if (['ae', 'commercial_ae', 'enterprise_ae', 'pbm'].includes(targetUser.role) && !override) {
    return { allAccess: false, userIds: [targetUser.user_id] };
  }

  // For managers+, get org subtree
  const subtree = await getOrgSubtree(targetUser.user_id);
  return { allAccess: false, userIds: [targetUser.user_id, ...subtree] };
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
