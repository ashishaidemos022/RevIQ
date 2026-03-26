import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const sfAccountId = url.searchParams.get('sf_account_id');
    const period = url.searchParams.get('period'); // YYYYMM or null for latest

    // ── Account Detail View ──
    if (sfAccountId) {
      // Get all usage rows for this account
      const rows = await fetchAll<{
        period_name: string;
        sf_account_name: string | null;
        sf_account_owner: string | null;
        taxonomy_name: string | null;
        wallet_name: string;
        usage_type: string | null;
        total_consumption_amount_usd: number | null;
        total_overage_amount_usd: number | null;
        total_charged_amount_ns_usd: number | null;
      }>(() =>
        db
          .from('usage_billing_summary')
          .select('period_name, sf_account_name, sf_account_owner, taxonomy_name, wallet_name, usage_type, total_consumption_amount_usd, total_overage_amount_usd, total_charged_amount_ns_usd')
          .eq('sf_account_id', sfAccountId)
          .order('period_name', { ascending: false })
      );

      // Get account from our accounts table
      const { data: account } = await db
        .from('accounts')
        .select('id, name, industry, region, salesforce_account_id, owner_user_id, users!accounts_owner_user_id_fkey(id, full_name, email)')
        .eq('salesforce_account_id', sfAccountId)
        .single();

      // Get linked open opportunities
      let oppsQuery = db
        .from('opportunities')
        .select('id, name, stage, acv, close_date, is_closed_won, is_closed_lost')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false);

      if (account?.id) {
        oppsQuery = oppsQuery.eq('account_id', account.id);
      }

      const { data: opps } = await oppsQuery.order('close_date', { ascending: false });

      // Aggregate by period + taxonomy for monthly trend
      const monthlyByTaxonomy: Record<string, Record<string, { consumption: number; overage: number; charged: number }>> = {};
      for (const r of rows) {
        const p = r.period_name;
        const tax = r.taxonomy_name || 'Other';
        if (!monthlyByTaxonomy[p]) monthlyByTaxonomy[p] = {};
        if (!monthlyByTaxonomy[p][tax]) monthlyByTaxonomy[p][tax] = { consumption: 0, overage: 0, charged: 0 };
        monthlyByTaxonomy[p][tax].consumption += r.total_consumption_amount_usd || 0;
        monthlyByTaxonomy[p][tax].overage += r.total_overage_amount_usd || 0;
        monthlyByTaxonomy[p][tax].charged += r.total_charged_amount_ns_usd || 0;
      }

      // Aggregate by period for AI vs non-AI split
      const monthlyByType: Record<string, { ai: number; product: number; total: number }> = {};
      for (const r of rows) {
        const p = r.period_name;
        if (!monthlyByType[p]) monthlyByType[p] = { ai: 0, product: 0, total: 0 };
        const charged = r.total_charged_amount_ns_usd || 0;
        if (r.usage_type === 'AI Product') {
          monthlyByType[p].ai += charged;
        } else {
          monthlyByType[p].product += charged;
        }
        monthlyByType[p].total += charged;
      }

      return NextResponse.json({
        data: {
          account: account || { name: rows[0]?.sf_account_name || sfAccountId },
          monthly_by_taxonomy: monthlyByTaxonomy,
          monthly_by_type: monthlyByType,
          opportunities: opps || [],
        },
      });
    }

    // ── Account List View ──

    // Find the latest period available
    const { data: latestRow } = await db
      .from('usage_billing_summary')
      .select('period_name')
      .order('period_name', { ascending: false })
      .limit(1)
      .single();

    const selectedPeriod = period || latestRow?.period_name || '';
    if (!selectedPeriod) {
      return NextResponse.json({ data: [], periods: [], selected_period: '', totals: null });
    }

    // Get all available periods
    const periodsResult = await db
      .from('usage_billing_summary')
      .select('period_name')
      .order('period_name', { ascending: false });
    const allPeriods = [...new Set((periodsResult.data || []).map((r: { period_name: string }) => r.period_name))];

    // Get accounts in scope
    const scopedAccountIds: string[] = [];
    if (!scope.allAccess) {
      const { data: scopedAccounts } = await db
        .from('accounts')
        .select('salesforce_account_id')
        .in('owner_user_id', scope.userIds);
      for (const a of (scopedAccounts || [])) {
        if (a.salesforce_account_id) scopedAccountIds.push(a.salesforce_account_id);
      }
      if (scopedAccountIds.length === 0) {
        return NextResponse.json({ data: [], periods: allPeriods, selected_period: selectedPeriod, totals: null });
      }
    }

    // Fetch usage data for selected period
    let usageQuery = db
      .from('usage_billing_summary')
      .select('sf_account_id, sf_account_name, sf_account_owner, taxonomy_name, usage_type, total_consumption_amount_usd, total_overage_amount_usd, total_charged_amount_ns_usd')
      .eq('period_name', selectedPeriod);

    if (!scope.allAccess) {
      usageQuery = usageQuery.in('sf_account_id', scopedAccountIds);
    }

    const { data: usageRows, error: usageError } = await usageQuery;
    if (usageError) {
      return NextResponse.json({ error: usageError.message }, { status: 500 });
    }

    // Aggregate by account
    interface AccountAgg {
      sf_account_id: string;
      sf_account_name: string;
      sf_account_owner: string;
      consumption: number;
      overage: number;
      charged: number;
      ai_charged: number;
      product_charged: number;
      taxonomies: Record<string, number>;
    }

    const accountMap = new Map<string, AccountAgg>();
    for (const r of (usageRows || [])) {
      const id = r.sf_account_id;
      if (!accountMap.has(id)) {
        accountMap.set(id, {
          sf_account_id: id,
          sf_account_name: r.sf_account_name || id,
          sf_account_owner: r.sf_account_owner || '—',
          consumption: 0,
          overage: 0,
          charged: 0,
          ai_charged: 0,
          product_charged: 0,
          taxonomies: {},
        });
      }
      const acc = accountMap.get(id)!;
      const consumption = r.total_consumption_amount_usd || 0;
      const overage = r.total_overage_amount_usd || 0;
      const charged = r.total_charged_amount_ns_usd || 0;
      acc.consumption += consumption;
      acc.overage += overage;
      acc.charged += charged;

      if (r.usage_type === 'AI Product') {
        acc.ai_charged += charged;
      } else {
        acc.product_charged += charged;
      }

      const tax = r.taxonomy_name || 'Other';
      acc.taxonomies[tax] = (acc.taxonomies[tax] || 0) + charged;
    }

    const accounts = [...accountMap.values()].sort((a, b) => b.charged - a.charged);

    // Compute totals
    const totals = {
      consumption: accounts.reduce((s, a) => s + a.consumption, 0),
      overage: accounts.reduce((s, a) => s + a.overage, 0),
      charged: accounts.reduce((s, a) => s + a.charged, 0),
      ai_charged: accounts.reduce((s, a) => s + a.ai_charged, 0),
      product_charged: accounts.reduce((s, a) => s + a.product_charged, 0),
      accounts_with_overage: accounts.filter(a => a.overage > 0).length,
      total_accounts: accounts.length,
    };

    return NextResponse.json({
      data: accounts,
      periods: allPeriods,
      selected_period: selectedPeriod,
      totals,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
