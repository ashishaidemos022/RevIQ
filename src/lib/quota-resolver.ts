import { FULL_ACCESS_ROLES } from '@/lib/constants';

/**
 * Resolves which user's quota to use for attainment calculations.
 *
 * Rule: each user's attainment is measured against their OWN assigned quota.
 * For full-access admin roles (revops_rw, revops_ro, enterprise_ro) without
 * a personal quota context, we fall back to the CRO's quota as the company benchmark.
 */

const ADMIN_ROLES_WITHOUT_QUOTA = ['revops_rw', 'revops_ro', 'enterprise_ro'];

export async function resolveQuotaUserId(
  targetUser: { user_id: string; role: string },
  db: ReturnType<typeof import('@/lib/supabase/client').getSupabaseClient>
): Promise<string> {
  // If the target user is an admin role that doesn't carry a personal quota,
  // resolve to the CRO's user ID for company-wide quota
  if (ADMIN_ROLES_WITHOUT_QUOTA.includes(targetUser.role)) {
    const { data: cro } = await db
      .from('users')
      .select('id')
      .eq('role', 'cro')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (cro) return cro.id;
  }

  // Everyone else (AE, manager, VP, CRO, C-Level) uses their own quota
  return targetUser.user_id;
}
