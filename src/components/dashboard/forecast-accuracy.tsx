"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate } from "@/lib/fiscal";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Target, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface QuarterData {
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
  acvClosed: number;
  dealsClosed: number;
  quotaAttainment: number | null;
  annualQuota: number | null;
  weeklyAcv?: number[];
}

interface PipelineKpis {
  totalPipelineAcv: number;
  forecastedPipelineAcv: number;
  upsidePipelineAcv: number;
  dealCount: number;
}

interface ForecastAccuracyProps {
  quarterResults: QuarterData[];
}

// ─── Helpers ────────────────────────────────────────────

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

function accuracyColor(pct: number): string {
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function accuracyBg(pct: number): string {
  if (pct >= 90) return "bg-green-500/10 border-green-500/20";
  if (pct >= 70) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function coverageColor(ratio: number): string {
  if (ratio >= 3) return "text-green-600 dark:text-green-400";
  if (ratio >= 2) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ─── Component ──────────────────────────────────────────

export function ForecastAccuracy({ quarterResults }: ForecastAccuracyProps) {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear: curFY, fiscalQuarter: curFQ } = getCurrentFiscalPeriod();
  const curLabel = `Q${curFQ} FY${curFY}`;

  // Fetch current quarter pipeline KPIs for forecast category breakdown
  const pipelineParams = useMemo(() => {
    const params = new URLSearchParams();
    if (viewAsUser) params.set("viewAs", viewAsUser.user_id);
    return params.toString();
  }, [viewAsUser]);

  const { data: pipelineData } = useQuery({
    queryKey: ["forecast-pipeline-kpis", pipelineParams],
    queryFn: () =>
      apiFetch<{ data: PipelineKpis }>(
        `/api/pipeline/kpis${pipelineParams ? `?${pipelineParams}` : ""}`
      ),
  });

  const pipelineKpis = pipelineData?.data;

  // ─── Computed metrics ────────────────────────────────

  const quarterMetrics = useMemo(() => {
    return quarterResults.map((q) => {
      const quarterlyQuota = q.annualQuota ? q.annualQuota / 4 : null;
      const accuracy = quarterlyQuota && quarterlyQuota > 0
        ? (q.acvClosed / quarterlyQuota) * 100
        : null;
      return {
        ...q,
        quarterlyQuota,
        accuracy,
      };
    });
  }, [quarterResults]);

  // Current quarter data
  const currentQ = quarterMetrics.find((q) => q.label === curLabel);
  const pastQuarters = quarterMetrics.filter((q) => q.label !== curLabel);

  // Trailing accuracy (average of past quarters with data)
  const trailingAccuracy = useMemo(() => {
    const withData = pastQuarters.filter((q) => q.accuracy !== null);
    if (withData.length === 0) return null;
    return withData.reduce((s, q) => s + q.accuracy!, 0) / withData.length;
  }, [pastQuarters]);

  // Current quarter coverage
  const currentCoverage = useMemo(() => {
    if (!currentQ?.quarterlyQuota || !pipelineKpis) return null;
    const won = currentQ.acvClosed;
    const forecast = pipelineKpis.forecastedPipelineAcv;
    const upside = pipelineKpis.upsidePipelineAcv;
    const remaining = pipelineKpis.totalPipelineAcv - forecast - upside;
    const quota = currentQ.quarterlyQuota;
    const total = won + pipelineKpis.totalPipelineAcv;
    const coverageRatio = quota > 0 ? total / quota : 0;
    const gap = Math.max(0, quota - total);
    const surplus = Math.max(0, total - quota);

    return { won, forecast, upside, remaining, quota, total, coverageRatio, gap, surplus };
  }, [currentQ, pipelineKpis]);

  // Quarter progress (what % through the quarter are we?)
  const quarterProgress = useMemo(() => {
    const start = getQuarterStartDate(curFY, curFQ);
    const end = getQuarterEndDate(curFY, curFQ);
    const now = Date.now();
    const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const elapsed = Math.max(0, (now - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(100, (elapsed / totalDays) * 100);
  }, [curFY, curFQ]);

  // ─── Quota vs Actual chart data ──────────────────────

  const quotaVsActualData = useMemo(() => {
    return quarterMetrics.map((q) => ({
      label: q.label,
      actual: q.acvClosed,
      quota: q.quarterlyQuota || 0,
      accuracy: q.accuracy,
      isCurrent: q.label === curLabel,
    }));
  }, [quarterMetrics, curLabel]);

  // ─── Coverage waterfall data ─────────────────────────

  const coverageWaterfallData = useMemo(() => {
    if (!currentCoverage) return [];
    const { won, forecast, upside, remaining, gap, quota } = currentCoverage;
    return [
      { name: "Already Won", value: won, fill: "#22c55e" },
      { name: "Forecast", value: forecast, fill: "#7c3aed" },
      { name: "Upside", value: upside, fill: "#14b8a6" },
      { name: "Other Pipeline", value: remaining, fill: "#94a3b8" },
      ...(gap > 0 ? [{ name: "Gap to Quota", value: gap, fill: "#ef4444" }] : []),
    ];
  }, [currentCoverage]);

  // ─── Render ──────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Forecast Accuracy</h2>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Quarter Accuracy */}
        <Card className={cn("border", currentQ?.accuracy != null && accuracyBg(currentQ.accuracy))}>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {curLabel} Accuracy
            </p>
            <p className={cn("text-2xl font-bold mt-1", currentQ?.accuracy != null && accuracyColor(currentQ.accuracy))}>
              {currentQ?.accuracy != null ? `${currentQ.accuracy.toFixed(1)}%` : "N/A"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {currentQ ? `${fmtCurrency(currentQ.acvClosed)} of ${currentQ.quarterlyQuota ? fmtCurrency(currentQ.quarterlyQuota) : "N/A"} quota` : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Trailing Accuracy */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Trailing Avg Accuracy
            </p>
            <p className={cn("text-2xl font-bold mt-1", trailingAccuracy != null && accuracyColor(trailingAccuracy))}>
              {trailingAccuracy != null ? `${trailingAccuracy.toFixed(1)}%` : "N/A"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Past {pastQuarters.filter((q) => q.accuracy !== null).length} quarter{pastQuarters.filter((q) => q.accuracy !== null).length !== 1 ? "s" : ""} average
            </p>
          </CardContent>
        </Card>

        {/* Pipeline Coverage */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Pipeline Coverage
            </p>
            <p className={cn("text-2xl font-bold mt-1", currentCoverage && coverageColor(currentCoverage.coverageRatio))}>
              {currentCoverage ? `${currentCoverage.coverageRatio.toFixed(1)}x` : "N/A"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {currentCoverage
                ? `${fmtCurrency(currentCoverage.total)} total vs ${fmtCurrency(currentCoverage.quota)} quota`
                : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Quarter Progress */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Quarter Progress
            </p>
            <p className="text-2xl font-bold mt-1">
              {quarterProgress.toFixed(0)}%
            </p>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${quarterProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quota vs Actual — Multi-Quarter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quota vs Actual by Quarter</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={quotaVsActualData} barGap={4}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} width={60} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip
                  formatter={(val: any, name: any) => [fmtCurrency(Number(val)), name === "actual" ? "Actual Closed" : "Quarterly Quota"]}
                />
                <Legend
                  formatter={(value) => (value === "actual" ? "Actual Closed" : "Quarterly Quota")}
                />
                <Bar dataKey="quota" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" radius={[4, 4, 0, 0]}>
                  {quotaVsActualData.map((entry, idx) => {
                    const pct = entry.accuracy ?? 0;
                    let fill = "#ef4444"; // red < 70%
                    if (pct >= 90) fill = "#22c55e"; // green
                    else if (pct >= 70) fill = "#f59e0b"; // amber
                    if (entry.isCurrent) fill = "#7c3aed"; // purple for current (in-progress)
                    return <Cell key={idx} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Current Quarter Coverage Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{curLabel} Forecast Coverage</CardTitle>
              {currentCoverage && currentCoverage.gap > 0 && (
                <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/15 gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  {fmtCurrency(currentCoverage.gap)} gap
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {coverageWaterfallData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
                No pipeline data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={coverageWaterfallData} layout="vertical" barSize={28}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={shortCurrency} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    formatter={(val: any) => fmtCurrency(Number(val))}
                    cursor={{ fill: "transparent" }}
                  />
                  {currentCoverage && (
                    <ReferenceLine
                      x={currentCoverage.quota}
                      stroke="#7c3aed"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      label={{
                        value: `Quota: ${shortCurrency(currentCoverage.quota)}`,
                        position: "top",
                        fontSize: 10,
                        fill: "#7c3aed",
                      }}
                    />
                  )}
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {coverageWaterfallData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Quarter Accuracy Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quarterly Forecast Accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Quarter</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Quarterly Quota</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Actual Closed</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Deals Closed</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Accuracy</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">vs Prior</th>
                </tr>
              </thead>
              <tbody>
                {quarterMetrics.map((q, idx) => {
                  const isCurrent = q.label === curLabel;
                  const prevAccuracy = idx > 0 ? quarterMetrics[idx - 1].accuracy : null;
                  const delta =
                    q.accuracy != null && prevAccuracy != null
                      ? q.accuracy - prevAccuracy
                      : null;

                  return (
                    <tr
                      key={q.label}
                      className={cn(
                        "border-b last:border-0",
                        isCurrent && "bg-primary/5"
                      )}
                    >
                      <td className="py-3 pr-4 font-medium">
                        {q.label}
                        {isCurrent && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            Current
                          </Badge>
                        )}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums">
                        {q.quarterlyQuota != null ? fmtCurrency(q.quarterlyQuota) : "N/A"}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums font-semibold">
                        {fmtCurrency(q.acvClosed)}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums">
                        {q.dealsClosed}
                      </td>
                      <td className={cn("text-right py-3 px-4 tabular-nums font-semibold", q.accuracy != null && accuracyColor(q.accuracy))}>
                        {q.accuracy != null ? `${q.accuracy.toFixed(1)}%` : "N/A"}
                      </td>
                      <td className="text-right py-3 px-4">
                        {delta != null ? (
                          <span className="inline-flex items-center gap-0.5">
                            {delta > 0.5 && <TrendingUp className="h-3 w-3 text-green-600" />}
                            {delta < -0.5 && <TrendingDown className="h-3 w-3 text-red-600" />}
                            {Math.abs(delta) <= 0.5 && <Minus className="h-3 w-3 text-muted-foreground" />}
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                delta > 0.5 && "text-green-600",
                                delta < -0.5 && "text-red-600",
                                Math.abs(delta) <= 0.5 && "text-muted-foreground"
                              )}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)}pp
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
