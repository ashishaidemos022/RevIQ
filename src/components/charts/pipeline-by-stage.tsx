"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Opportunity } from "@/types";

interface PipelineByStageChartProps {
  /** New grouped data: month → stage group → {count, acv} */
  pipelineByMonthAndGroup?: Record<string, Record<string, { count: number; acv: number }>>;
  /** Legacy flat data (fallback) */
  pipelineByStage?: Record<string, { count: number; acv: number }>;
  /** Raw opportunities fallback (used by pipeline page & PBM) */
  opportunities?: Opportunity[];
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

const GROUP_COLORS: Record<string, string> = {
  "SS0-SS2": "#7c3aed",           // Talkdesk purple
  "Qualified Pipeline": "#14b8a6", // Teal
};

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  return `${MONTH_LABELS[month] || month} '${year.slice(2)}`;
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
  pipelineByMonthAndGroup,
  pipelineByStage,
  opportunities,
}: PipelineByStageChartProps) {
  const { data, groups, isLegacy } = useMemo(() => {
    // Prefer the new grouped-by-month format
    if (pipelineByMonthAndGroup && Object.keys(pipelineByMonthAndGroup).length > 0) {
      const allGroups = new Set<string>();
      const months = Object.keys(pipelineByMonthAndGroup).sort();

      for (const monthData of Object.values(pipelineByMonthAndGroup)) {
        for (const group of Object.keys(monthData)) {
          allGroups.add(group);
        }
      }

      const chartData = months.map((month) => {
        const entry: Record<string, string | number> = { month: formatMonthLabel(month) };
        for (const group of allGroups) {
          entry[group] = pipelineByMonthAndGroup[month]?.[group]?.acv || 0;
        }
        return entry;
      });

      // Ensure consistent ordering: SS0-SS2 first, Qualified Pipeline second
      const orderedGroups = [...allGroups].sort((a, b) => {
        if (a === "SS0-SS2") return -1;
        if (b === "SS0-SS2") return 1;
        return a.localeCompare(b);
      });

      return { data: chartData, groups: orderedGroups, isLegacy: false };
    }

    // Fallback: legacy flat pipelineByStage
    if (pipelineByStage) {
      const chartData = Object.entries(pipelineByStage)
        .sort(([a], [b]) => {
          const ai = STAGE_ORDER.indexOf(a);
          const bi = STAGE_ORDER.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .map(([stage, val]) => ({ stage, acv: val.acv }));
      return { data: chartData, groups: ["acv"], isLegacy: true };
    }

    // Fallback: raw opportunities (pipeline page & PBM)
    if (opportunities) {
      const stageMap: Record<string, number> = {};
      opportunities
        .filter((o) => !o.is_closed_won && !o.is_closed_lost)
        .forEach((o) => {
          const stage = o.stage || "Other";
          stageMap[stage] = (stageMap[stage] || 0) + (o.acv || 0);
        });
      const chartData = Object.entries(stageMap)
        .sort(([a], [b]) => {
          const ai = STAGE_ORDER.indexOf(a);
          const bi = STAGE_ORDER.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .map(([stage, acv]) => ({ stage, acv }));
      return { data: chartData, groups: ["acv"], isLegacy: true };
    }

    return { data: [], groups: [], isLegacy: true };
  }, [pipelineByMonthAndGroup, pipelineByStage, opportunities]);

  const formatCurrency = (val: number) =>
    val >= 1000000
      ? `$${(val / 1000000).toFixed(1)}M`
      : val >= 1000
        ? `$${(val / 1000).toFixed(0)}K`
        : `$${val}`;

  if (data.length === 0) return null;

  const currencyTooltip = (val: unknown) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(val));

  // Legacy: horizontal bar chart by stage (pipeline page, PBM)
  if (isLegacy) {
    return (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
          <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={100} />
          <Tooltip formatter={currencyTooltip} />
          <Bar dataKey="acv" fill="#7c3aed" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // New: stacked vertical bar chart by close month with stage groups
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} width={70} />
        <Tooltip formatter={currencyTooltip} />
        <Legend />
        {groups.map((group) => (
          <Bar
            key={group}
            dataKey={group}
            stackId="pipeline"
            fill={GROUP_COLORS[group] || "#94a3b8"}
            radius={group === groups[groups.length - 1] ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
