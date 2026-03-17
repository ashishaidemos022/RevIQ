import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { syncSalesforceUsers } from '@/lib/salesforce/sync-users';
import { syncSalesforceAccounts } from '@/lib/salesforce/sync-accounts';
import { syncRVAccounts } from '@/lib/salesforce/sync-rv-accounts';
import { syncSalesforceOpportunities } from '@/lib/salesforce/sync-opportunities';

const SYNC_ROLES = ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_rw'];

export async function POST() {
  try {
    const user = await requireAuth();

    if (!SYNC_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();

    // Log sync start
    const { data: logEntry } = await db
      .from('sync_log')
      .insert({
        sync_type: 'salesforce',
        triggered_by: user.user_id !== 'dev-admin' ? user.user_id : null,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select()
      .single();

    try {
      // Step 1: Sync Users (map SF User IDs to local users)
      const userResult = await syncSalesforceUsers();

      // Step 2: Sync Accounts (requires user mapping from step 1)
      const accountResult = await syncSalesforceAccounts();

      // Step 3: Sync RV Accounts (partner accounts)
      const rvAccountResult = await syncRVAccounts();

      // Step 4: Sync Opportunities (requires accounts from step 2)
      const oppResult = await syncSalesforceOpportunities();

      // TODO: Sync Activities

      const totalRecords = userResult.matched + accountResult.synced + rvAccountResult.synced + oppResult.synced;
      const allErrors = [
        ...userResult.errors,
        ...accountResult.errors,
        ...rvAccountResult.errors,
        ...oppResult.errors,
      ];
      const hasErrors = allErrors.length > 0;

      if (logEntry) {
        await db
          .from('sync_log')
          .update({
            completed_at: new Date().toISOString(),
            status: hasErrors ? 'partial' : 'success',
            records_synced: totalRecords,
            error_message: hasErrors ? JSON.stringify({ errors: allErrors }) : null,
          })
          .eq('id', logEntry.id);
      }

      return NextResponse.json({
        message: 'Salesforce sync completed',
        users: userResult,
        accounts: accountResult,
        rv_accounts: rvAccountResult,
        opportunities: oppResult,
      });
    } catch (syncError) {
      // Update sync log with failure
      if (logEntry) {
        await db
          .from('sync_log')
          .update({
            completed_at: new Date().toISOString(),
            status: 'failed',
            error_message: syncError instanceof Error ? syncError.message : 'Unknown error',
          })
          .eq('id', logEntry.id);
      }

      console.error('Salesforce sync error:', syncError);
      return NextResponse.json(
        {
          error: 'Salesforce sync failed',
          detail: syncError instanceof Error ? syncError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
