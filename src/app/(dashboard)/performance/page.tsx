"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getRollingQuarters } from "@/lib/fiscal";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface QuarterData {
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
  acvClosed: number;
  dealsClosed: number;
  quotaAttainment: number;
  activePilots: number;
  pilotConversionRate: number;
  commissionEarned: number;
  totalActivities: number;
}

const METRICS = [
  { key: "acvClosed", label: "ACV Closed", format: "currency" },
  { key: "dealsClosed", label: "Deals Closed", format: "number" },
  { key: "quotaAttainment", label: "Quota Attainment %", format: "percent" },
  { key: "activePilots", label: "Active Pilots", format: "number" },
  { key: "pilotConversionRate", label: "Pilot Conversion Rate", format: "percent" },
  { key: "commissionEarned", label: "Commission Earned", format: "currency" },
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

export default function PerformancePage() {
  const user = useAuthStore((s) => s.user);
  const [offset, setOffset] = useState(0);

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
    queryKey: ["performance", quarters],
    queryFn: () => {
      const params = quarters.map((q) => ({ fy: q.fiscalYear, q: q.fiscalQuarter }));
      return apiFetch<{ data: Record<string, QuarterData> }>(
        `/api/performance?quarters=${encodeURIComponent(JSON.stringify(params))}`
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
                      const val = q[metric.key] as number;
                      const prev = idx > 0 ? (quarterResults[idx - 1][metric.key] as number) : undefined;
                      const delta = getDelta(val, prev);
                      return (
                        <td key={q.label} className="text-right py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatValue(val, metric.format)}</span>
                            {idx > 0 && (
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
              <BarChart data={quarterResults}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyShort} />
                <Tooltip
                  formatter={(val) =>
                    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
                      Number(val)
                    )
                  }
                />
                <Bar dataKey="acvClosed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={quarterResults}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="totalActivities"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quota Attainment %</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={quarterResults}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(val) => `${Number(val).toFixed(1)}%`} />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="quotaAttainment"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
