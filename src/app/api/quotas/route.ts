import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, requireRole, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const fiscalYear = url.searchParams.get('fiscal_year');
    const userId = url.searchParams.get('user_id');
    const quotaType = url.searchParams.get('quota_type');

    let query = db.from('quotas').select('*, users!quotas_user_id_fkey(id, full_name, email)');

    if (!scope.allAccess) {
      query = query.in('user_id', scope.userIds);
    }

    if (userId) {
      // Validate UUID format — skip filter if invalid (e.g., 'dev-admin')
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(userId)) {
        query = query.eq('user_id', userId);
      } else {
        // Non-UUID user_id (like dev-admin) — return empty result
        return NextResponse.json({ data: [] });
      }
    }
    if (fiscalYear) query = query.eq('fiscal_year', parseInt(fiscalYear));
    if (quotaType) query = query.eq('quota_type', quotaType);

    const { data, error } = await query.order('fiscal_year', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    requireRole(user, 'vp', 'cro', 'c_level', 'revops_rw');
    const db = getSupabaseClient();
    const body = await request.json();

    const { data, error } = await db
      .from('quotas')
      .insert({ ...body, entered_by: user.user_id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAudit({
      event_type: 'quota.create',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'quota',
      target_id: data.id,
      target_label: body.user_id,
      after_state: data,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();
    requireRole(user, 'vp', 'cro', 'c_level', 'revops_rw');
    const db = getSupabaseClient();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing quota id' }, { status: 400 });
    }

    const { data, error } = await db
      .from('quotas')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAudit({
      event_type: 'quota.update',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'quota',
      target_id: id,
      after_state: data,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error);
  }
}
