"use client";

import { Card, CardContent } from "@/components/ui/card";
import { COMPARE_COLORS } from "@/lib/chart-colors";
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
  if (Math.abs(diff) < 0.5) return { direction: "flat" as const, value: 0, diff: 0 };
  return {
    direction: diff > 0 ? ("up" as const) : ("down" as const),
    value: b !== 0 ? Math.abs(Math.round(((a - b) / b) * 100)) : 0,
    diff,
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
    <div className="space-y-3">
      {KPI_DEFS.map((kpi) => (
        <Card key={kpi.key}>
          <CardContent className="py-3 px-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {kpi.label}
              {mode === "perRep" && kpi.key !== "attainment" && (
                <span className="ml-1">(per rep)</span>
              )}
            </div>
            <div className={cn(
              "grid gap-4",
              showDelta ? "grid-cols-[1fr_auto_1fr]" : `grid-cols-${entities.length}`
            )}>
              {showDelta ? (
                <>
                  {/* Entity A */}
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1" style={{ color: COMPARE_COLORS[0] }}>
                      {entities[0].name}
                      {entities[0].teamSize !== undefined && (
                        <span className="text-muted-foreground"> ({entities[0].teamSize} reps)</span>
                      )}
                    </div>
                    <div className="text-lg font-semibold">
                      {formatValue(getValue(entities[0], kpi.key), kpi.format)}
                    </div>
                  </div>

                  {/* Delta */}
                  {(() => {
                    const delta = getDelta(getValue(entities[0], kpi.key), getValue(entities[1], kpi.key));
                    return (
                      <div className="flex items-center justify-center px-2">
                        <div className="flex items-center gap-1">
                          {delta.direction === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                          {delta.direction === "down" && <TrendingDown className="h-4 w-4 text-red-600" />}
                          {delta.direction === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
                          {delta.value > 0 && (
                            <span className={cn(
                              "text-xs font-medium",
                              delta.direction === "up" && "text-green-600",
                              delta.direction === "down" && "text-red-600",
                            )}>
                              {delta.value}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Entity B */}
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1" style={{ color: COMPARE_COLORS[1] }}>
                      {entities[1].name}
                      {entities[1].teamSize !== undefined && (
                        <span className="text-muted-foreground"> ({entities[1].teamSize} reps)</span>
                      )}
                    </div>
                    <div className="text-lg font-semibold">
                      {formatValue(getValue(entities[1], kpi.key), kpi.format)}
                    </div>
                  </div>
                </>
              ) : (
                entities.map((entity, i) => (
                  <div key={entity.id} className="text-center">
                    <div className="text-xs text-muted-foreground mb-1" style={{ color: COMPARE_COLORS[i] }}>
                      {entity.name}
                      {entity.teamSize !== undefined && (
                        <span className="text-muted-foreground"> ({entity.teamSize} reps)</span>
                      )}
                    </div>
                    <div className="text-lg font-semibold">
                      {formatValue(getValue(entity, kpi.key), kpi.format)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
