import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

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

    // STUB: In Phase 10, this will call Salesforce MCP
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

    return NextResponse.json({ message: 'Salesforce sync completed (stubbed)', records: 0 });
  } catch (error) {
    return handleAuthError(error);
  }
}
