import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

const DEBUG_ROLES = ['revops_rw'];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!DEBUG_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();
    const filter = request.nextUrl.searchParams.get('filter') || 'all';

    // Get all hierarchy records
    let query = db
      .from('user_hierarchy')
      .select('*, users!user_hierarchy_user_id_fkey(full_name, email, role), manager:users!user_hierarchy_manager_id_fkey(full_name, email)')
      .order('effective_from', { ascending: false });

    const { data: records, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get all user IDs to detect orphans
    const { data: allUsers } = await db
      .from('users')
      .select('id, full_name, email, role');

    const usersWithHierarchy = new Set(
      (records || []).map((r: { user_id: string }) => r.user_id)
    );

    let result = (records || []).map((r: Record<string, unknown>) => {
      const userData = r.users as { full_name: string; email: string; role: string } | null;
      const managerData = r.manager as { full_name: string; email: string } | null;
      let status = 'Historical';
      if (r.effective_to === null) status = 'Active';
      if (!managerData) status = 'Orphan';

      return {
        id: r.id,
        user_name: userData?.full_name || 'Unknown',
        user_email: userData?.email || '',
        user_role: userData?.role || '',
        manager_name: managerData?.full_name || null,
        manager_email: managerData?.email || null,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        status,
      };
    });

    // Add orphan users (users with no hierarchy record at all)
    const orphanUsers = (allUsers || []).filter(
      (u: { id: string }) => !usersWithHierarchy.has(u.id)
    );
    orphanUsers.forEach((u: { id: string; full_name: string; email: string; role: string }) => {
      result.push({
        id: `orphan-${u.id}`,
        user_name: u.full_name,
        user_email: u.email,
        user_role: u.role,
        manager_name: null,
        manager_email: null,
        effective_from: '',
        effective_to: null,
        status: 'Orphan',
      });
    });

    // Apply filter
    if (filter === 'active') {
      result = result.filter((r: { status: string }) => r.status === 'Active');
    } else if (filter === 'historical') {
      result = result.filter((r: { status: string }) => r.status === 'Historical');
    } else if (filter === 'orphans') {
      result = result.filter((r: { status: string }) => r.status === 'Orphan');
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
