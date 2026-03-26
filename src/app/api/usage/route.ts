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

type UsageRow = {
  period_name: string;
  sf_account_id: string;
  sf_account_name: string | null;
  sf_account_owner: string | null;
  taxonomy_name: string | null;
  macro_sku_name_new: string | null;
  wallet_name: string;
  usage_type: string | null;
  total_consumption_amount_usd: unknown;
  total_overage_amount_usd: unknown;
  total_charged_amount_ns_usd: unknown;
};

const USAGE_SELECT = 'period_name, sf_account_id, sf_account_name, sf_account_owner, taxonomy_name, macro_sku_name_new, wallet_name, usage_type, total_consumption_amount_usd, total_overage_amount_usd, total_charged_amount_ns_usd';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const sfAccountId = url.searchParams.get('sf_account_id');
    const period = url.searchParams.get('period'); // single YYYYMM or comma-separated
    const macroSku = url.searchParams.get('macro_sku');
    const taxonomy = url.searchParams.get('taxonomy');

    // ── Account Detail View ──
    if (sfAccountId) {
      const rows = await fetchAll<UsageRow>(() =>
        db
          .from('usage_billing_summary')
          .select(USAGE_SELECT)
          .eq('sf_account_id', sfAccountId)
          .order('period_name', { ascending: false })
      );

      const { data: account } = await db
        .from('accounts')
        .select('id, name, industry, region, salesforce_account_id, owner_user_id, users!accounts_owner_user_id_fkey(id, full_name, email)')
        .eq('salesforce_account_id', sfAccountId)
        .single();

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

      // Aggregate by period + taxonomy
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

      // Aggregate by period for AI vs non-AI
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

    const { data: latestRow } = await db
      .from('usage_billing_summary')
      .select('period_name')
      .order('period_name', { ascending: false })
      .limit(1)
      .single();

    // Support single period or comma-separated periods (for quarter selection)
    const selectedPeriods = period ? period.split(',').map(p => p.trim()) : [];
    const selectedPeriod = selectedPeriods.length > 0 ? selectedPeriods.join(',') : (latestRow?.period_name || '');
    const queryPeriods = selectedPeriods.length > 0 ? selectedPeriods : (latestRow?.period_name ? [latestRow.period_name] : []);

    if (queryPeriods.length === 0) {
      return NextResponse.json({ data: [], periods: [], selected_period: '', totals: null, product_breakdown: [], monthly_trend: [] });
    }

    // Get all distinct periods
    const allPeriodRows = await fetchAll<{ period_name: string }>(() =>
      db.from('usage_billing_summary').select('period_name').order('period_name', { ascending: false })
    );
    const allPeriods = [...new Set(allPeriodRows.map(r => r.period_name))].sort().reverse();

    // Resolve scope
    const scopedAccountIds: string[] = [];
    if (!scope.allAccess) {
      const scopedAccounts = await fetchAll<{ salesforce_account_id: string | null }>(() =>
        db.from('accounts').select('salesforce_account_id').in('owner_user_id', scope.userIds)
      );
      for (const a of scopedAccounts) {
        if (a.salesforce_account_id) scopedAccountIds.push(a.salesforce_account_id);
      }
      if (scopedAccountIds.length === 0) {
        return NextResponse.json({ data: [], periods: allPeriods, selected_period: selectedPeriod, totals: null, product_breakdown: [], monthly_trend: [] });
      }
    }

    // ── Fetch usage data for selected period(s) ──
    const periodRows = await fetchAll<UsageRow>(() => {
      let q = db
        .from('usage_billing_summary')
        .select(USAGE_SELECT)
        .in('period_name', queryPeriods);
      if (!scope.allAccess) q = q.in('sf_account_id', scopedAccountIds);
      return q;
    });

    // Apply product filters
    const filteredPeriodRows = periodRows.filter(r => {
      if (macroSku && r.macro_sku_name_new !== macroSku) return false;
      if (taxonomy && r.taxonomy_name !== taxonomy) return false;
      return true;
    });

    // ── Aggregate by account ──
    interface AccountAgg {
      sf_account_id: string;
      sf_account_name: string;
      sf_account_owner: string;
      consumption: number;
      overage: number;
      charged: number;
      ai_charged: number;
      product_charged: number;
    }

    const accountMap = new Map<string, AccountAgg>();
    for (const r of filteredPeriodRows) {
      const id = r.sf_account_id;
      if (!accountMap.has(id)) {
        accountMap.set(id, {
          sf_account_id: id,
          sf_account_name: r.sf_account_name || id,
          sf_account_owner: r.sf_account_owner || '—',
          consumption: 0, overage: 0, charged: 0,
          ai_charged: 0, product_charged: 0,
        });
      }
      const acc = accountMap.get(id)!;
      acc.consumption += num(r.total_consumption_amount_usd);
      acc.overage += num(r.total_overage_amount_usd);
      acc.charged += num(r.total_charged_amount_ns_usd);
      const charged = num(r.total_charged_amount_ns_usd);
      if (r.usage_type === 'AI Product') {
        acc.ai_charged += charged;
      } else {
        acc.product_charged += charged;
      }
    }

    const accounts = [...accountMap.values()].sort((a, b) => Math.abs(b.charged) - Math.abs(a.charged));

    // ── Totals ──
    const totals = {
      consumption: accounts.reduce((s, a) => s + a.consumption, 0),
      overage: accounts.reduce((s, a) => s + a.overage, 0),
      charged: accounts.reduce((s, a) => s + a.charged, 0),
      ai_charged: accounts.reduce((s, a) => s + a.ai_charged, 0),
      product_charged: accounts.reduce((s, a) => s + a.product_charged, 0),
      accounts_with_overage: accounts.filter(a => a.overage !== 0).length,
      total_accounts: accounts.length,
    };

    // ── Product breakdown (for the selected period, using unfiltered period data) ──
    interface ProductAgg { name: string; consumption: number; overage: number; charged: number }
    const buildProductBreakdown = (rows: UsageRow[], keyFn: (r: UsageRow) => string): ProductAgg[] => {
      const map = new Map<string, ProductAgg>();
      for (const r of rows) {
        const key = keyFn(r) || 'Other';
        if (!map.has(key)) map.set(key, { name: key, consumption: 0, overage: 0, charged: 0 });
        const p = map.get(key)!;
        p.consumption += num(r.total_consumption_amount_usd);
        p.overage += num(r.total_overage_amount_usd);
        p.charged += num(r.total_charged_amount_ns_usd);
      }
      return [...map.values()].sort((a, b) => Math.abs(b.charged) - Math.abs(a.charged));
    };

    const productBreakdown = {
      by_macro_sku: buildProductBreakdown(periodRows, r => r.macro_sku_name_new || 'Other'),
      by_wallet: buildProductBreakdown(periodRows, r => r.wallet_name || 'Other'),
      by_taxonomy: buildProductBreakdown(periodRows, r => r.taxonomy_name || 'Other'),
    };

    // ── Monthly trend (all periods, scoped, filtered by product) ──
    const allRows = await fetchAll<UsageRow>(() => {
      let q = db
        .from('usage_billing_summary')
        .select(USAGE_SELECT)
        .order('period_name', { ascending: true });
      if (!scope.allAccess) q = q.in('sf_account_id', scopedAccountIds);
      return q;
    });

    const filteredAllRows = allRows.filter(r => {
      if (macroSku && r.macro_sku_name_new !== macroSku) return false;
      if (taxonomy && r.taxonomy_name !== taxonomy) return false;
      return true;
    });

    const trendMap = new Map<string, { period: string; consumption: number; overage: number; charged: number }>();
    for (const r of filteredAllRows) {
      const p = r.period_name;
      if (!trendMap.has(p)) trendMap.set(p, { period: p, consumption: 0, overage: 0, charged: 0 });
      const t = trendMap.get(p)!;
      t.consumption += num(r.total_consumption_amount_usd);
      t.overage += num(r.total_overage_amount_usd);
      t.charged += num(r.total_charged_amount_ns_usd);
    }
    const monthlyTrend = [...trendMap.values()].sort((a, b) => a.period.localeCompare(b.period));

    // ── Collect filter options ──
    const macroSkuOptions = [...new Set(periodRows.map(r => r.macro_sku_name_new).filter(Boolean))].sort() as string[];
    const walletOptions = [...new Set(periodRows.map(r => r.wallet_name).filter(Boolean))].sort() as string[];
    const taxonomyOptions = [...new Set(periodRows.map(r => r.taxonomy_name).filter(Boolean))].sort() as string[];

    return NextResponse.json({
      data: accounts,
      periods: allPeriods,
      selected_period: selectedPeriod,
      totals,
      product_breakdown: productBreakdown,
      monthly_trend: monthlyTrend,
      filter_options: {
        macro_sku: macroSkuOptions,
        wallet: walletOptions,
        taxonomy: taxonomyOptions,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
