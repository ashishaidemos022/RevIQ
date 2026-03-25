import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, batchedIn } from '@/lib/auth/middleware';
import { resolveAeSfIds } from '@/lib/snowflake/resolve-ae-sf-ids';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const limit = parseInt(url.searchParams.get('limit') || '500');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Resolve AE SF IDs within scope
    const aeMap = await resolveAeSfIds(scope);
    const sfIds = [...aeMap.keys()];

    if (sfIds.length === 0) {
      return NextResponse.json({
        data: [],
        totals: { activity_count: 0, call_count: 0, email_count: 0, linkedin_count: 0, meeting_count: 0 },
      });
    }

    // Query activity_daily_summary for AEs in scope
    let query = db
      .from('activity_daily_summary')
      .select('*');

    query = batchedIn(query, 'owner_sf_id', sfIds);

    if (dateFrom) query = query.gte('activity_date', dateFrom);
    if (dateTo) query = query.lte('activity_date', dateTo);

    query = query.order('activity_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich rows with user info from aeMap
    const enrichedData = (data || []).map((row) => {
      const aeInfo = aeMap.get(row.owner_sf_id);
      return {
        ...row,
        user_id: aeInfo?.user_id || null,
        full_name: aeInfo?.full_name || row.ae_name,
        region: aeInfo?.region || null,
      };
    });

    // Compute totals from a separate aggregation query (no limit/offset)
    let totalsQuery = db
      .from('activity_daily_summary')
      .select('activity_count, call_count, email_count, linkedin_count, meeting_count');

    totalsQuery = batchedIn(totalsQuery, 'owner_sf_id', sfIds);

    if (dateFrom) totalsQuery = totalsQuery.gte('activity_date', dateFrom);
    if (dateTo) totalsQuery = totalsQuery.lte('activity_date', dateTo);

    const { data: totalsData } = await totalsQuery;

    const totals = {
      activity_count: 0,
      call_count: 0,
      email_count: 0,
      linkedin_count: 0,
      meeting_count: 0,
    };

    for (const row of totalsData || []) {
      totals.activity_count += row.activity_count || 0;
      totals.call_count += row.call_count || 0;
      totals.email_count += row.email_count || 0;
      totals.linkedin_count += row.linkedin_count || 0;
      totals.meeting_count += row.meeting_count || 0;
    }

    return NextResponse.json({ data: enrichedData, totals });
  } catch (error) {
    return handleAuthError(error);
  }
}
