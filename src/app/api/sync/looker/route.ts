import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { SYNC_ROLES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';

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
        sync_type: 'looker',
        triggered_by: user.user_id !== 'dev-admin' ? user.user_id : null,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select()
      .single();

    // STUB: In Phase 10, this will call Looker REST API
    // For now, simulate a successful sync
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (logEntry) {
      await db
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'success',
          records_synced: 0,
        })
        .eq('id', logEntry.id);
    }

    logAudit({
      event_type: 'sync.complete',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'sync',
      metadata: { sync_type: 'looker', records_synced: 0, status: 'success' },
    });

    return NextResponse.json({ message: 'Looker sync completed (stubbed)', records: 0 });
  } catch (error) {
    return handleAuthError(error);
  }
}
