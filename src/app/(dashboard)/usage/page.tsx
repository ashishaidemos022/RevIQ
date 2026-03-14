"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Radio } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface AccountUsage {
  id: string;
  name: string;
  owner_user_id: string | null;
  users?: { id: string; full_name: string };
  linked_acv: number;
  usage: Record<string, { count: number; date: string }>;
  last_updated: string;
}

interface AccountDetail {
  metrics: Array<{
    id: string;
    account_id: string;
    product_type: string;
    interaction_count: number;
    metric_date: string;
  }>;
  account: {
    id: string;
    name: string;
    industry: string | null;
    region: string | null;
    users?: { id: string; full_name: string; email: string };
  };
  opportunities: Array<{
    id: string;
    name: string;
    stage: string;
    acv: number | null;
    close_date: string | null;
  }>;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function UsagePage() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const {
    data: accountsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["usage-accounts"],
    queryFn: () =>
      apiFetch<{ data: AccountUsage[]; product_types: string[]; total: number }>(
        "/api/usage?limit=200"
      ),
  });

  const {
    data: detailData,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ["usage-detail", selectedAccount],
    queryFn: () =>
      apiFetch<{ data: AccountDetail }>(
        `/api/usage?account_id=${selectedAccount}`
      ),
    enabled: !!selectedAccount,
  });

  const accounts = accountsData?.data || [];
  const productTypes = accountsData?.product_types || [];

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  const columns: Column<Record<string, unknown>>[] = useMemo(() => {
    const cols: Column<Record<string, unknown>>[] = [
      { key: "name", header: "Account Name" },
      {
        key: "owner",
        header: "AE Owner",
        render: (row) =>
          (row.users as { full_name: string } | undefined)?.full_name || "—",
      },
      {
        key: "linked_acv",
        header: "Linked ACV",
        render: (row) => formatCurrency(row.linked_acv as number),
      },
    ];

    productTypes.forEach((pt) => {
      cols.push({
        key: `usage_${pt}`,
        header: `${pt} Interactions`,
        render: (row) => {
          const usage = row.usage as Record<string, { count: number }>;
          return usage[pt]?.count?.toLocaleString() || "—";
        },
      });
    });

    cols.push({
      key: "last_updated",
      header: "Last Updated",
      render: (row) => {
        const date = row.last_updated as string;
        return date || "—";
      },
    });

    return cols;
  }, [productTypes]);

  // Build usage-over-time chart data for the detail view
  const usageChartData = useMemo(() => {
    if (!detailData?.data?.metrics) return [];
    const metrics = detailData.data.metrics;

    // Group by metric_date, product_type
    const dateMap: Record<string, Record<string, number>> = {};
    metrics.forEach((m) => {
      if (!dateMap[m.metric_date]) dateMap[m.metric_date] = {};
      dateMap[m.metric_date][m.product_type] = m.interaction_count;
    });

    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, products]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        ...products,
      }));
  }, [detailData]);

  const detailProductTypes = useMemo(() => {
    if (!detailData?.data?.metrics) return [];
    return [...new Set(detailData.data.metrics.map((m) => m.product_type))].sort();
  }, [detailData]);

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load usage data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Usage</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Account Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState
              title="No usage data"
              description="No product usage data available"
              icon={Radio}
            />
          ) : (
            <DataTable
              data={accounts as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={25}
              onRowClick={(row) => setSelectedAccount(row.id as string)}
            />
          )}
        </CardContent>
      </Card>

      {/* Account Detail Panel */}
      <Sheet
        open={!!selectedAccount}
        onOpenChange={(v) => !v && setSelectedAccount(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {detailData?.data?.account?.name || "Account Usage Details"}
            </SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-4 mt-6">
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
                    <h4 className="text-sm font-semibold mb-2">Open Opportunities</h4>
                    <div className="space-y-2">
                      {detailData.data.opportunities.map((opp) => (
                        <div
                          key={opp.id}
                          className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30"
                        >
                          <span className="font-medium">{opp.name}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{opp.stage}</Badge>
                            <span>{opp.acv ? formatCurrency(opp.acv) : "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Usage Over Time Chart */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Usage Over Time</h4>
                {usageChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={usageChartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {detailProductTypes.map((pt, idx) => (
                        <Line
                          key={pt}
                          type="monotone"
                          dataKey={pt}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <Separator />

              {/* Commission Multiplier */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Commission Multiplier</h4>
                <div className="grid grid-cols-2 gap-3">
                  {detailProductTypes.map((pt) => {
                    const latestMetric = detailData.data.metrics
                      .filter((m) => m.product_type === pt)
                      .sort((a, b) => b.metric_date.localeCompare(a.metric_date))[0];
                    const interactions = latestMetric?.interaction_count || 0;
                    // Default target of 1000 — would be configurable in Settings
                    const target = 1000;
                    const multiplier = Math.min(interactions / target, 1.0);
                    return (
                      <div key={pt} className="p-3 rounded-md bg-muted/30 text-sm">
                        <p className="text-muted-foreground">{pt}</p>
                        <p className="font-medium">
                          {interactions.toLocaleString()} / {target.toLocaleString()} interactions
                        </p>
                        <p className="font-bold text-lg">{multiplier.toFixed(2)}x</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Raw Interactions Table */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Raw Interactions</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Product</th>
                        <th className="text-right py-2">Interactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.data.metrics.slice(0, 50).map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="py-2">{m.metric_date}</td>
                          <td className="py-2">{m.product_type}</td>
                          <td className="py-2 text-right">{m.interaction_count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
