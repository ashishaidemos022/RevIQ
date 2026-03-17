import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { syncSalesforceOpportunities } from '@/lib/salesforce/sync-opportunities';

function verifyCronSecret(request: NextRequest): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  return secret === process.env.CRON_SECRET;
}

// Hourly sync: Opportunities
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
    const oppResult = await syncSalesforceOpportunities();

    if (logEntry) {
      await db
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: oppResult.errors.length > 0 ? 'partial' : 'success',
          records_synced: oppResult.synced,
          error_message: oppResult.errors.length > 0 ? JSON.stringify({ errors: oppResult.errors }) : null,
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      message: 'Hourly opportunity sync completed',
      opportunities: oppResult,
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
      { error: error instanceof Error ? error.message : 'Opportunity sync failed' },
      { status: 500 }
    );
  }
}
