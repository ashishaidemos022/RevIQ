import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, handleAuthError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const scope = await resolveDataScope(user);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const activityType = url.searchParams.get('activity_type');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const ownerId = url.searchParams.get('owner_user_id');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = db
      .from('activities')
      .select('*, accounts(id, name), opportunities(id, name), users!activities_owner_user_id_fkey(id, full_name)', { count: 'exact' });

    if (!scope.allAccess) {
      query = query.in('owner_user_id', scope.userIds);
    }

    if (ownerId) query = query.eq('owner_user_id', ownerId);
    if (activityType) query = query.eq('activity_type', activityType);
    if (dateFrom) query = query.gte('activity_date', dateFrom);
    if (dateTo) query = query.lte('activity_date', dateTo);

    query = query.order('activity_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  } catch (error) {
    return handleAuthError(error);
  }
}
