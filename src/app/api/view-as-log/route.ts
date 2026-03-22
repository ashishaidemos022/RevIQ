import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { VIEW_AS_ROLES } from '@/lib/constants';
import { UserRole } from '@/types';
import { logAudit } from '@/lib/audit';

// POST — log a view-as start or end event
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

      const { data, error } = await db
        .from('view_as_log')
        .insert({
          initiated_by: user.user_id,
          initiated_by_role: user.role,
          viewed_as: viewed_as_id,
          viewed_as_role,
        })
        .select('id')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logAudit({
        event_type: 'view_as.start',
        actor_id: user.user_id,
        actor_email: user.email,
        target_type: 'user',
        target_id: viewed_as_id,
        metadata: { viewed_as_role },
      });

      return NextResponse.json({ log_id: data.id });
    }

    if (action === 'end') {
      if (!log_id) {
        return NextResponse.json({ error: 'Missing log_id' }, { status: 400 });
      }

      const { error } = await db
        .from('view_as_log')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', log_id)
        .eq('initiated_by', user.user_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logAudit({
        event_type: 'view_as.end',
        actor_id: user.user_id,
        actor_email: user.email,
        metadata: { log_id },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}

// GET — fetch recent view-as logs (for Settings UI)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!VIEW_AS_ROLES.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getSupabaseClient();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    const { data, error } = await db
      .from('view_as_log')
      .select(`
        id,
        initiated_by_role,
        viewed_as_role,
        started_at,
        ended_at,
        initiator:users!view_as_log_initiated_by_fkey(id, full_name, email),
        target:users!view_as_log_viewed_as_fkey(id, full_name, email)
      `)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    return handleAuthError(error);
  }
}
