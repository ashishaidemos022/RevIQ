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

interface AcvByMonthChartProps {
  opportunities?: Opportunity[];
  /** Pre-aggregated ACV by month (YYYY-MM → amount). When provided, opportunities is ignored. */
  acvByMonth?: Record<string, number>;
}

export function AcvByMonthChart({ opportunities, acvByMonth }: AcvByMonthChartProps) {
  const data = useMemo(() => {
    const months: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const now = new Date();

    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months[key] = 0;
      labelMap[key] = label;
    }

    if (acvByMonth) {
      // Use pre-aggregated data
      for (const [key, value] of Object.entries(acvByMonth)) {
        if (key in months) {
          months[key] = value;
        }
      }
    } else if (opportunities) {
      // Aggregate from raw opportunities
      opportunities
        .filter((o) => o.is_closed_won && o.close_date)
        .forEach((o) => {
          const d = new Date(o.close_date!);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (key in months) {
            months[key] += o.acv || 0;
          }
        });
    }

    return Object.entries(months).map(([key, value]) => ({
      month: labelMap[key],
      acv: value,
    }));
  }, [opportunities, acvByMonth]);

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
        <Bar dataKey="acv" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
