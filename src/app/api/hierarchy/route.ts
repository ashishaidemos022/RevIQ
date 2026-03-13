import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, handleAuthError } from '@/lib/auth/middleware';

const MANAGER_PLUS = ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

export async function GET() {
  try {
    const user = await requireAuth();

    if (!MANAGER_PLUS.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const scope = await resolveDataScope(user);
    const db = getSupabaseClient();

    // Get all users
    const { data: users, error: usersError } = await db
      .from('users')
      .select('id, full_name, email, role, region, is_active')
      .order('full_name');

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get active hierarchy records
    const { data: hierarchy } = await db
      .from('user_hierarchy')
      .select('user_id, manager_id')
      .is('effective_to', null);

    // Get active permission overrides
    const { data: overrides } = await db
      .from('permission_overrides')
      .select('user_id, effective_role')
      .eq('is_active', true);

    const hierarchyMap: Record<string, string> = {};
    (hierarchy || []).forEach((h: { user_id: string; manager_id: string }) => {
      hierarchyMap[h.user_id] = h.manager_id;
    });

    const overrideMap: Record<string, string> = {};
    (overrides || []).forEach((o: { user_id: string; effective_role: string }) => {
      overrideMap[o.user_id] = o.effective_role;
    });

    const userMap: Record<string, string> = {};
    (users || []).forEach((u: { id: string; full_name: string }) => {
      userMap[u.id] = u.full_name;
    });

    // Count direct reports
    const reportCounts: Record<string, number> = {};
    Object.values(hierarchyMap).forEach((managerId) => {
      reportCounts[managerId] = (reportCounts[managerId] || 0) + 1;
    });

    // Build response
    let enrichedUsers = (users || []).map((u: { id: string; full_name: string; email: string; role: string; region: string | null; is_active: boolean }) => ({
      ...u,
      manager_id: hierarchyMap[u.id] || null,
      manager_name: hierarchyMap[u.id] ? userMap[hierarchyMap[u.id]] || null : null,
      direct_report_count: reportCounts[u.id] || 0,
      has_override: !!overrideMap[u.id],
      effective_role: overrideMap[u.id] || null,
    }));

    // Scope filter for non-full-access roles
    if (!scope.allAccess) {
      enrichedUsers = enrichedUsers.filter(
        (u: { id: string }) => scope.userIds.includes(u.id) || u.id === user.user_id
      );
    }

    return NextResponse.json({ data: enrichedUsers });
  } catch (error) {
    return handleAuthError(error);
  }
}
