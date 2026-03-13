"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface QuotaGaugeProps {
  attainment: number;
}

export function QuotaGauge({ attainment }: QuotaGaugeProps) {
  const capped = Math.min(attainment, 100);
  const remaining = Math.max(100 - capped, 0);

  const color =
    attainment >= 75
      ? "hsl(142, 76%, 36%)"
      : attainment >= 50
        ? "hsl(38, 92%, 50%)"
        : "hsl(0, 72%, 51%)";

  const statusLabel =
    attainment >= 75 ? "On Track" : attainment >= 50 ? "At Risk" : "Behind";

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
        <span className="text-3xl font-bold">{attainment.toFixed(0)}%</span>
        <span
          className={cn(
            "text-xs font-medium",
            attainment >= 75
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
