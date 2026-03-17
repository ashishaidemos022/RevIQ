import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

/**
 * Returns all managers who have at least one active AE (commercial_ae or enterprise_ae) reporting to them.
 */
export async function GET() {
  try {
    await requireAuth();
    const db = getSupabaseClient();

    // Get all active hierarchy rows
    const { data: hierarchyRows } = await db
      .from('user_hierarchy')
      .select('manager_id, user_id')
      .is('effective_to', null);

    if (!hierarchyRows || hierarchyRows.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get all active AEs
    const aeUserIds = new Set(
      hierarchyRows.map(r => r.user_id)
    );

    const { data: aeUsers } = await db
      .from('users')
      .select('id')
      .in('role', ['commercial_ae', 'enterprise_ae'])
      .eq('is_active', true);

    const activeAeIds = new Set((aeUsers ?? []).map(u => u.id));

    // Find managers who have at least one active AE as a direct report
    const managerIds = [
      ...new Set(
        hierarchyRows
          .filter(r => activeAeIds.has(r.user_id))
          .map(r => r.manager_id)
      ),
    ];

    if (managerIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data: managers } = await db
      .from('users')
      .select('id, full_name, region')
      .in('id', managerIds)
      .eq('is_active', true)
      .order('full_name');

    return NextResponse.json({ data: managers ?? [] });
  } catch (error) {
    return handleAuthError(error);
  }
}
