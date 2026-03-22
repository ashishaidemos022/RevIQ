import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { logAudit } from '@/lib/audit';

const OVERRIDE_ROLES = ['cro', 'c_level', 'revops_rw'];

export async function GET() {
  try {
    const user = await requireAuth();

    if (!OVERRIDE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();

    const { data, error } = await db
      .from('permission_overrides')
      .select('*, users!permission_overrides_user_id_fkey(full_name, role), granted:users!permission_overrides_granted_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = (data || []).map((o: Record<string, unknown>) => ({
      ...o,
      user_name: (o.users as { full_name: string } | null)?.full_name || 'Unknown',
      user_role: (o.users as { role: string } | null)?.role || '',
      granted_by_name: (o.granted as { full_name: string } | null)?.full_name || 'System',
    }));

    // Filter to last 90 days for revoked overrides
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const filtered = enriched.filter((o) => {
      if ((o as Record<string, unknown>).is_active) return true;
      const revokedAt = (o as Record<string, unknown>).revoked_at as string | null;
      if (!revokedAt) return true;
      return new Date(revokedAt) >= ninetyDaysAgo;
    });

    return NextResponse.json({ data: filtered });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!OVERRIDE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();
    const body = await request.json();
    const { user_id, effective_role, allow_writes, notes } = body;

    if (!user_id || !effective_role || !notes) {
      return NextResponse.json({ error: 'user_id, effective_role, and notes are required' }, { status: 400 });
    }

    // Check for existing active override
    const { data: existing } = await db
      .from('permission_overrides')
      .select('id')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'User already has an active override. Revoke it first.' },
        { status: 409 }
      );
    }

    const { data, error } = await db
      .from('permission_overrides')
      .insert({
        user_id,
        granted_by: user.user_id !== 'dev-admin' ? user.user_id : null,
        effective_role,
        allow_writes: allow_writes || false,
        notes,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAudit({
      event_type: 'override.grant',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'user',
      target_id: user_id,
      after_state: { effective_role, allow_writes: allow_writes || false, notes },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error);
  }
}
