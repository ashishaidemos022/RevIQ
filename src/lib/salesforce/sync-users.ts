import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceUser {
  Id: string;
  Email: string;
  Name: string;
  IsActive: boolean;
}

export interface UserSyncResult {
  total_sf_users: number;
  matched: number;
  errors: string[];
}

export async function syncSalesforceUsers(): Promise<UserSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Query all active Salesforce users with email
  const sfUsers: SalesforceUser[] = [];
  const query = conn.query<SalesforceUser>(
    "SELECT Id, Email, Name, IsActive FROM User WHERE IsActive = true AND Email != null AND Email LIKE '%@talkdesk.com'"
  );

  // Use event-based approach to handle large result sets with automatic pagination
  await new Promise<void>((resolve, reject) => {
    query.on('record', (record: SalesforceUser) => {
      sfUsers.push(record);
    });
    query.on('end', () => resolve());
    query.on('error', (err: Error) => reject(err));
    query.run({ autoFetch: true, maxFetch: 10000 });
  });

  const result: UserSyncResult = {
    total_sf_users: sfUsers.length,
    matched: 0,
    errors: [],
  };

  // Fetch all active local users for email matching
  const { data: localUsers, error: fetchError } = await db
    .from('users')
    .select('id, email, salesforce_user_id')
    .eq('is_active', true);

  if (fetchError) {
    throw new Error(`Failed to fetch local users: ${fetchError.message}`);
  }

  // Build email→local user lookup (lowercase for case-insensitive matching)
  const localUsersByEmail = new Map(
    (localUsers || []).map((u) => [u.email.toLowerCase(), u])
  );

  // Match and update
  for (const sfUser of sfUsers) {
    const email = sfUser.Email.toLowerCase();
    const localUser = localUsersByEmail.get(email);

    if (!localUser) {
      continue;
    }

    // Skip if already mapped to the same SF ID
    if (localUser.salesforce_user_id === sfUser.Id) {
      result.matched++;
      continue;
    }

    // Update salesforce_user_id
    const { error: updateError } = await db
      .from('users')
      .update({
        salesforce_user_id: sfUser.Id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', localUser.id);

    if (updateError) {
      result.errors.push(`Failed to update ${sfUser.Email}: ${updateError.message}`);
    } else {
      result.matched++;
    }
  }

  return result;
}
