import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { VIEW_AS_ROLES } from '@/lib/constants';
import { UserRole } from '@/types';
import { logAudit } from '@/lib/audit';
import { getSupabaseClient } from '@/lib/supabase/client';

// POST — log a view-as start or end event via audit_log
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!VIEW_AS_ROLES.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action, viewed_as_id, viewed_as_role, log_id } = body;
    const db = getSupabaseClient();

    if (action === 'start') {
      if (!viewed_as_id || !viewed_as_role) {
        return NextResponse.json({ error: 'Missing viewed_as_id or viewed_as_role' }, { status: 400 });
      }

      // Look up the target user's name for the audit label
      let targetLabel: string | undefined;
      const { data: targetUser } = await db
        .from('users')
        .select('full_name')
        .eq('id', viewed_as_id)
        .single();
      if (targetUser) targetLabel = targetUser.full_name;

      // Write to audit_log and return the log ID
      const { data, error } = await db
        .from('audit_log')
        .insert({
          event_type: 'view_as.start',
          actor_id: user.user_id !== 'dev-admin' ? user.user_id : null,
          actor_email: user.email,
          target_type: 'user',
          target_id: viewed_as_id,
          target_label: targetLabel || null,
          metadata: { viewed_as_role, initiated_by_role: user.role },
        })
        .select('id')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ log_id: data.id });
    }

    if (action === 'end') {
      if (!log_id) {
        return NextResponse.json({ error: 'Missing log_id' }, { status: 400 });
      }

      logAudit({
        event_type: 'view_as.end',
        actor_id: user.user_id,
        actor_email: user.email,
        metadata: { start_log_id: log_id },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
