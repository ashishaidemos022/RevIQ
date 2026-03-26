"use client";

import { useMemo, useState } from "react";
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
import { Radio } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  taxonomies: Record<string, number>;
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

interface AccountListResponse {
  data: AccountRow[];
  periods: string[];
  selected_period: string;
  totals: Totals | null;
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

const MONTH_NAMES: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December",
};

function formatPeriod(yyyymm: string): string {
  const year = yyyymm.slice(0, 4);
  const month = yyyymm.slice(4, 6);
  return `${MONTH_NAMES[month] || month} ${year}`;
}

function shortPeriod(yyyymm: string): string {
  const year = yyyymm.slice(2, 4);
  const month = yyyymm.slice(4, 6);
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

const shortCurrency = (val: number) =>
  val >= 1000000
    ? `$${(val / 1000000).toFixed(1)}M`
    : val >= 1000
      ? `$${(val / 1000).toFixed(0)}K`
      : `$${Math.round(val)}`;

const TAXONOMY_COLORS = [
  "#5405BD", "#14C3B7", "#FFCC00", "#8023F9", "#f59e0b",
  "#6366f1", "#ec4899", "#22d3ee", "#84cc16", "#f97316",
];

// ── Component ──

export default function UsagePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const {
    data: listData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["usage-accounts", selectedPeriod],
    queryFn: () =>
      apiFetch<AccountListResponse>(
        `/api/usage${selectedPeriod ? `?period=${selectedPeriod}` : ""}`
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

  // Set initial period from API response
  if (!selectedPeriod && displayPeriod) {
    // Don't use setState during render — handled by queryKey
  }

  // ── Account List Table Columns ──
  const columns: Column<Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "sf_account_name",
        header: "Account",
        render: (row) => (
          <span className="font-medium">{row.sf_account_name as string}</span>
        ),
      },
      {
        key: "sf_account_owner",
        header: "AE Owner",
      },
      {
        key: "charged",
        header: "Total Charged",
        render: (row) => fmtCurrency(row.charged as number),
      },
      {
        key: "consumption",
        header: "Consumption",
        render: (row) => fmtCurrency(row.consumption as number),
      },
      {
        key: "overage",
        header: "Overage",
        render: (row) => {
          const val = row.overage as number;
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
          const charged = row.charged as number;
          const ai = row.ai_charged as number;
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

  // ── Detail: Monthly Trend (AI vs Product Usage) ──
  const trendChartData = useMemo(() => {
    if (!detailData?.data?.monthly_by_type) return [];
    return Object.entries(detailData.data.monthly_by_type)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]) => ({
        period: shortPeriod(period),
        "AI Product": vals.ai,
        "Product Usage": vals.product,
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
          entry[tax] = vals.charged;
        }
        return entry;
      });
    return { data, taxonomies: [...allTax].sort() };
  }, [detailData]);

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load usage data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Usage {displayPeriod ? `— ${formatPeriod(displayPeriod)}` : ""}
        </h1>
        <Select
          value={selectedPeriod || displayPeriod || ""}
          onValueChange={(v) => v && setSelectedPeriod(v)}
        >
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Select Month" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {formatPeriod(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Charged" value={totals.charged} format="currency" />
          <KpiCard label="Consumption" value={totals.consumption} format="currency" />
          <KpiCard label="Overage" value={totals.overage} format="currency" />
          <KpiCard label="AI Product" value={totals.ai_charged} format="currency" />
          <KpiCard label="Accounts with Overage" value={totals.accounts_with_overage} format="number" />
        </div>
      )}

      {/* Account Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Account Usage ({accounts.length} accounts)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState
              title="No usage data"
              description="No usage data available for the selected period"
              icon={Radio}
            />
          ) : (
            <DataTable
              data={accounts as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={25}
              onRowClick={(row) =>
                setSelectedAccount(row.sf_account_id as string)
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Account Detail Sheet */}
      <Sheet
        open={!!selectedAccount}
        onOpenChange={(v) => !v && setSelectedAccount(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {detailData?.data?.account?.name || "Account Usage"}
            </SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-6">
              <DashboardSkeleton />
            </div>
          ) : detailData?.data ? (
            <div className="mt-6 space-y-6">
              {/* Account Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">AE Owner</p>
                  <p className="font-medium">
                    {detailData.data.account.users?.full_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Industry</p>
                  <p className="font-medium">
                    {detailData.data.account.industry || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Region</p>
                  <p className="font-medium">
                    {detailData.data.account.region || "—"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Open Opportunities */}
              {detailData.data.opportunities.length > 0 && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Open Opportunities
                    </h4>
                    <div className="space-y-2">
                      {detailData.data.opportunities.map((opp) => (
                        <div
                          key={opp.id}
                          className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30"
                        >
                          <span className="font-medium">{opp.name}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{opp.stage}</Badge>
                            <span>
                              {opp.acv ? fmtCurrency(opp.acv) : "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Monthly Trend: AI vs Product Usage */}
              <div>
                <h4 className="text-sm font-semibold mb-3">
                  Monthly Charged — AI vs Product Usage
                </h4>
                {trendChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No trend data available
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={trendChartData}>
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={shortCurrency}
                      />
                      <Tooltip
                        formatter={(val: unknown) => fmtCurrency(Number(val))}
                      />
                      <Legend />
                      <Bar
                        dataKey="Product Usage"
                        stackId="a"
                        fill="#5405BD"
                      />
                      <Bar
                        dataKey="AI Product"
                        stackId="a"
                        fill="#14C3B7"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <Separator />

              {/* Monthly Trend by Taxonomy */}
              <div>
                <h4 className="text-sm font-semibold mb-3">
                  Monthly Charged by Product
                </h4>
                {taxonomyChartData.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No product data available
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={taxonomyChartData.data}>
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={shortCurrency}
                      />
                      <Tooltip
                        formatter={(val: unknown) => fmtCurrency(Number(val))}
                      />
                      <Legend />
                      {taxonomyChartData.taxonomies.map((tax, idx) => (
                        <Line
                          key={tax}
                          type="monotone"
                          dataKey={tax}
                          stroke={
                            TAXONOMY_COLORS[idx % TAXONOMY_COLORS.length]
                          }
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
