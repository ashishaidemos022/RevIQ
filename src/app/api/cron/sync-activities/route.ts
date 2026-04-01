export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { syncSnowflakeActivities } from '@/lib/snowflake/sync-activities';
import { isDemoMode } from '@/lib/demo';

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

// Daily sync: Snowflake activity summaries
export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ skipped: true, reason: 'demo mode' });
  }

  if (!verifyCronSecret(request)) {
    return new NextResponse(null, { status: 401 });
  }

  const db = getSupabaseClient();

  const { data: logEntry } = await db
    .from('sync_log')
    .insert({
      sync_type: 'snowflake',
      triggered_by: null,
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .select()
    .single();

  try {
    const result = await syncSnowflakeActivities('daily');

    const hasErrors = result.errors.length > 0;

    if (logEntry) {
      await db
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: hasErrors ? 'partial' : 'success',
          records_synced: result.synced,
          error_message: hasErrors ? JSON.stringify({ errors: result.errors }) : null,
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      message: 'Daily activities sync completed',
      activities: result,
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
      { error: error instanceof Error ? error.message : 'Daily activities sync failed' },
      { status: 500 }
    );
  }
}
