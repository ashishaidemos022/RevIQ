import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const fiscalYear = url.searchParams.get('fiscal_year');

    let query = db
      .from('commission_rates')
      .select('*, users!commission_rates_user_id_fkey(id, full_name)')
      .order('created_at', { ascending: false });

    if (fiscalYear) {
      query = query.eq('fiscal_year', parseInt(fiscalYear));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with user name
    const enriched = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      user_name: (r.users as { full_name: string } | null)?.full_name || 'All AEs',
    }));

    return NextResponse.json({ data: enriched });
  } catch (error) {
    return handleAuthError(error);
  }
}
