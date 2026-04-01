import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

const ALLOWED_ROLES = ['revops_rw', 'revops_ro', 'enterprise_ro', 'cro', 'c_level', 'leader'];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();
    const url = request.nextUrl;

    const eventType = url.searchParams.get('event_type');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // 90-day retention window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    let query = db
      .from('audit_log')
      .select('*', { count: 'exact' })
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType && eventType !== 'all') {
      query = query.like('event_type', `${eventType}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  } catch (error) {
    return handleAuthError(error);
  }
}
