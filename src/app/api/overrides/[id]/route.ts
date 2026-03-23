import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { logAudit } from '@/lib/audit';

const OVERRIDE_ROLES = ['cro', 'revops_rw'];

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    if (!OVERRIDE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const db = getSupabaseClient();

    const { data: existing } = await db
      .from('permission_overrides')
      .select('id, user_id, is_active')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    if (!existing.is_active) {
      return NextResponse.json({ error: 'Override is already revoked' }, { status: 400 });
    }

    const { error } = await db
      .from('permission_overrides')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: user.user_id !== 'dev-admin' ? user.user_id : null,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAudit({
      event_type: 'override.revoke',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'user',
      target_id: existing.user_id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
