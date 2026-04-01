"use client";

import { useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
  /** AI ACV by month (YYYY-MM → amount) */
  cxaAcvByMonth?: Record<string, number>;
  /** CCaaS ACV by month (YYYY-MM → amount) */
  ccaasAcvByMonth?: Record<string, number>;
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

export function AcvByMonthChart({ opportunities, acvByMonth, cxaAcvByMonth, ccaasAcvByMonth, acvDeals }: AcvByMonthChartProps) {
  const [drillDown, setDrillDown] = useState<{
    month: string;
    deals: DrillDownDeal[];
  } | null>(null);

  const hasBreakdown = !!(cxaAcvByMonth && ccaasAcvByMonth);

  // Build label → raw YYYY-MM mapping for reverse lookup on click
  const { data, labelToKey } = useMemo(() => {
    const months: Record<string, number> = {};
    const cxaMonths: Record<string, number> = {};
    const ccaasMonths: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const keyToLabel: Record<string, string> = {};
    const now = new Date();

    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months[key] = 0;
      cxaMonths[key] = 0;
      ccaasMonths[key] = 0;
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

    if (cxaAcvByMonth) {
      for (const [key, value] of Object.entries(cxaAcvByMonth)) {
        if (key in cxaMonths) cxaMonths[key] = value;
      }
    }
    if (ccaasAcvByMonth) {
      for (const [key, value] of Object.entries(ccaasAcvByMonth)) {
        if (key in ccaasMonths) ccaasMonths[key] = value;
      }
    }

    const chartData = Object.entries(months).map(([key]) => ({
      month: labelMap[key],
      acv: months[key],
      cxaAcv: cxaMonths[key],
      ccaasAcv: ccaasMonths[key],
    }));

    return { data: chartData, labelToKey: keyToLabel };
  }, [opportunities, acvByMonth, cxaAcvByMonth, ccaasAcvByMonth]);

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
          <Tooltip
            formatter={(val, name) => {
              const label = name === "cxaAcv" ? "AI ACV" : name === "ccaasAcv" ? "CCaaS ACV" : "ACV";
              return [fmtCurrency(Number(val)), label];
            }}
          />
          {hasBreakdown ? (
            <>
              <Legend
                formatter={(value: string) =>
                  value === "ccaasAcv" ? "CCaaS ACV" : value === "cxaAcv" ? "AI ACV" : "ACV"
                }
              />
              <Bar
                dataKey="ccaasAcv"
                stackId="acv"
                fill="#7c3aed"
                onClick={acvDeals ? handleBarClick : undefined}
                style={acvDeals ? { cursor: "pointer" } : undefined}
              />
              <Bar
                dataKey="cxaAcv"
                stackId="acv"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                onClick={acvDeals ? handleBarClick : undefined}
                style={acvDeals ? { cursor: "pointer" } : undefined}
              />
            </>
          ) : (
            <Bar
              dataKey="acv"
              fill="#7c3aed"
              radius={[4, 4, 0, 0]}
              onClick={acvDeals ? handleBarClick : undefined}
              style={acvDeals ? { cursor: "pointer" } : undefined}
            />
          )}
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
