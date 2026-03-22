"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface QuotaGaugeProps {
  attainment: number;
  expectedPace?: number;
}

export function QuotaGauge({ attainment, expectedPace }: QuotaGaugeProps) {
  const showPacing = expectedPace !== undefined && expectedPace > 0;

  // Pacing ratio: how far ahead/behind expected pace
  // e.g., 30% attainment vs 55% expected pace → pacing = 54.5% (behind)
  const pacingRatio = showPacing ? (attainment / expectedPace) * 100 : 0;

  // Color based on pacing: >= 90% of pace = green, 70-89% = amber, < 70% = red
  const color = showPacing
    ? pacingRatio >= 90
      ? "hsl(142, 76%, 36%)"
      : pacingRatio >= 70
        ? "hsl(38, 92%, 50%)"
        : "hsl(0, 72%, 51%)"
    : attainment >= 75
      ? "hsl(142, 76%, 36%)"
      : attainment >= 50
        ? "hsl(38, 92%, 50%)"
        : "hsl(0, 72%, 51%)";

  const statusLabel = showPacing
    ? pacingRatio >= 90
      ? "On Pace"
      : pacingRatio >= 70
        ? "Slightly Behind"
        : "Behind Pace"
    : attainment >= 75
      ? "On Track"
      : attainment >= 50
        ? "At Risk"
        : "Behind";

  // The gauge shows attainment against the expected pace
  // If pacing, the "full" ring represents expected pace, fill represents actual
  const gaugeMax = showPacing ? Math.max(expectedPace, attainment) : 100;
  const capped = Math.min(attainment, gaugeMax);
  const remaining = Math.max(gaugeMax - capped, 0);

  const data = [
    { value: capped, fill: color },
    { value: remaining, fill: "hsl(var(--muted))" },
  ];

  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width={200} height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={85}
            startAngle={180}
            endAngle={-180}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{attainment.toFixed(1)}%</span>
        {showPacing && (
          <span className="text-[10px] text-muted-foreground">
            of {expectedPace.toFixed(0)}% expected
          </span>
        )}
        <span
          className={cn(
            "text-xs font-medium",
            showPacing
              ? pacingRatio >= 90
                ? "text-green-600"
                : pacingRatio >= 70
                  ? "text-amber-500"
                  : "text-red-600"
              : attainment >= 75
                ? "text-green-600"
                : attainment >= 50
                  ? "text-amber-500"
                  : "text-red-600"
          )}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
