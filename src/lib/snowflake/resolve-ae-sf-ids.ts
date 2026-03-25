import { getSupabaseClient } from '@/lib/supabase/client';
import { DataScope } from '@/lib/auth/middleware';
import { AE_ROLES } from '@/lib/constants';

/**
 * Resolves AE Salesforce User IDs for a given data scope.
 * Used by activities API, leaderboard, and team routes to query activity_daily_summary.
 *
 * Returns a map of SF User ID → { user_id, full_name, region } for AEs in scope.
 */
export interface AeInfo {
  user_id: string;
  full_name: string;
  region: string | null;
  salesforce_user_id: string;
}

export async function resolveAeSfIds(
  scope: DataScope
): Promise<Map<string, AeInfo>> {
  const db = getSupabaseClient();

  let query = db
    .from('users')
    .select('id, salesforce_user_id, full_name, region, role')
    .in('role', AE_ROLES)
    .eq('is_active', true)
    .not('salesforce_user_id', 'is', null);

  // If not full access, filter to scoped user IDs
  if (!scope.allAccess) {
    if (scope.userIds.length === 0) {
      return new Map();
    }
    query = query.in('id', scope.userIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to resolve AE SF IDs:', error.message);
    return new Map();
  }

  const map = new Map<string, AeInfo>();
  for (const u of data || []) {
    if (u.salesforce_user_id) {
      map.set(u.salesforce_user_id, {
        user_id: u.id,
        full_name: u.full_name,
        region: u.region,
        salesforce_user_id: u.salesforce_user_id,
      });
    }
  }

  return map;
}
