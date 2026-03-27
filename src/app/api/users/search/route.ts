import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { VIEW_AS_ROLES } from '@/lib/constants';
import { UserRole } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!VIEW_AS_ROLES.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const db = getSupabaseClient();
    const pattern = `%${q}%`;

    const { data, error } = await db
      .from('users')
      .select('id, full_name, email, role, region')
      .eq('is_active', true)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('full_name')
      .limit(20);

    if (error) {
      console.error('[USERS_SEARCH] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve effective roles for users with active permission overrides
    const userIds = (data || []).map(u => u.id);
    const { data: overrides } = await db
      .from('permission_overrides')
      .select('user_id, effective_role, reference_user_ids')
      .in('user_id', userIds)
      .eq('is_active', true);

    // Build a map of user_id -> effective role from overrides
    const FULL_ACCESS_ROLES = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
    const overrideRoleMap: Record<string, string> = {};
    if (overrides && overrides.length > 0) {
      // For reference-user overrides, look up ref user roles
      const refIds = overrides
        .filter(o => o.reference_user_ids?.length > 0)
        .flatMap(o => o.reference_user_ids);
      let refRoleMap: Record<string, string> = {};
      if (refIds.length > 0) {
        const { data: refUsers } = await db
          .from('users')
          .select('id, role')
          .in('id', refIds);
        (refUsers || []).forEach(u => { refRoleMap[u.id] = u.role; });
      }

      for (const o of overrides) {
        // Reference-user model: if any ref user has full access, use their role
        if (o.reference_user_ids?.length > 0) {
          const fullAccessRef = o.reference_user_ids.find(
            (rid: string) => FULL_ACCESS_ROLES.includes(refRoleMap[rid])
          );
          if (fullAccessRef) {
            overrideRoleMap[o.user_id] = refRoleMap[fullAccessRef];
          }
        }
        // Legacy effective_role model
        if (!overrideRoleMap[o.user_id] && o.effective_role) {
          overrideRoleMap[o.user_id] = o.effective_role;
        }
      }
    }

    return NextResponse.json({
      data: (data || []).map(u => ({
        user_id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: overrideRoleMap[u.id] || u.role,
        region: u.region,
      })),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
