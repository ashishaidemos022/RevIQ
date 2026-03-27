"use client";

import { useMemo, useState, useCallback } from "react";
import { useFilterParamNumber } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { getRollingQuarters } from "@/lib/fiscal";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { DealDrilldownDrawer, DrillDownDeal } from "@/components/charts/deal-drilldown-drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DealRecord {
  id: string;
  name: string;
  owner: string;
  acv: number;
}

interface QuarterData {
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
  acvClosed: number;
  dealsClosed: number;
  cxaClosed: number;
  dealsClosedWithCxa: number;
  quotaAttainment: number | null;
  annualQuota: number | null;
  bookedPilots: number | null;
  commissionEarned: number | null;
  totalActivities: number | null;
  acvDeals?: DealRecord[];
  dealsClosedDeals?: DealRecord[];
}

const METRICS = [
  { key: "acvClosed", label: "ACV Closed", format: "currency" },
  { key: "dealsClosed", label: "Deals Closed", format: "number" },
  { key: "cxaClosed", label: "CXA Closed", format: "currency" },
  { key: "dealsClosedWithCxa", label: "Deals Closed with CXA", format: "number" },
  { key: "quotaAttainment", label: "Quota Attainment %", format: "percent" },
  { key: "bookedPilots", label: "Booked Pilots", format: "number" },
  { key: "totalActivities", label: "Total Activities", format: "number" },
] as const;

function formatValue(value: number, format: string): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return new Intl.NumberFormat("en-US").format(value);
  }
}

export function PbmPerformance() {
  const [offset, setOffset] = useFilterParamNumber("offset", 0);
  const [drillDown, setDrillDown] = useState<{
    title: string;
    deals: DrillDownDeal[];
  } | null>(null);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);

  const quarters = useMemo(() => {
    const all = getRollingQuarters(8 + offset);
    return all.slice(Math.max(0, all.length - 4 - offset), all.length - offset);
  }, [offset]);

  const {
    data: perfData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["pbm-performance", quarters, viewAsUser?.user_id ?? null],
    queryFn: () => {
      const params = quarters.map((q) => ({ fy: q.fiscalYear, q: q.fiscalQuarter }));
      return apiFetch<{ data: Record<string, QuarterData> }>(
        `/api/pbm/performance?quarters=${encodeURIComponent(JSON.stringify(params))}`
      );
    },
  });

  const quarterResults = useMemo(() => {
    if (!perfData?.data) return [];
    return quarters.map((q) => perfData.data[q.label] || null).filter(Boolean) as QuarterData[];
  }, [perfData, quarters]);

  function getDelta(current: number, previous: number | undefined): { direction: "up" | "down" | "flat"; value: number } {
    if (previous === undefined || previous === 0) return { direction: "flat", value: 0 };
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.5) return { direction: "flat", value: 0 };
    return { direction: pct > 0 ? "up" : "down", value: Math.round(Math.abs(pct)) };
  }

  const formatCurrencyShort = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;

  const fmtCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAcvBarClick = useCallback((barData: any) => {
    const label = barData?.label || barData?.payload?.label;
    if (!label || !perfData?.data) return;
    const qd = perfData.data[label];
    if (qd?.acvDeals && qd.acvDeals.length > 0) {
      setDrillDown({ title: `${label} — ACV Closed`, deals: qd.acvDeals });
    }
  }, [perfData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDealsBarClick = useCallback((barData: any) => {
    const label = barData?.label || barData?.payload?.label;
    if (!label || !perfData?.data) return;
    const qd = perfData.data[label];
    if (qd?.dealsClosedDeals && qd.dealsClosedDeals.length > 0) {
      setDrillDown({ title: `${label} — Deals Closed`, deals: qd.dealsClosedDeals });
    }
  }, [perfData]);

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load performance data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset(offset + 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {quarters[0]?.label} — {quarters[quarters.length - 1]?.label}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Performance Summary Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quarterly Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Metric</th>
                  {quarterResults.map((q) => (
                    <th key={q.label} className="text-right py-2 px-4 font-medium text-muted-foreground">
                      {q.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr key={metric.key} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{metric.label}</td>
                    {quarterResults.map((q, idx) => {
                      const raw = q[metric.key];
                      const isNA = raw === null || raw === undefined;
                      const val = isNA ? 0 : (raw as number);
                      const prevRaw = idx > 0 ? quarterResults[idx - 1][metric.key] : undefined;
                      const prev = prevRaw === null || prevRaw === undefined ? undefined : (prevRaw as number);
                      const delta = isNA ? { direction: "flat" as const, value: 0 } : getDelta(val, prev);
                      return (
                        <td key={q.label} className="text-right py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <span className={isNA ? "text-muted-foreground" : ""}>{isNA ? "N/A" : formatValue(val, metric.format)}</span>
                            {idx > 0 && !isNA && (
                              <span className="inline-flex items-center gap-0.5">
                                {delta.direction === "up" && <TrendingUp className="h-3 w-3 text-green-600" />}
                                {delta.direction === "down" && <TrendingDown className="h-3 w-3 text-red-600" />}
                                {delta.direction === "flat" && <Minus className="h-3 w-3 text-muted-foreground" />}
                                <span
                                  className={cn(
                                    "text-xs",
                                    delta.direction === "up" && "text-green-600",
                                    delta.direction === "down" && "text-red-600",
                                    delta.direction === "flat" && "text-muted-foreground"
                                  )}
                                >
                                  {delta.value > 0 ? `${delta.value}%` : "—"}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ACV Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={quarterResults} className="cursor-pointer">
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} />
                <Tooltip formatter={(val) => fmtCurrency(Number(val))} />
                <Bar
                  dataKey="acvClosed"
                  fill="#7c3aed"
                  radius={[4, 4, 0, 0]}
                  onClick={handleAcvBarClick}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deals Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={quarterResults} className="cursor-pointer">
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="dealsClosed"
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                  onClick={handleDealsBarClick}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ACV Closed vs Quota</CardTitle>
          </CardHeader>
          <CardContent>
            {quarterResults.some((q) => q.annualQuota !== null) ? (
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={quarterResults.filter((q) => q.annualQuota !== null)}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} />
                  <Tooltip
                    formatter={(val, name) => [
                      fmtCurrency(Number(val)),
                      name === "acvClosed" ? "ACV Closed (YTD)" : "Annual Quota",
                    ]}
                  />
                  <Legend
                    formatter={(value) => (value === "acvClosed" ? "ACV Closed (YTD)" : "Annual Quota")}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="acvClosed" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="annualQuota"
                    stroke="#eab308"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                Quota data available from FY2027
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DealDrilldownDrawer
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title || ""}
        deals={drillDown?.deals || []}
      />
    </div>
  );
}
