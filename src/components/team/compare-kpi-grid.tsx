"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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

export function CompareKpiGrid({ entities, mode }: CompareKpiGridProps) {
  const showDelta = entities.length === 2;

  const getValue = (entity: CompareEntity, key: MetricKey): number => {
    const raw = entity.metrics[key];
    if (mode === "perRep" && entity.teamSize && entity.teamSize > 0 && key !== "attainment") {
      return raw / entity.teamSize;
    }
    return raw;
  };

  return (
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
                    <div>{entity.name}</div>
                    {entity.teamSize !== undefined && (
                      <div className="text-xs font-normal opacity-80">
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
              {KPI_DEFS.map((kpi, rowIdx) => (
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
                  {entities.map((entity) => (
                    <td key={entity.id} className="text-right py-3 px-4 font-semibold tabular-nums">
                      {formatValue(getValue(entity, kpi.key), kpi.format)}
                    </td>
                  ))}
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
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
