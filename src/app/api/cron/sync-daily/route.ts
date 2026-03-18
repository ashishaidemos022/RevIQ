export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { syncSalesforceUsers } from '@/lib/salesforce/sync-users';
import { syncSalesforceAccounts } from '@/lib/salesforce/sync-accounts';
import { syncRVAccounts } from '@/lib/salesforce/sync-rv-accounts';

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET env var is not set');
    return false;
  }

  if (!authHeader) {
    console.error('No Authorization header received from cron request');
    return false;
  }

  if (authHeader === `Bearer ${cronSecret}`) return true;
  if (authHeader === cronSecret) return true;

  console.error('CRON_SECRET mismatch — header length:', authHeader.length, 'expected length:', `Bearer ${cronSecret}`.length);
  return false;
}

// Daily sync: Users, Accounts, RV Accounts
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return new NextResponse(null, { status: 401 });
  }

  const db = getSupabaseClient();

  const { data: logEntry } = await db
    .from('sync_log')
    .insert({
      sync_type: 'salesforce',
      triggered_by: null,
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .select()
    .single();

  try {
    const userResult = await syncSalesforceUsers();
    const accountResult = await syncSalesforceAccounts();
    const rvAccountResult = await syncRVAccounts();

    const totalRecords = userResult.matched + accountResult.synced + rvAccountResult.synced;
    const allErrors = [...userResult.errors, ...accountResult.errors, ...rvAccountResult.errors];

    if (logEntry) {
      await db
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: allErrors.length > 0 ? 'partial' : 'success',
          records_synced: totalRecords,
          error_message: allErrors.length > 0 ? JSON.stringify({ errors: allErrors }) : null,
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      message: 'Daily sync completed',
      users: userResult,
      accounts: accountResult,
      rv_accounts: rvAccountResult,
    });
  } catch (error) {
    if (logEntry) {
      await db
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Daily sync failed' },
      { status: 500 }
    );
  }
}
