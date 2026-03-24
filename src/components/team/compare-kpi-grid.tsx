"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { COMPARE_COLORS } from "@/lib/chart-colors";

interface CompareEntity {
  id: string;
  name: string;
  teamSize?: number;
  metrics: {
    acvClosedQTD: number;
    acvClosedYTD: number;
    attainment: number;
    activePilots: number;
    activitiesQTD: number;
    commissionQTD: number;
  };
}

interface CompareKpiGridProps {
  entities: CompareEntity[];
  mode: "totals" | "perRep";
}

const KPI_DEFS = [
  { key: "acvClosedQTD", label: "ACV Closed QTD", format: "currency" },
  { key: "acvClosedYTD", label: "ACV Closed YTD", format: "currency" },
  { key: "attainment", label: "Attainment YTD", format: "percent" },
  { key: "activePilots", label: "Active Pilots", format: "number" },
  { key: "activitiesQTD", label: "Activities QTD", format: "number" },
  { key: "commissionQTD", label: "Commission QTD", format: "currency" },
] as const;

type MetricKey = (typeof KPI_DEFS)[number]["key"];

const RANK_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  0: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", label: "#1" },
  1: { bg: "bg-gray-100 dark:bg-gray-800/50", text: "text-gray-500 dark:text-gray-400", label: "#2" },
  2: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400", label: "#3" },
};

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

function getDelta(a: number, b: number) {
  const diff = a - b;
  if (Math.abs(diff) < 0.5) return { direction: "flat" as const, value: 0 };
  return {
    direction: diff > 0 ? ("up" as const) : ("down" as const),
    value: b !== 0 ? Math.abs(Math.round(((a - b) / b) * 100)) : 0,
  };
}

/** Compute rank (0-based) for each entity on a given metric. Ties get the same rank. */
function getRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((v) => {
    const rank = sorted.indexOf(v);
    return rank;
  });
}

export function CompareKpiGrid({ entities, mode }: CompareKpiGridProps) {
  const showDelta = entities.length === 2;

  const getValue = (entity: CompareEntity, key: MetricKey): number => {
    const raw = entity.metrics[key];
    if (mode === "perRep" && entity.teamSize && entity.teamSize > 0 && key !== "attainment") {
      return raw / entity.teamSize;
    }
    return raw;
  };

  // Compute ranks per metric and win counts per entity
  const { ranksByMetric, winCounts } = useMemo(() => {
    const ranksByMetric: Record<string, number[]> = {};
    const winCounts: number[] = new Array(entities.length).fill(0);

    KPI_DEFS.forEach((kpi) => {
      const values = entities.map((e) => getValue(e, kpi.key));
      const ranks = getRanks(values);
      ranksByMetric[kpi.key] = ranks;
      ranks.forEach((rank, entityIdx) => {
        if (rank === 0) winCounts[entityIdx]++;
      });
    });

    return { ranksByMetric, winCounts };
  }, [entities, mode]);

  return (
    <div className="space-y-4">
      {/* Wins Scoreboard */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" />
              Metric Wins
            </div>
            {entities.map((entity, i) => (
              <div key={entity.id} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: COMPARE_COLORS[i] }}
                />
                <span className="text-sm font-medium">{entity.name}</span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold",
                  winCounts[i] === Math.max(...winCounts)
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
                )}>
                  {winCounts[i]} / {KPI_DEFS.length}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI Comparison Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full text-sm">
              {/* Talkdesk-branded header with entity names */}
              <thead>
                <tr
                  className="text-white"
                  style={{ background: "linear-gradient(135deg, #5405bd 0%, #360379 100%)" }}
                >
                  <th className="text-left py-3 px-4 font-semibold rounded-tl-lg">
                    Metric
                    {mode === "perRep" && (
                      <span className="ml-1 text-xs font-normal opacity-80">(per rep)</span>
                    )}
                  </th>
                  {entities.map((entity, i) => (
                    <th key={entity.id} className={cn(
                      "text-right py-3 px-4 font-semibold",
                      i === entities.length - 1 && !showDelta && "rounded-tr-lg"
                    )}>
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: COMPARE_COLORS[i] }}
                        />
                        <span>{entity.name}</span>
                      </div>
                      {entity.teamSize !== undefined && (
                        <div className="text-xs font-normal opacity-80 text-right">
                          {entity.teamSize} reps
                        </div>
                      )}
                    </th>
                  ))}
                  {showDelta && (
                    <th className="text-center py-3 px-4 font-semibold rounded-tr-lg" style={{ color: "#ffcc00" }}>
                      Delta
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {KPI_DEFS.map((kpi, rowIdx) => {
                  const ranks = ranksByMetric[kpi.key] || [];
                  return (
                    <tr
                      key={kpi.key}
                      className={cn(
                        "border-b last:border-0",
                        rowIdx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      )}
                    >
                      <td className="py-3 px-4 font-medium text-muted-foreground">
                        {kpi.label}
                      </td>
                      {entities.map((entity, entityIdx) => {
                        const rank = ranks[entityIdx];
                        const rankStyle = rank <= 2 ? RANK_STYLES[rank] : null;
                        return (
                          <td key={entity.id} className="text-right py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-semibold tabular-nums">
                                {formatValue(getValue(entity, kpi.key), kpi.format)}
                              </span>
                              {rankStyle && (
                                <span className={cn(
                                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none",
                                  rankStyle.bg,
                                  rankStyle.text,
                                )}>
                                  {rankStyle.label}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      {showDelta && (() => {
                        const delta = getDelta(
                          getValue(entities[0], kpi.key),
                          getValue(entities[1], kpi.key)
                        );
                        return (
                          <td className="text-center py-3 px-4">
                            <span className="inline-flex items-center gap-1">
                              {delta.direction === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-600" />}
                              {delta.direction === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-600" />}
                              {delta.direction === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                              {delta.value > 0 && (
                                <span className={cn(
                                  "text-xs font-medium",
                                  delta.direction === "up" && "text-green-600",
                                  delta.direction === "down" && "text-red-600",
                                )}>
                                  {delta.value}%
                                </span>
                              )}
                            </span>
                          </td>
                        );
                      })()}
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
