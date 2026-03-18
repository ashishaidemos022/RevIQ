export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { syncSalesforceOpportunities } from '@/lib/salesforce/sync-opportunities';
import { syncOpportunitySplits } from '@/lib/salesforce/sync-opportunity-splits';

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

// Hourly sync: Opportunities
export async function GET(request: NextRequest) {
  console.log('[cron/sync-opportunities] Starting...');

  if (!verifyCronSecret(request)) {
    return new NextResponse(null, { status: 401 });
  }

  const sfUrl = process.env.SALESFORCE_LOGIN_URL || '';
  const sfUser = process.env.SALESFORCE_USERNAME || '';
  const sfPass = process.env.SALESFORCE_PASSWORD || '';
  console.log('[cron/sync-opportunities] Auth OK, checking SF env vars...');
  console.log('[cron/sync-opportunities] SALESFORCE_LOGIN_URL:', sfUrl);
  console.log('[cron/sync-opportunities] SALESFORCE_USERNAME:', sfUser);
  console.log('[cron/sync-opportunities] SALESFORCE_PASSWORD: length=' + sfPass.length, 'first3=' + sfPass.substring(0, 3), 'last3=' + sfPass.substring(sfPass.length - 3));

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
    console.log('[cron/sync-opportunities] Starting opportunity sync...');
    const oppResult = await syncSalesforceOpportunities();
    console.log('[cron/sync-opportunities] Opportunities done:', oppResult.synced, 'synced,', oppResult.errors.length, 'errors');

    console.log('[cron/sync-opportunities] Starting splits sync...');
    const splitResult = await syncOpportunitySplits();
    console.log('[cron/sync-opportunities] Splits done:', splitResult.synced, 'synced,', splitResult.errors.length, 'errors');

    const totalRecords = oppResult.synced + splitResult.synced;
    const allErrors = [...oppResult.errors, ...splitResult.errors];
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
      message: 'Hourly opportunity sync completed',
      opportunities: oppResult,
      opportunity_splits: splitResult,
    });
  } catch (error) {
    console.error('[cron/sync-opportunities] FATAL ERROR:', error instanceof Error ? error.stack || error.message : error);

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
      { error: error instanceof Error ? error.message : 'Opportunity sync failed' },
      { status: 500 }
    );
  }
}
