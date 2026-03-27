import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSupabaseClient } from '@/lib/supabase/client';
import { UserRole } from '@/types';

const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Resolve effective role from active permission override (if any)
  let effectiveRole = session.role;
  const db = getSupabaseClient();
  const { data: override } = await db
    .from('permission_overrides')
    .select('effective_role, reference_user_ids')
    .eq('user_id', session.user_id)
    .eq('is_active', true)
    .single();

  if (override) {
    const refIds: string[] = override.reference_user_ids || [];
    if (refIds.length > 0) {
      const { data: refUsers } = await db
        .from('users')
        .select('id, role')
        .in('id', refIds);
      const fullAccessRef = (refUsers || []).find(
        u => FULL_ACCESS_ROLES.includes(u.role as UserRole)
      );
      if (fullAccessRef) {
        effectiveRole = fullAccessRef.role as UserRole;
      }
    } else if (override.effective_role) {
      effectiveRole = override.effective_role as UserRole;
    }
  }

  return NextResponse.json({
    authenticated: true,
    user: { ...session, role: effectiveRole },
  });
}
