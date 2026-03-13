"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Opportunity } from "@/types";

interface PipelineByStageChartProps {
  opportunities: Opportunity[];
}

const STAGE_ORDER = [
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

export function PipelineByStageChart({
  opportunities,
}: PipelineByStageChartProps) {
  const data = useMemo(() => {
    const stageMap: Record<string, number> = {};

    opportunities
      .filter((o) => !o.is_closed_won && !o.is_closed_lost)
      .forEach((o) => {
        const stage = o.stage || "Other";
        stageMap[stage] = (stageMap[stage] || 0) + (o.arr || 0);
      });

    return Object.entries(stageMap)
      .sort(([a], [b]) => {
        const ai = STAGE_ORDER.indexOf(a);
        const bi = STAGE_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(([stage, arr]) => ({ stage, arr }));
  }, [opportunities]);

  const formatCurrency = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
        <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={100} />
        <Tooltip
          formatter={(val) =>
            new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(Number(val))
          }
        />
        <Bar
          dataKey="arr"
          fill="hsl(var(--chart-2))"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
