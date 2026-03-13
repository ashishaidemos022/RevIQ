import { getSupabaseClient } from '../client';

/**
 * Recursively resolves all user IDs in an org subtree starting from a given manager.
 * Returns all transitive report user IDs (not including the manager themselves).
 */
export async function getOrgSubtree(managerId: string): Promise<string[]> {
  const db = getSupabaseClient();

  // Use a recursive CTE to traverse the hierarchy
  const { data, error } = await db.rpc('get_org_subtree', {
    root_user_id: managerId,
  });

  if (error) {
    console.error('Error resolving org subtree:', error);
    // Fallback to iterative approach
    return getOrgSubtreeIterative(managerId);
  }

  return (data as { user_id: string }[]).map((row) => row.user_id);
}

/**
 * Iterative fallback for resolving org subtree (used if RPC not available).
 */
async function getOrgSubtreeIterative(managerId: string): Promise<string[]> {
  const db = getSupabaseClient();
  const allUserIds: string[] = [];
  const queue: string[] = [managerId];

  while (queue.length > 0) {
    const currentManagerId = queue.shift()!;

    const { data: reports } = await db
      .from('user_hierarchy')
      .select('user_id')
      .eq('manager_id', currentManagerId)
      .is('effective_to', null);

    if (reports) {
      for (const report of reports) {
        allUserIds.push(report.user_id);
        queue.push(report.user_id);
      }
    }
  }

  return allUserIds;
}

/**
 * Gets the direct manager of a user.
 */
export async function getDirectManager(userId: string): Promise<string | null> {
  const db = getSupabaseClient();

  const { data } = await db
    .from('user_hierarchy')
    .select('manager_id')
    .eq('user_id', userId)
    .is('effective_to', null)
    .single();

  return data?.manager_id ?? null;
}

/**
 * Gets direct reports for a manager.
 */
export async function getDirectReports(managerId: string): Promise<string[]> {
  const db = getSupabaseClient();

  const { data } = await db
    .from('user_hierarchy')
    .select('user_id')
    .eq('manager_id', managerId)
    .is('effective_to', null);

  return (data ?? []).map((row) => row.user_id);
}
