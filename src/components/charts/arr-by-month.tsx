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

interface ArrByMonthChartProps {
  opportunities: Opportunity[];
}

export function ArrByMonthChart({ opportunities }: ArrByMonthChartProps) {
  const data = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date();

    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months[key] = 0;
      // Store label mapping
      (months as Record<string, unknown>)[`_label_${key}`] = label;
    }

    opportunities
      .filter((o) => o.is_closed_won && o.close_date)
      .forEach((o) => {
        const d = new Date(o.close_date!);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in months) {
          months[key] += o.arr || 0;
        }
      });

    return Object.entries(months)
      .filter(([key]) => !key.startsWith("_label_"))
      .map(([key, value]) => ({
        month: (months as Record<string, unknown>)[`_label_${key}`] as string,
        arr: value,
      }));
  }, [opportunities]);

  const formatCurrency = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
        <Tooltip
          formatter={(val) =>
            new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(Number(val))
          }
        />
        <Bar dataKey="arr" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
