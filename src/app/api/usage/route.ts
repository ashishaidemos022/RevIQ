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

    const accountId = url.searchParams.get('account_id');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (accountId) {
      // Get detailed usage for a specific account
      const { data: metrics, error } = await db
        .from('usage_metrics')
        .select('*')
        .eq('account_id', accountId)
        .order('metric_date', { ascending: false })
        .limit(200);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Get account details
      const { data: account } = await db
        .from('accounts')
        .select('*, users!accounts_owner_user_id_fkey(id, full_name, email)')
        .eq('id', accountId)
        .single();

      // Get linked opportunities
      const { data: opps } = await db
        .from('opportunities')
        .select('id, name, stage, acv, close_date, is_closed_won, is_closed_lost')
        .eq('account_id', accountId)
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .order('close_date', { ascending: false });

      return NextResponse.json({ data: { metrics, account, opportunities: opps } });
    }

    // List accounts with aggregated latest usage
    // First get accounts within scope
    let accountsQuery = db
      .from('accounts')
      .select('id, name, industry, region, owner_user_id, users!accounts_owner_user_id_fkey(id, full_name)', { count: 'exact' });

    accountsQuery = scopedQuery(accountsQuery, 'owner_user_id', scope);

    accountsQuery = accountsQuery
      .order('name')
      .range(offset, offset + limit - 1);

    const { data: accounts, error: accError, count } = await accountsQuery;

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    // Get latest usage for each account
    const accountIds = (accounts || []).map((a: { id: string }) => a.id);
    let usageData: Record<string, unknown>[] = [];

    if (accountIds.length > 0) {
      const { data: metrics } = await db
        .from('usage_metrics')
        .select('account_id, product_type, interaction_count, metric_date')
        .in('account_id', accountIds)
        .order('metric_date', { ascending: false });

      usageData = metrics || [];
    }

    // Get linked ACV per account
    let acvQuery = db
      .from('opportunities')
      .select('account_id, acv')
      .eq('is_closed_won', true)
      .in('account_id', accountIds);
    const { data: acvData } = await acvQuery;

    // Aggregate
    const acvMap: Record<string, number> = {};
    (acvData || []).forEach((o: { account_id: string | null; acv: number | null }) => {
      if (o.account_id) {
        acvMap[o.account_id] = (acvMap[o.account_id] || 0) + (o.acv || 0);
      }
    });

    // Group usage by account, get latest per product type
    const usageMap: Record<string, Record<string, { count: number; date: string }>> = {};
    (usageData as Array<{ account_id: string; product_type: string; interaction_count: number; metric_date: string }>).forEach((m) => {
      if (!usageMap[m.account_id]) usageMap[m.account_id] = {};
      if (!usageMap[m.account_id][m.product_type] || m.metric_date > usageMap[m.account_id][m.product_type].date) {
        usageMap[m.account_id][m.product_type] = { count: m.interaction_count, date: m.metric_date };
      }
    });

    // Get all product types
    const productTypes = new Set<string>();
    Object.values(usageMap).forEach((products) => {
      Object.keys(products).forEach((pt) => productTypes.add(pt));
    });

    const enrichedAccounts = (accounts || []).map((a) => ({
      ...a,
      linked_acv: acvMap[a.id] || 0,
      usage: usageMap[a.id] || {},
      last_updated: Object.values(usageMap[a.id] || {}).reduce(
        (latest: string, u: { date: string }) => (u.date > latest ? u.date : latest),
        ''
      ),
    }));

    return NextResponse.json({
      data: enrichedAccounts,
      product_types: Array.from(productTypes).sort(),
      total: count,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
