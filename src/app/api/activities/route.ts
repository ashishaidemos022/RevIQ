import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, batchedIn } from '@/lib/auth/middleware';
import { resolveAeSfIds } from '@/lib/snowflake/resolve-ae-sf-ids';
import { fetchAll } from '@/lib/supabase/fetch-all';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    // Resolve AE SF IDs within scope
    const aeMap = await resolveAeSfIds(scope);
    const sfIds = [...aeMap.keys()];

    if (sfIds.length === 0) {
      return NextResponse.json({
        data: [],
        totals: { activity_count: 0, call_count: 0, email_count: 0, linkedin_count: 0, meeting_count: 0 },
      });
    }

    // Query all activity_daily_summary rows for AEs in scope (paginated to avoid 1000-row limit)
    const allRows = await fetchAll<{
      id: string;
      owner_sf_id: string;
      ae_name: string;
      activity_date: string;
      activity_count: number;
      call_count: number;
      email_count: number;
      linkedin_count: number;
      meeting_count: number;
      synced_at: string;
    }>(() => {
      let q = db
        .from('activity_daily_summary')
        .select('*');
      q = batchedIn(q, 'owner_sf_id', sfIds);
      if (dateFrom) q = q.gte('activity_date', dateFrom);
      if (dateTo) q = q.lte('activity_date', dateTo);
      return q;
    });

    // Enrich rows with user info from aeMap
    const enrichedData = allRows.map((row) => {
      const aeInfo = aeMap.get(row.owner_sf_id);
      return {
        ...row,
        user_id: aeInfo?.user_id || null,
        full_name: aeInfo?.full_name || row.ae_name,
        region: aeInfo?.region || null,
      };
    });

    // Compute totals from all rows
    const totals = {
      activity_count: 0,
      call_count: 0,
      email_count: 0,
      linkedin_count: 0,
      meeting_count: 0,
    };

    for (const row of allRows) {
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
