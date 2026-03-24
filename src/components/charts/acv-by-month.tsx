"use client";

import { useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Opportunity } from "@/types";
import { DealDrilldownDrawer, DrillDownDeal } from "./deal-drilldown-drawer";

export interface AcvDeal {
  id: string;
  name: string;
  owner: string;
  acv: number;
}

interface AcvByMonthChartProps {
  opportunities?: Opportunity[];
  /** Pre-aggregated ACV by month (YYYY-MM → amount). When provided, opportunities is ignored. */
  acvByMonth?: Record<string, number>;
  /** Deal-level data keyed by YYYY-MM for drill-down */
  acvDeals?: Record<string, AcvDeal[]>;
}

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) =>
  val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;

export function AcvByMonthChart({ opportunities, acvByMonth, acvDeals }: AcvByMonthChartProps) {
  const [drillDown, setDrillDown] = useState<{
    month: string;
    deals: DrillDownDeal[];
  } | null>(null);

  // Build label → raw YYYY-MM mapping for reverse lookup on click
  const { data, labelToKey } = useMemo(() => {
    const months: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const keyToLabel: Record<string, string> = {};
    const now = new Date();

    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months[key] = 0;
      labelMap[key] = label;
      keyToLabel[label] = key;
    }

    if (acvByMonth) {
      for (const [key, value] of Object.entries(acvByMonth)) {
        if (key in months) {
          months[key] = value;
        }
      }
    } else if (opportunities) {
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

    const chartData = Object.entries(months).map(([key, value]) => ({
      month: labelMap[key],
      acv: value,
    }));

    return { data: chartData, labelToKey: keyToLabel };
  }, [opportunities, acvByMonth]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = useCallback((barData: any) => {
    if (!acvDeals) return;
    const monthLabel = barData?.month || barData?.payload?.month;
    if (!monthLabel) return;
    const rawMonth = labelToKey[monthLabel];
    if (!rawMonth) return;
    const deals = acvDeals[rawMonth];
    if (deals && deals.length > 0) {
      setDrillDown({ month: monthLabel, deals });
    }
  }, [acvDeals, labelToKey]);

  return (
    <>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} className={acvDeals ? "cursor-pointer" : undefined}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} />
          <Tooltip formatter={(val) => fmtCurrency(Number(val))} />
          <Bar
            dataKey="acv"
            fill="#7c3aed"
            radius={[4, 4, 0, 0]}
            onClick={acvDeals ? handleBarClick : undefined}
            style={acvDeals ? { cursor: "pointer" } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>

      <DealDrilldownDrawer
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.month ? `${drillDown.month} — Closed Won` : ""}
        deals={drillDown?.deals || []}
      />
    </>
  );
}
