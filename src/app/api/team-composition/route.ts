import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';

const FULL_ACCESS_ROLES = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
const AE_ROLES = ['commercial_ae', 'enterprise_ae'];
const PBM_ROLES = ['pbm'];
/** Roles in the subtree that count as "AE reports" */
const AE_SUBTREE_ROLES = ['commercial_ae', 'enterprise_ae', 'other'];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;

    // Check for permission overrides first
    const db = getSupabaseClient();
    const { data: override } = await db
      .from('permission_overrides')
      .select('effective_role')
      .eq('user_id', targetUser.user_id)
      .eq('is_active', true)
      .single();

    if (override?.effective_role && FULL_ACCESS_ROLES.includes(override.effective_role)) {
      return NextResponse.json({
        data: { hasAeReports: true, hasPbmReports: true },
      });
    }

    // Full-access roles always see everything
    if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
      return NextResponse.json({
        data: { hasAeReports: true, hasPbmReports: true },
      });
    }

    // IC roles: AEs see AE view only
    if (AE_ROLES.includes(targetUser.role)) {
      return NextResponse.json({
        data: { hasAeReports: true, hasPbmReports: false },
      });
    }

    // PBM role: PBM view only
    if (PBM_ROLES.includes(targetUser.role)) {
      return NextResponse.json({
        data: { hasAeReports: false, hasPbmReports: true },
      });
    }

    // 'other' role (no override): neither view
    if (targetUser.role === 'other') {
      return NextResponse.json({
        data: { hasAeReports: false, hasPbmReports: false },
      });
    }

    // Leader role: resolve org subtree and check report roles
    if (targetUser.role === 'leader') {
      const subtreeUserIds = await getOrgSubtree(targetUser.user_id);

      if (subtreeUserIds.length === 0) {
        return NextResponse.json({
          data: { hasAeReports: false, hasPbmReports: false },
        });
      }

      // Query user roles in the subtree
      let hasAeReports = false;
      let hasPbmReports = false;
      const BATCH_SIZE = 50;

      for (let i = 0; i < subtreeUserIds.length; i += BATCH_SIZE) {
        const batch = subtreeUserIds.slice(i, i + BATCH_SIZE);
        const { data: users } = await db
          .from('users')
          .select('role')
          .in('id', batch)
          .eq('is_active', true);

        if (users) {
          for (const u of users) {
            if (AE_SUBTREE_ROLES.includes(u.role)) hasAeReports = true;
            if (PBM_ROLES.includes(u.role)) hasPbmReports = true;
          }
        }

        // Early exit if we've found both
        if (hasAeReports && hasPbmReports) break;
      }

      return NextResponse.json({
        data: { hasAeReports, hasPbmReports },
      });
    }

    // Fallback for any unhandled role
    return NextResponse.json({
      data: { hasAeReports: false, hasPbmReports: false },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
