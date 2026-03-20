import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const fiscalYear = url.searchParams.get('fiscal_year');
    const fiscalQuarter = url.searchParams.get('fiscal_quarter');
    const userId = url.searchParams.get('user_id');
    const isFinalized = url.searchParams.get('is_finalized');

    let query = db
      .from('commissions')
      .select('*, opportunities(id, name, acv, stage, account_id, accounts(name)), users!commissions_user_id_fkey(id, full_name, email)');

    if (!scope.allAccess) {
      query = query.in('user_id', scope.userIds);
    }

    if (userId) query = query.eq('user_id', userId);
    if (fiscalYear) query = query.eq('fiscal_year', parseInt(fiscalYear));
    if (fiscalQuarter) query = query.eq('fiscal_quarter', parseInt(fiscalQuarter));
    if (isFinalized === 'true') query = query.eq('is_finalized', true);
    if (isFinalized === 'false') query = query.eq('is_finalized', false);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error);
  }
}
