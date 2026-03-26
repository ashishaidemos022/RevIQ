import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';

// Supabase returns numeric columns as strings — always parse
function num(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

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
      const rows = await fetchAll<{
        period_name: string;
        sf_account_name: string | null;
        sf_account_owner: string | null;
        taxonomy_name: string | null;
        wallet_name: string;
        usage_type: string | null;
        total_consumption_amount_usd: unknown;
        total_overage_amount_usd: unknown;
        total_charged_amount_ns_usd: unknown;
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
      let oppsData: { id: string; name: string; stage: string; acv: number | null; close_date: string | null }[] = [];
      if (account?.id) {
        const { data: opps } = await db
          .from('opportunities')
          .select('id, name, stage, acv, close_date, is_closed_won, is_closed_lost')
          .eq('account_id', account.id)
          .eq('is_closed_won', false)
          .eq('is_closed_lost', false)
          .order('close_date', { ascending: false });
        oppsData = opps || [];
      }

      // Aggregate by period + taxonomy for monthly trend
      const monthlyByTaxonomy: Record<string, Record<string, { consumption: number; overage: number; charged: number }>> = {};
      for (const r of rows) {
        const p = r.period_name;
        const tax = r.taxonomy_name || 'Other';
        if (!monthlyByTaxonomy[p]) monthlyByTaxonomy[p] = {};
        if (!monthlyByTaxonomy[p][tax]) monthlyByTaxonomy[p][tax] = { consumption: 0, overage: 0, charged: 0 };
        monthlyByTaxonomy[p][tax].consumption += num(r.total_consumption_amount_usd);
        monthlyByTaxonomy[p][tax].overage += num(r.total_overage_amount_usd);
        monthlyByTaxonomy[p][tax].charged += num(r.total_charged_amount_ns_usd);
      }

      // Aggregate by period for AI vs non-AI split
      const monthlyByType: Record<string, { ai: number; product: number; total: number }> = {};
      for (const r of rows) {
        const p = r.period_name;
        if (!monthlyByType[p]) monthlyByType[p] = { ai: 0, product: 0, total: 0 };
        const charged = num(r.total_charged_amount_ns_usd);
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
          opportunities: oppsData,
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
      const scopedAccounts = await fetchAll<{ salesforce_account_id: string | null }>(() =>
        db.from('accounts').select('salesforce_account_id').in('owner_user_id', scope.userIds)
      );
      for (const a of scopedAccounts) {
        if (a.salesforce_account_id) scopedAccountIds.push(a.salesforce_account_id);
      }
      if (scopedAccountIds.length === 0) {
        return NextResponse.json({ data: [], periods: allPeriods, selected_period: selectedPeriod, totals: null });
      }
    }

    // Fetch ALL usage data for selected period (may exceed 1000 rows)
    const usageRows = await fetchAll<{
      sf_account_id: string;
      sf_account_name: string | null;
      sf_account_owner: string | null;
      taxonomy_name: string | null;
      usage_type: string | null;
      total_consumption_amount_usd: unknown;
      total_overage_amount_usd: unknown;
      total_charged_amount_ns_usd: unknown;
    }>(() => {
      let q = db
        .from('usage_billing_summary')
        .select('sf_account_id, sf_account_name, sf_account_owner, taxonomy_name, usage_type, total_consumption_amount_usd, total_overage_amount_usd, total_charged_amount_ns_usd')
        .eq('period_name', selectedPeriod);

      if (!scope.allAccess) {
        q = q.in('sf_account_id', scopedAccountIds);
      }
      return q;
    });

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
    for (const r of usageRows) {
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
      const consumption = num(r.total_consumption_amount_usd);
      const overage = num(r.total_overage_amount_usd);
      const charged = num(r.total_charged_amount_ns_usd);
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
      accounts_with_overage: accounts.filter(a => a.overage !== 0).length,
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
