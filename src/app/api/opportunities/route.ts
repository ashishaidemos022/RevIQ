import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    // Query params
    const status = url.searchParams.get('status'); // open | closed_won | closed_lost | all
    const isPaidPilot = url.searchParams.get('is_paid_pilot');
    const fiscalYear = url.searchParams.get('fiscal_year');
    const fiscalQuarter = url.searchParams.get('fiscal_quarter');
    const stage = url.searchParams.get('stage');
    const type = url.searchParams.get('type');
    const ownerId = url.searchParams.get('owner_user_id');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = db
      .from('opportunities')
      .select('*, accounts(id, name, industry, region), users!opportunities_owner_user_id_fkey(id, full_name, email)', { count: 'exact' });

    // Scope filter
    query = scopedQuery(query, 'owner_user_id', scope);

    // If specific owner requested (for managers viewing an AE)
    if (ownerId) {
      query = query.eq('owner_user_id', ownerId);
    }

    // Status filter
    if (status === 'open') {
      query = query.eq('is_closed_won', false).eq('is_closed_lost', false);
    } else if (status === 'closed_won') {
      query = query.eq('is_closed_won', true);
    } else if (status === 'closed_lost') {
      query = query.eq('is_closed_lost', true);
    }

    // Paid pilot filter
    if (isPaidPilot === 'true') {
      query = query.eq('is_paid_pilot', true);
    } else if (isPaidPilot === 'false') {
      query = query.eq('is_paid_pilot', false);
    }

    // Stage filter
    if (stage) {
      const stages = stage.split(',');
      query = query.in('stage', stages);
    }

    // Type filter
    if (type) {
      query = query.eq('type', type);
    }

    // Date filters for fiscal year/quarter
    if (fiscalYear && fiscalQuarter) {
      const { getQuarterStartDate, getQuarterEndDate } = await import('@/lib/fiscal');
      const start = getQuarterStartDate(parseInt(fiscalYear), parseInt(fiscalQuarter));
      const end = getQuarterEndDate(parseInt(fiscalYear), parseInt(fiscalQuarter));
      query = query
        .gte('close_date', start.toISOString().split('T')[0])
        .lte('close_date', end.toISOString().split('T')[0]);
    } else if (fiscalYear) {
      const { getFiscalYearRange } = await import('@/lib/fiscal');
      const { start, end } = getFiscalYearRange(parseInt(fiscalYear));
      query = query
        .gte('close_date', start.toISOString().split('T')[0])
        .lte('close_date', end.toISOString().split('T')[0]);
    }

    query = query.order('close_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Opportunities query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  } catch (error) {
    return handleAuthError(error);
  }
}
