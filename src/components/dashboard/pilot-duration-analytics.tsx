"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Clock, Target, AlertTriangle, TrendingDown, TrendingUp, Minus } from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface PilotOpp {
  id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  sf_created_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  paid_pilot_start_date?: string | null;
  paid_pilot_end_date?: string | null;
  age: number | null;
  accounts?: { name: string } | null;
  [key: string]: unknown;
}

interface PilotDurationAnalyticsProps {
  pilots: PilotOpp[];
}

type PilotStatus = "Active" | "Converted" | "Expired" | "Lost";

// ─── Constants ──────────────────────────────────────────

const TARGET_DAYS = 60;
const AGING_BUCKETS = [
  { label: "0–30d", min: 0, max: 30, color: "#22c55e" },
  { label: "31–60d", min: 31, max: 60, color: "#3b82f6" },
  { label: "61–90d", min: 61, max: 90, color: "#f59e0b" },
  { label: "91–120d", min: 91, max: 120, color: "#f97316" },
  { label: "120d+", min: 121, max: Infinity, color: "#ef4444" },
];

// ─── Helpers ────────────────────────────────────────────

function getPilotStatus(opp: PilotOpp): PilotStatus {
  if (opp.is_closed_won) return "Converted";
  if (opp.is_closed_lost) return "Lost";
  if (opp.paid_pilot_end_date) {
    if (new Date(opp.paid_pilot_end_date) < new Date()) return "Expired";
  }
  return "Active";
}

function getPilotDuration(opp: PilotOpp): number | null {
  const start = (opp.paid_pilot_start_date as string) || opp.sf_created_date;
  if (!start) return opp.age;
  const startMs = new Date(start).getTime();
  const endMs = opp.paid_pilot_end_date
    ? new Date(opp.paid_pilot_end_date).getTime()
    : opp.close_date && (opp.is_closed_won || opp.is_closed_lost)
      ? new Date(opp.close_date).getTime()
      : Date.now();
  return Math.max(0, Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

const statusColors: Record<PilotStatus, string> = {
  Active: "#3b82f6",
  Converted: "#22c55e",
  Expired: "#ef4444",
  Lost: "#94a3b8",
};

// ─── Component ──────────────────────────────────────────

export function PilotDurationAnalytics({ pilots }: PilotDurationAnalyticsProps) {
  // Compute duration for each pilot
  const pilotsWithDuration = useMemo(() => {
    return pilots
      .map((p) => ({
        ...p,
        status: getPilotStatus(p),
        duration: getPilotDuration(p),
      }))
      .filter((p) => p.duration !== null) as Array<
      PilotOpp & { status: PilotStatus; duration: number }
    >;
  }, [pilots]);

  // ─── Aging bucket distribution ──────────────────────
  const agingData = useMemo(() => {
    return AGING_BUCKETS.map((bucket) => {
      const inBucket = pilotsWithDuration.filter(
        (p) => p.duration >= bucket.min && p.duration <= bucket.max
      );
      return {
        label: bucket.label,
        count: inBucket.length,
        color: bucket.color,
        pilots: inBucket,
      };
    });
  }, [pilotsWithDuration]);

  // ─── Duration by status ─────────────────────────────
  const durationByStatus = useMemo(() => {
    const statusGroups: Record<PilotStatus, number[]> = {
      Active: [],
      Converted: [],
      Expired: [],
      Lost: [],
    };
    for (const p of pilotsWithDuration) {
      statusGroups[p.status].push(p.duration);
    }
    return (Object.entries(statusGroups) as [PilotStatus, number[]][])
      .filter(([, durations]) => durations.length > 0)
      .map(([status, durations]) => ({
        status,
        count: durations.length,
        avg: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
        min: Math.min(...durations),
        max: Math.max(...durations),
        color: statusColors[status],
      }));
  }, [pilotsWithDuration]);

  // ─── Summary metrics ───────────────────────────────
  const summary = useMemo(() => {
    if (pilotsWithDuration.length === 0) {
      return { avg: 0, median: 0, overTarget: 0, overTargetPct: 0, total: 0 };
    }
    const durations = pilotsWithDuration.map((p) => p.duration).sort((a, b) => a - b);
    const avg = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 0
        ? Math.round((durations[mid - 1] + durations[mid]) / 2)
        : durations[mid];
    const overTarget = durations.filter((d) => d > TARGET_DAYS).length;
    const overTargetPct = Math.round((overTarget / durations.length) * 100);
    return { avg, median, overTarget, overTargetPct, total: durations.length };
  }, [pilotsWithDuration]);

  // ─── Status distribution for donut ──────────────────
  const statusDistribution = useMemo(() => {
    return durationByStatus.map((s) => ({
      name: s.status,
      value: s.count,
      fill: s.color,
    }));
  }, [durationByStatus]);

  // ─── Longest running active pilots ──────────────────
  const longestActive = useMemo(() => {
    return pilotsWithDuration
      .filter((p) => p.status === "Active")
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
  }, [pilotsWithDuration]);

  if (pilotsWithDuration.length === 0) {
    return null;
  }

  const gapDays = summary.avg - TARGET_DAYS;
  const gapDirection = gapDays > 0 ? "over" : gapDays < 0 ? "under" : "on";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Pilot Duration Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Avg Duration
            </p>
            <p className={cn(
              "text-lg font-bold mt-0.5 tabular-nums",
              summary.avg > TARGET_DAYS ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"
            )}>
              {summary.avg}d
            </p>
            <p className="text-[10px] text-muted-foreground">
              Target: {TARGET_DAYS}d
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Median Duration
            </p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">
              {summary.median}d
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Target vs Reality
            </p>
            <p className={cn(
              "text-lg font-bold mt-0.5 tabular-nums inline-flex items-center gap-1",
              gapDirection === "over"
                ? "text-red-600 dark:text-red-400"
                : gapDirection === "under"
                  ? "text-green-700 dark:text-green-400"
                  : "text-foreground"
            )}>
              {gapDirection === "over" && <TrendingUp className="h-4 w-4" />}
              {gapDirection === "under" && <TrendingDown className="h-4 w-4" />}
              {gapDirection === "on" && <Minus className="h-4 w-4" />}
              {gapDays > 0 ? `+${gapDays}d` : gapDays < 0 ? `${gapDays}d` : "On target"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              vs {TARGET_DAYS}d target
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Over Target
            </p>
            <p className={cn(
              "text-lg font-bold mt-0.5 tabular-nums",
              summary.overTargetPct > 50 ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}>
              {summary.overTarget}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {summary.overTargetPct}% of pilots
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Total Tracked
            </p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">
              {summary.total}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Aging Distribution Chart */}
          <Card className="border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Aging Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={agingData} barSize={32}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip
                    formatter={(val: any) => [`${val} pilots`, "Count"]}
                  />
                  <ReferenceLine y={0} stroke="transparent" />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {agingData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Duration by Status Chart */}
          <Card className="border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Avg Duration by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={durationByStatus} layout="vertical" barSize={20}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}d`}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip
                    formatter={(val: any, _name: any, props: any) => {
                      const p = props.payload;
                      return [
                        `${val}d avg (${p.count} pilots, ${p.min}d–${p.max}d range)`,
                        "Duration",
                      ];
                    }}
                  />
                  <ReferenceLine
                    x={TARGET_DAYS}
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    label={{
                      value: `${TARGET_DAYS}d target`,
                      position: "top",
                      fontSize: 10,
                      fill: "#7c3aed",
                    }}
                  />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                    {durationByStatus.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Distribution Donut + Longest Active */}
          <Card className="border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Status Breakdown & Longest Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {/* Mini donut */}
                <div className="w-[100px] h-[100px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={45}
                        dataKey="value"
                        strokeWidth={1}
                        stroke="var(--background)"
                      >
                        {statusDistribution.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <RechartsTooltip
                        formatter={(val: any, name: any) => [
                          `${val} pilots`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 justify-center">
                    {statusDistribution.map((s) => (
                      <span key={s.name} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: s.fill }}
                        />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Longest active pilots */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {longestActive.length > 0 ? (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Longest Active
                      </p>
                      {longestActive.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          {p.duration > TARGET_DAYS ? (
                            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          ) : (
                            <Target className="h-3 w-3 text-green-500 shrink-0" />
                          )}
                          <span className="truncate flex-1 text-muted-foreground">
                            {p.accounts?.name || p.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] h-4 tabular-nums",
                              p.duration > 90
                                ? "border-red-500/30 text-red-600 dark:text-red-400"
                                : p.duration > TARGET_DAYS
                                  ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                  : "border-green-500/30 text-green-700 dark:text-green-400"
                            )}
                          >
                            {p.duration}d
                          </Badge>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic mt-4">
                      No active pilots
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
