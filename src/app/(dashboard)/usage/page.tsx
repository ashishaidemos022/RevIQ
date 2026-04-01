"use client";

import { useMemo, useState } from "react";
import { useFilterParam, useFilterParamNumber } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Radio, RotateCcw } from "lucide-react";
import { ExpansionSignals } from "@/components/dashboard/expansion-signals";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,

} from "recharts";

// ── Types ──

interface AccountRow {
  sf_account_id: string;
  sf_account_name: string;
  sf_account_owner: string;
  consumption: number;
  overage: number;
  charged: number;
  ai_charged: number;
  product_charged: number;
}

interface Totals {
  consumption: number;
  overage: number;
  charged: number;
  ai_charged: number;
  product_charged: number;
  accounts_with_overage: number;
  total_accounts: number;
}

interface ProductAgg {
  name: string;
  consumption: number;
  overage: number;
  charged: number;
}

interface TrendPoint {
  period: string;
  consumption: number;
  overage: number;
  charged: number;
}

interface FilterOptions {
  macro_sku: string[];
  wallet: string[];
  taxonomy: string[];
}

interface AccountListResponse {
  data: AccountRow[];
  periods: string[];
  selected_period: string;
  totals: Totals | null;
  product_breakdown: {
    by_macro_sku: ProductAgg[];
    by_wallet: ProductAgg[];
    by_taxonomy: ProductAgg[];
  };
  monthly_trend: TrendPoint[];
  filter_options: FilterOptions;
}

interface AccountDetailResponse {
  data: {
    account: {
      name: string;
      industry?: string | null;
      region?: string | null;
      users?: { full_name: string; email: string };
    };
    monthly_by_taxonomy: Record<string, Record<string, { consumption: number; overage: number; charged: number }>>;
    monthly_by_type: Record<string, { ai: number; product: number; total: number }>;
    opportunities: Array<{
      id: string;
      name: string;
      stage: string;
      acv: number | null;
      close_date: string | null;
    }>;
  };
}

// ── Helpers ──

// TD Fiscal: Q1=Feb,Mar,Apr  Q2=May,Jun,Jul  Q3=Aug,Sep,Oct  Q4=Nov,Dec,Jan
// FY label = calendar year + 1 for Feb-Dec, same for Jan
const FISCAL_QUARTER_MONTHS: Record<number, string[]> = {
  1: ["02", "03", "04"],
  2: ["05", "06", "07"],
  3: ["08", "09", "10"],
  4: ["11", "12", "01"],
};

function periodToFiscalQuarter(yyyymm: string): { fy: number; fq: number } {
  const parts = yyyymm.includes('-') ? yyyymm.split('-') : [yyyymm.slice(0, 4), yyyymm.slice(4, 6)];
  const year = parseInt(parts[0]);
  const monthNum = parseInt(parts[1]);
  const fy = monthNum >= 2 ? year + 1 : year;
  const fq = monthNum >= 2 && monthNum <= 4 ? 1
    : monthNum >= 5 && monthNum <= 7 ? 2
    : monthNum >= 8 && monthNum <= 10 ? 3
    : 4;
  return { fy, fq };
}

interface QuarterOption {
  label: string;
  value: string; // comma-separated YYYYMM periods
}

function buildQuarterOptions(periods: string[]): QuarterOption[] {
  const quarterMap = new Map<string, string[]>();
  for (const p of periods) {
    const { fy, fq } = periodToFiscalQuarter(p);
    const key = `Q${fq} FY${fy}`;
    if (!quarterMap.has(key)) quarterMap.set(key, []);
    quarterMap.get(key)!.push(p);
  }
  // Sort quarters descending (newest first)
  return [...quarterMap.entries()]
    .sort(([, a], [, b]) => b[0].localeCompare(a[0]))
    .map(([label, months]) => ({
      label,
      value: `q:${months.sort().join(",")}`,
    }));
}

const MONTH_NAMES: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December",
};

function formatPeriod(yyyymm: string): string {
  const parts = yyyymm.includes('-') ? yyyymm.split('-') : [yyyymm.slice(0, 4), yyyymm.slice(4, 6)];
  return `${MONTH_NAMES[parts[1]] || parts[1]} ${parts[0]}`;
}

function shortPeriod(yyyymm: string): string {
  // Handle both "YYYYMM" and "YYYY-MM" formats
  const parts = yyyymm.includes('-') ? yyyymm.split('-') : [yyyymm.slice(0, 4), yyyymm.slice(4, 6)];
  const year = parts[0].slice(2);
  const month = parts[1];
  const SHORT: Record<string, string> = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
  };
  return `${SHORT[month] || month} '${year}`;
}


const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) => {
  const v = Math.abs(val);
  return v >= 1000000
    ? `$${(v / 1000000).toFixed(1)}M`
    : v >= 1000
      ? `$${(v / 1000).toFixed(0)}K`
      : `$${Math.round(v)}`;
};

const COLOR_CONSUMPTION = "#5405BD"; // primary purple
const COLOR_OVERAGE = "#14C3B7";     // teal
const COLOR_TREND_LINE = "#FFCC00";  // gold

const TAXONOMY_COLORS = [
  "#5405BD", "#14C3B7", "#FFCC00", "#8023F9", "#f59e0b",
  "#6366f1", "#ec4899", "#22d3ee", "#84cc16", "#f97316",
];

type ProductDimension = "macro_sku" | "wallet" | "taxonomy";
const DIMENSION_LABELS: Record<ProductDimension, string> = {
  macro_sku: "Macro SKU",
  wallet: "Wallet Name",
  taxonomy: "Taxonomy Name",
};

const TOP_N_OPTIONS = [10, 25, 50];

// ── Component ──

export default function UsagePage() {
  const [selectedPeriod, setSelectedPeriod] = useFilterParam("period", "");
  const [macroSkuFilter, setMacroSkuFilter] = useFilterParam("macro_sku", "all");
  const [taxonomyFilter, setTaxonomyFilter] = useFilterParam("taxonomy", "all");
  const [topN, setTopN] = useFilterParamNumber("topN", 25);
  const [productDimension, setProductDimension] = useFilterParam("dimension", "macro_sku") as [ProductDimension, (v: string) => void];
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedPeriod) {
      // Strip "q:" prefix used for quarter values to avoid Select collisions
      const periodParam = selectedPeriod.startsWith("q:") ? selectedPeriod.slice(2) : selectedPeriod;
      params.set("period", periodParam);
    }
    if (macroSkuFilter !== "all") params.set("macro_sku", macroSkuFilter);
    if (taxonomyFilter !== "all") params.set("taxonomy", taxonomyFilter);
    return params.toString();
  }, [selectedPeriod, macroSkuFilter, taxonomyFilter]);

  const {
    data: listData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["usage-accounts", queryParams],
    queryFn: () =>
      apiFetch<AccountListResponse>(
        `/api/usage${queryParams ? `?${queryParams}` : ""}`
      ),
  });

  const {
    data: detailData,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ["usage-detail", selectedAccount],
    queryFn: () =>
      apiFetch<AccountDetailResponse>(
        `/api/usage?sf_account_id=${selectedAccount}`
      ),
    enabled: !!selectedAccount,
  });

  const accounts = listData?.data || [];
  const periods = listData?.periods || [];
  const totals = listData?.totals;
  const displayPeriod = listData?.selected_period || selectedPeriod;
  const productBreakdown = listData?.product_breakdown;
  const monthlyTrend = listData?.monthly_trend || [];
  const filterOptions = listData?.filter_options;

  // Build quarter options from available periods
  const quarterOptions = useMemo(() => buildQuarterOptions(periods), [periods]);

  // Determine display label for the header
  const periodDisplayLabel = useMemo(() => {
    const period = selectedPeriod || displayPeriod;
    if (!period) return "";
    if (period.startsWith("q:")) {
      const qo = quarterOptions.find(q => q.value === period);
      if (qo) return qo.label;
      return "Quarter";
    }
    return formatPeriod(period);
  }, [selectedPeriod, displayPeriod, quarterOptions]);

  // ── Top Accounts chart data ──
  const topAccountsData = useMemo(() => {
    return accounts.slice(0, topN).map((a) => ({
      name: a.sf_account_name.length > 25 ? a.sf_account_name.slice(0, 25) + "…" : a.sf_account_name,
      fullName: a.sf_account_name,
      consumption: Math.abs(a.consumption),
      overage: Math.abs(a.overage),
    }));
  }, [accounts, topN]);

  // ── Product breakdown chart data ──
  const productChartData = useMemo(() => {
    if (!productBreakdown) return [];
    const key = productDimension === "macro_sku" ? "by_macro_sku"
      : productDimension === "wallet" ? "by_wallet"
      : "by_taxonomy";
    return (productBreakdown[key] || []).map((p) => ({
      name: p.name.length > 30 ? p.name.slice(0, 30) + "…" : p.name,
      fullName: p.name,
      consumption: Math.abs(p.consumption),
      overage: Math.abs(p.overage),
    }));
  }, [productBreakdown, productDimension]);

  // ── Monthly trend chart data ──
  const trendChartData = useMemo(() => {
    return monthlyTrend.map((t) => ({
      period: shortPeriod(t.period),
      "Total Amount": Math.abs(t.charged),
      "Overage": Math.abs(t.overage),
      "Consumption": Math.abs(t.consumption),
    }));
  }, [monthlyTrend]);

  // ── Detail: Monthly Trend (AI vs Product Usage) ──
  const detailTrendData = useMemo(() => {
    if (!detailData?.data?.monthly_by_type) return [];
    return Object.entries(detailData.data.monthly_by_type)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]) => ({
        period: shortPeriod(period),
        "AI Product": Math.abs(vals.ai),
        "Product Usage": Math.abs(vals.product),
      }));
  }, [detailData]);

  // ── Detail: Monthly Trend by Taxonomy ──
  const taxonomyChartData = useMemo(() => {
    if (!detailData?.data?.monthly_by_taxonomy) return { data: [] as Record<string, string | number>[], taxonomies: [] as string[] };
    const allTax = new Set<string>();
    const data = Object.entries(detailData.data.monthly_by_taxonomy)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, taxes]) => {
        const entry: Record<string, string | number> = { period: shortPeriod(period) };
        for (const [tax, vals] of Object.entries(taxes)) {
          allTax.add(tax);
          entry[tax] = Math.abs(vals.charged);
        }
        return entry;
      });
    return { data, taxonomies: [...allTax].sort() };
  }, [detailData]);

  // ── Table Columns ──
  const columns: Column<Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "sf_account_name",
        header: "Account",
        render: (row) => (
          <span className="font-medium">{row.sf_account_name as string}</span>
        ),
      },
      { key: "sf_account_owner", header: "AE Owner" },
      {
        key: "charged",
        header: "Total Charged",
        render: (row) => fmtCurrency(Math.abs(row.charged as number)),
      },
      {
        key: "consumption",
        header: "Consumption",
        render: (row) => fmtCurrency(Math.abs(row.consumption as number)),
      },
      {
        key: "overage",
        header: "Overage",
        render: (row) => {
          const val = Math.abs(row.overage as number);
          return (
            <span className={val > 0 ? "text-amber-600 font-medium" : ""}>
              {fmtCurrency(val)}
            </span>
          );
        },
      },
      {
        key: "ai_pct",
        header: "AI Product %",
        render: (row) => {
          const charged = Math.abs(row.charged as number);
          const ai = Math.abs(row.ai_charged as number);
          if (!charged) return "—";
          const pct = Math.round((ai / charged) * 100);
          return (
            <Badge variant="outline" className="text-xs">
              {pct}%
            </Badge>
          );
        },
      },
    ],
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    const item = payload[0]?.payload as { fullName?: string };
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{item?.fullName || label}</p>
        {payload.map((p: { name: string; value: number }, i: number) => (
          <p key={i} className="text-muted-foreground">
            {p.name}: {fmtCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load usage data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      {/* ── Header + Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Usage {periodDisplayLabel ? `— ${periodDisplayLabel}` : ""}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setSelectedPeriod("");
              setMacroSkuFilter("all");
              setTaxonomyFilter("all");
              setTopN(25);
              setProductDimension("macro_sku");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
          <Select
            value={selectedPeriod || displayPeriod || ""}
            onValueChange={(v) => v && setSelectedPeriod(v)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              {quarterOptions.length > 0 && (
                <>
                  <SelectItem value="__quarterly_label" disabled className="text-xs font-semibold text-muted-foreground">
                    — Quarters —
                  </SelectItem>
                  {quarterOptions.map((q) => (
                    <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                  ))}
                  <SelectItem value="__monthly_label" disabled className="text-xs font-semibold text-muted-foreground">
                    — Months —
                  </SelectItem>
                </>
              )}
              {periods.map((p) => (
                <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={macroSkuFilter} onValueChange={(v) => v && setMacroSkuFilter(v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Macro SKU" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Macro SKUs</SelectItem>
              {(filterOptions?.macro_sku || []).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={taxonomyFilter} onValueChange={(v) => v && setTaxonomyFilter(v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Taxonomy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Taxonomies</SelectItem>
              {(filterOptions?.taxonomy || []).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Total Charged" value={Math.abs(totals.charged)} format="currency" />
          <KpiCard label="Consumption" value={Math.abs(totals.consumption)} format="currency" />
          <KpiCard label="Overage" value={Math.abs(totals.overage)} format="currency" />
          <KpiCard label="AI Usage" value={Math.abs(totals.ai_charged)} format="currency" />
          <KpiCard label="Other Usage" value={Math.abs(totals.product_charged)} format="currency" />
          <KpiCard label="Accounts with Overage" value={totals.accounts_with_overage} format="number" />
        </div>
      )}

      {/* ── Top Accounts + Product Breakdown (side by side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Accounts */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Top {topN} Accounts by Billing Amount
            </CardTitle>
            <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
              <SelectTrigger className="w-[80px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOP_N_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {topAccountsData.length === 0 ? (
              <EmptyState title="No data" description="No accounts for this period" icon={Radio} />
            ) : (
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={topAccountsData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={shortCurrency} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
                  <Tooltip content={barTooltip} />
                  <Legend />
                  <Bar dataKey="consumption" stackId="a" fill={COLOR_CONSUMPTION} name="Consumption" />
                  <Bar dataKey="overage" stackId="a" fill={COLOR_OVERAGE} name="Overage" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Product Breakdown */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {DIMENSION_LABELS[productDimension]} by Billing Amount
            </CardTitle>
            <Select value={productDimension} onValueChange={(v) => setProductDimension(v as ProductDimension)}>
              <SelectTrigger className="w-[160px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="macro_sku">Macro SKU</SelectItem>
                <SelectItem value="wallet">Wallet Name</SelectItem>
                <SelectItem value="taxonomy">Taxonomy Name</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {productChartData.length === 0 ? (
              <EmptyState title="No data" description="No product data for this period" icon={Radio} />
            ) : (
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={productChartData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={shortCurrency} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={180} />
                  <Tooltip content={barTooltip} />
                  <Legend />
                  <Bar dataKey="consumption" stackId="a" fill={COLOR_CONSUMPTION} name="Consumption" />
                  <Bar dataKey="overage" stackId="a" fill={COLOR_OVERAGE} name="Overage" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Billing Amount By Month ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Billing Amount by Month</CardTitle>
        </CardHeader>
        <CardContent>
          {trendChartData.length === 0 ? (
            <EmptyState title="No trend data" description="No monthly data available" icon={Radio} />
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={trendChartData}>
                <XAxis dataKey="period" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={shortCurrency} />
                <Tooltip formatter={(val: unknown) => fmtCurrency(Number(val))} />
                <Legend />
                <Bar dataKey="Consumption" stackId="a" fill={COLOR_CONSUMPTION} />
                <Bar dataKey="Overage" stackId="a" fill={COLOR_OVERAGE} />
                <Line
                  type="monotone"
                  dataKey="Total Amount"
                  stroke={COLOR_TREND_LINE}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Expansion Signals ── */}
      {accounts.length > 0 && (
        <ExpansionSignals
          accounts={accounts}
          onAccountClick={(id) => setSelectedAccount(id)}
        />
      )}

      {/* ── Account Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Account Usage ({accounts.length} accounts)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState title="No usage data" description="No usage data for the selected period and filters" icon={Radio} />
          ) : (
            <DataTable
              data={accounts as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={25}
              onRowClick={(row) => setSelectedAccount(row.sf_account_id as string)}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Account Detail Sheet ── */}
      <Sheet open={!!selectedAccount} onOpenChange={(v) => !v && setSelectedAccount(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailData?.data?.account?.name || "Account Usage"}</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-6"><DashboardSkeleton /></div>
          ) : detailData?.data ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">AE Owner</p>
                  <p className="font-medium">{detailData.data.account.users?.full_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Industry</p>
                  <p className="font-medium">{detailData.data.account.industry || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Region</p>
                  <p className="font-medium">{detailData.data.account.region || "—"}</p>
                </div>
              </div>

              <Separator />

              {detailData.data.opportunities.length > 0 && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Open Opportunities</h4>
                    <div className="space-y-2">
                      {detailData.data.opportunities.map((opp) => (
                        <div key={opp.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                          <span className="font-medium">{opp.name}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{opp.stage}</Badge>
                            <span>{opp.acv ? fmtCurrency(opp.acv) : "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-3">Monthly Charged — AI vs Product Usage</h4>
                {detailTrendData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trend data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={detailTrendData}>
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} />
                      <Tooltip formatter={(val: unknown) => fmtCurrency(Number(val))} />
                      <Legend />
                      <Bar dataKey="Product Usage" stackId="a" fill={COLOR_CONSUMPTION} />
                      <Bar dataKey="AI Product" stackId="a" fill={COLOR_OVERAGE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Monthly Charged by Product</h4>
                {taxonomyChartData.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No product data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={taxonomyChartData.data}>
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} />
                      <Tooltip formatter={(val: unknown) => fmtCurrency(Number(val))} />
                      <Legend />
                      {taxonomyChartData.taxonomies.map((tax, idx) => (
                        <Line
                          key={tax}
                          type="monotone"
                          dataKey={tax}
                          stroke={TAXONOMY_COLORS[idx % TAXONOMY_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
