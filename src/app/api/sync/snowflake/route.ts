export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { SYNC_ROLES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { syncSnowflakeActivities } from '@/lib/snowflake/sync-activities';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!SYNC_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'initial' ? 'initial' : 'daily';

    const db = getSupabaseClient();

    // Log sync start
    const { data: logEntry } = await db
      .from('sync_log')
      .insert({
        sync_type: 'snowflake',
        triggered_by: user.user_id !== 'dev-admin' ? user.user_id : null,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select()
      .single();

    try {
      const result = await syncSnowflakeActivities(mode);

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

      logAudit({
        event_type: 'sync.complete',
        actor_id: user.user_id,
        actor_email: user.email,
        target_type: 'sync',
        metadata: {
          sync_type: 'snowflake',
          mode,
          records_synced: result.synced,
          status: hasErrors ? 'partial' : 'success',
          error_count: result.errors.length,
        },
      });

      return NextResponse.json({
        message: `Snowflake activities sync completed (${mode})`,
        activities: result,
      });
    } catch (syncError) {
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

      logAudit({
        event_type: 'sync.failed',
        actor_id: user.user_id,
        actor_email: user.email,
        target_type: 'sync',
        metadata: {
          sync_type: 'snowflake',
          mode,
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
        },
      });

      console.error('Snowflake sync error:', syncError);
      return NextResponse.json(
        {
          error: 'Snowflake activities sync failed',
          detail: syncError instanceof Error ? syncError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
