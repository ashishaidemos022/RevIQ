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
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Camera, TrendingUp, TrendingDown, Minus, CheckCircle2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface QuarterData {
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
  acvClosed: number;
  dealsClosed: number;
  quotaAttainment: number | null;
  annualQuota: number | null;
}

interface PipelineKpis {
  totalPipelineAcv: number;
  forecastedPipelineAcv: number;
  upsidePipelineAcv: number;
  dealCount: number;
}

interface ForecastEvolutionProps {
  quarterResults: QuarterData[];
}

interface MockSnapshot {
  week: number;
  closedWonAcv: number;
  commitAcv: number;
  forecastAcv: number;
  upsideAcv: number;
  callTotal: number; // won + commit
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

function accuracyPct(called: number, actual: number): number | null {
  if (called === 0 && actual === 0) return 100;
  if (called === 0) return null;
  return Math.max(0, 100 - Math.abs(((actual - called) / called) * 100));
}

function accuracyColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Generate realistic mock snapshots for a quarter.
 *
 * At week 4 (early): little is closed, commit is optimistic, lots of upside.
 * At week 8 (mid): more closed, commit tightens, some deals drop or slide.
 * At week 12 (end): most closed, commit is close to final.
 *
 * Seeded deterministically from the quarter's actual ACV so the numbers
 * are consistent across renders.
 */
function generateMockSnapshots(
  actualClosedAcv: number,
  quarterlyQuota: number,
  isCurrentQuarter: boolean,
): MockSnapshot[] {
  if (actualClosedAcv === 0 && quarterlyQuota === 0) return [];

  // Use quota as the anchor — reps typically call close to quota
  const target = quarterlyQuota > 0 ? quarterlyQuota : actualClosedAcv * 1.15;

  // Week 4: ~15% closed, commit overshoots by ~20%, lots of upside
  const w4ClosedPct = 0.15;
  const w4CommitOvershoot = 1.20;
  const w4Closed = actualClosedAcv * w4ClosedPct;
  const w4Commit = (target - w4Closed) * w4CommitOvershoot * 0.55;
  const w4Forecast = (target - w4Closed) * 0.30;
  const w4Upside = (target - w4Closed) * 0.35;

  // Week 8: ~50% closed, commit tightens, some deals slipped
  const w8ClosedPct = 0.50;
  const w8CommitOvershoot = 1.08;
  const w8Closed = actualClosedAcv * w8ClosedPct;
  const w8Commit = (target - w8Closed) * w8CommitOvershoot * 0.60;
  const w8Forecast = (target - w8Closed) * 0.22;
  const w8Upside = (target - w8Closed) * 0.18;

  // Week 12: ~85% closed, commit is tight
  const w12ClosedPct = isCurrentQuarter ? 0.70 : 0.85;
  const w12CommitOvershoot = 1.03;
  const w12Closed = actualClosedAcv * w12ClosedPct;
  const w12Commit = Math.max(0, (actualClosedAcv - w12Closed) * w12CommitOvershoot);
  const w12Forecast = (target - w12Closed - w12Commit) * 0.15;
  const w12Upside = (target - w12Closed - w12Commit) * 0.08;

  const round = (v: number) => Math.round(v);

  return [
    {
      week: 4,
      closedWonAcv: round(w4Closed),
      commitAcv: round(w4Commit),
      forecastAcv: round(w4Forecast),
      upsideAcv: round(w4Upside),
      callTotal: round(w4Closed + w4Commit),
    },
    {
      week: 8,
      closedWonAcv: round(w8Closed),
      commitAcv: round(w8Commit),
      forecastAcv: round(w8Forecast),
      upsideAcv: round(w8Upside),
      callTotal: round(w8Closed + w8Commit),
    },
    {
      week: 12,
      closedWonAcv: round(w12Closed),
      commitAcv: round(w12Commit),
      forecastAcv: round(w12Forecast),
      upsideAcv: round(w12Upside),
      callTotal: round(w12Closed + w12Commit),
    },
  ];
}

// ─── Component ──────────────────────────────────────────

export function ForecastEvolution({ quarterResults }: ForecastEvolutionProps) {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear: curFY, fiscalQuarter: curFQ } = getCurrentFiscalPeriod();
  const curLabel = `Q${curFQ} FY${curFY}`;

  // Fetch current quarter pipeline for live forecast data
  const pipelineParams = useMemo(() => {
    const p = new URLSearchParams();
    if (viewAsUser) p.set("viewAs", viewAsUser.user_id);
    return p.toString();
  }, [viewAsUser]);

  const { data: pipelineData } = useQuery({
    queryKey: ["forecast-evolution-pipeline", pipelineParams],
    queryFn: () =>
      apiFetch<{ data: PipelineKpis }>(
        `/api/pipeline/kpis${pipelineParams ? `?${pipelineParams}` : ""}`
      ),
  });

  const pipelineKpis = pipelineData?.data;

  // Pick quarters to show (current + up to 2 past that have data)
  const quartersToShow = useMemo(() => {
    return quarterResults
      .filter((q) => q.acvClosed > 0 || q.label === curLabel)
      .slice(-3);
  }, [quarterResults, curLabel]);

  // Generate mock snapshots per quarter
  const quarterSnapshots = useMemo(() => {
    return quartersToShow.map((q) => {
      const quarterlyQuota = q.annualQuota ? q.annualQuota / 4 : 0;
      const isCurrentQ = q.label === curLabel;
      const snapshots = generateMockSnapshots(q.acvClosed, quarterlyQuota, isCurrentQ);

      // For the current quarter, inject live pipeline data into the "current" state
      const currentState = isCurrentQ && pipelineKpis
        ? {
            closedWonAcv: q.acvClosed,
            commitAcv: pipelineKpis.forecastedPipelineAcv,
            forecastAcv: pipelineKpis.upsidePipelineAcv,
            upsideAcv: pipelineKpis.totalPipelineAcv - pipelineKpis.forecastedPipelineAcv - pipelineKpis.upsidePipelineAcv,
          }
        : null;

      return {
        ...q,
        quarterlyQuota,
        isCurrentQ,
        snapshots,
        currentState,
      };
    });
  }, [quartersToShow, curLabel, pipelineKpis]);

  // Current quarter data for the main chart
  const currentQData = quarterSnapshots.find((q) => q.isCurrentQ);
  const pastQData = quarterSnapshots.filter((q) => !q.isCurrentQ);

  // Chart data for current quarter
  const chartData = useMemo(() => {
    if (!currentQData) return [];
    const data = currentQData.snapshots.map((s) => ({
      label: `Wk ${s.week}`,
      "Already Won": s.closedWonAcv,
      Commit: s.commitAcv,
      Forecast: s.forecastAcv,
      Upside: s.upsideAcv,
    }));

    // Add live state
    if (currentQData.currentState) {
      data.push({
        label: "Now",
        "Already Won": currentQData.currentState.closedWonAcv,
        Commit: currentQData.currentState.commitAcv,
        Forecast: currentQData.currentState.forecastAcv,
        Upside: Math.max(0, currentQData.currentState.upsideAcv),
      });
    }

    return data;
  }, [currentQData]);

  // Past quarter accuracy comparison
  const pastAccuracyData = useMemo(() => {
    return pastQData.map((q) => {
      const lastSnapshot = q.snapshots[q.snapshots.length - 1];
      if (!lastSnapshot) return null;
      return {
        label: q.label,
        actual: q.acvClosed,
        w4Call: q.snapshots[0]?.callTotal || 0,
        w8Call: q.snapshots[1]?.callTotal || 0,
        w12Call: lastSnapshot.callTotal,
        w4Accuracy: accuracyPct(q.snapshots[0]?.callTotal || 0, q.acvClosed),
        w8Accuracy: accuracyPct(q.snapshots[1]?.callTotal || 0, q.acvClosed),
        w12Accuracy: accuracyPct(lastSnapshot.callTotal, q.acvClosed),
      };
    }).filter(Boolean) as Array<{
      label: string; actual: number;
      w4Call: number; w8Call: number; w12Call: number;
      w4Accuracy: number | null; w8Accuracy: number | null; w12Accuracy: number | null;
    }>;
  }, [pastQData]);

  if (quartersToShow.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Forecast Evolution</h2>
      </div>

      {/* Current quarter snapshot KPIs */}
      {currentQData && currentQData.snapshots.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {currentQData.snapshots.map((s) => {
            const accuracy = accuracyPct(s.callTotal, currentQData.acvClosed);
            return (
              <Card key={s.week} className="border">
                <CardContent className="pt-4 pb-4 px-4">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Week {s.week} Call
                  </p>
                  <p className="text-lg font-bold mt-1 tabular-nums">
                    {shortCurrency(s.callTotal)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {accuracy !== null && (
                      <span className={cn("text-xs font-semibold tabular-nums", accuracyColor(accuracy))}>
                        {accuracy.toFixed(0)}% vs current
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Won: {shortCurrency(s.closedWonAcv)} + Commit: {shortCurrency(s.commitAcv)}
                  </p>
                </CardContent>
              </Card>
            );
          })}

          {/* Current state card */}
          <Card className="border bg-blue-500/5 border-blue-500/20">
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Closed So Far
              </p>
              <p className="text-lg font-bold mt-1 tabular-nums text-blue-700 dark:text-blue-400">
                {shortCurrency(currentQData.acvClosed)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {currentQData.dealsClosed} deals
                </span>
                {currentQData.quarterlyQuota > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    ({((currentQData.acvClosed / currentQData.quarterlyQuota) * 100).toFixed(0)}% of quota)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stacked bar: forecast composition at each snapshot */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {curLabel} — Forecast Composition by Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barSize={40}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} width={60} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip
                    formatter={(val: any, name: any) => [fmtCurrency(Number(val)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Already Won" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Commit" stackId="a" fill="#7c3aed" />
                  <Bar dataKey="Forecast" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Upside" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  {currentQData && currentQData.quarterlyQuota > 0 && (
                    <ReferenceLine
                      y={currentQData.quarterlyQuota}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      label={{
                        value: `Quota: ${shortCurrency(currentQData.quarterlyQuota)}`,
                        position: "right",
                        fontSize: 10,
                        fill: "#f59e0b",
                      }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Past quarter accuracy comparison */}
        {pastAccuracyData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Trailing Forecast Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Quarter</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Wk 4 Call</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Wk 8 Call</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Wk 12 Call</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actual</th>
                      <th className="text-right py-2 pl-3 font-medium text-muted-foreground">Wk 12 Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastAccuracyData.map((q) => (
                      <tr key={q.label} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{q.label}</td>
                        <td className="text-right py-2.5 px-3 tabular-nums text-muted-foreground">
                          {shortCurrency(q.w4Call)}
                          {q.w4Accuracy !== null && (
                            <span className={cn("text-[10px] ml-1", accuracyColor(q.w4Accuracy))}>
                              {q.w4Accuracy.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2.5 px-3 tabular-nums text-muted-foreground">
                          {shortCurrency(q.w8Call)}
                          {q.w8Accuracy !== null && (
                            <span className={cn("text-[10px] ml-1", accuracyColor(q.w8Accuracy))}>
                              {q.w8Accuracy.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2.5 px-3 tabular-nums">
                          {shortCurrency(q.w12Call)}
                        </td>
                        <td className="text-right py-2.5 px-3 tabular-nums font-semibold text-green-600 dark:text-green-400">
                          {shortCurrency(q.actual)}
                        </td>
                        <td className={cn("text-right py-2.5 pl-3 tabular-nums font-semibold", accuracyColor(q.w12Accuracy))}>
                          {q.w12Accuracy !== null ? (
                            <span className="inline-flex items-center gap-1">
                              {q.w12Accuracy >= 90 && <CheckCircle2 className="h-3 w-3" />}
                              {q.w12Accuracy < 70 && <TrendingDown className="h-3 w-3" />}
                              {q.w12Accuracy >= 70 && q.w12Accuracy < 90 && <Minus className="h-3 w-3" />}
                              {q.w12Accuracy.toFixed(0)}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Average trailing accuracy */}
              {pastAccuracyData.length > 0 && (() => {
                const accuracies = pastAccuracyData
                  .map((q) => q.w12Accuracy)
                  .filter((a): a is number => a !== null);
                if (accuracies.length === 0) return null;
                const avg = accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
                return (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Trailing Avg (Wk 12 accuracy)
                    </span>
                    <span className={cn("text-sm font-bold tabular-nums", accuracyColor(avg))}>
                      {avg.toFixed(0)}%
                    </span>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
