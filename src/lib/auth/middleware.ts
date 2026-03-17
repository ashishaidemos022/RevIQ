import { NextResponse } from 'next/server';
import { getSession } from './session';
import { UserRole, SessionUser } from '@/types';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';
import { getSupabaseClient } from '@/lib/supabase/client';

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

export async function resolveDataScope(user: SessionUser): Promise<{
  allAccess: boolean;
  userIds: string[];
}> {
  if (FULL_ACCESS_ROLES.includes(user.role)) {
    return { allAccess: true, userIds: [] };
  }

  // Check for permission overrides
  const db = getSupabaseClient();
  const { data: override } = await db
    .from('permission_overrides')
    .select('effective_role')
    .eq('user_id', user.user_id)
    .eq('is_active', true)
    .single();

  if (override && FULL_ACCESS_ROLES.includes(override.effective_role as UserRole)) {
    return { allAccess: true, userIds: [] };
  }

  // For AEs (all AE types), only their own data
  if (['ae', 'commercial_ae', 'enterprise_ae'].includes(user.role) && !override) {
    return { allAccess: false, userIds: [user.user_id] };
  }

  // For managers+, get org subtree
  const subtree = await getOrgSubtree(user.user_id);
  return { allAccess: false, userIds: [user.user_id, ...subtree] };
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
