"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PilotStageBadge } from "./pilot-stage-progress";

// ─── Types (matches /api/pilots/pipeline response) ──────

interface QuarterPipeline {
  acv: number;
  count: number;
  opps: Array<{ name: string; stage: string; acv: number; close_date: string }>;
}

interface PilotPipelineRow {
  pilot_id: string;
  pilot_name: string;
  pilot_stage: string;
  pilot_acv: number;
  pilot_close_date: string | null;
  pilot_start_date: string | null;
  pilot_end_date: string | null;
  pilot_status: string;
  pilot_implementation_stage: string | null;
  estimated_go_live: string | null;
  at_risk: boolean;
  account_name: string;
  ae_name: string;
  pipeline_by_quarter: Record<string, QuarterPipeline>;
  total_pipeline_acv: number;
}

interface PilotPipelineResponse {
  data: PilotPipelineRow[];
  quarters: string[];
}

// ─── Helpers ────────────────────────────────────────────

const DAY_MS = 1000 * 60 * 60 * 24;

function toMs(d: string): number {
  return new Date(d + "T00:00:00").getTime();
}

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

function formatDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateFull(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────

export function PilotGanttTimeline() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const [monthOffset, setMonthOffset] = useState(0);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (viewAsUser) p.set("viewAs", viewAsUser.user_id);
    return p.toString();
  }, [viewAsUser]);

  const { data: response, isLoading } = useQuery<PilotPipelineResponse>({
    queryKey: ["pilot-pipeline-linkage", params],
    queryFn: () =>
      apiFetch(`/api/pilots/pipeline${params ? `?${params}` : ""}`),
  });

  const rows = response?.data || [];

  // Only show pilots that have at least a start or close date
  const timelineRows = useMemo(() => {
    return rows.filter(
      (r) => r.pilot_start_date || r.pilot_close_date || r.estimated_go_live
    );
  }, [rows]);

  // ─── Timeline window: 6 months centered on today ──────
  const now = new Date();
  const nowMs = now.getTime();

  const windowStart = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset - 2, 1);
    return d.getTime();
  }, [monthOffset]);

  const windowEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset + 4, 0);
    return d.getTime();
  }, [monthOffset]);

  const windowDays = (windowEnd - windowStart) / DAY_MS;

  // Month labels for the header
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; startPct: number; widthPct: number }> = [];
    for (let i = -2; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + monthOffset + i, 1);
      const mStart = Math.max(d.getTime(), windowStart);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
      const mEndClamped = Math.min(mEnd, windowEnd);
      labels.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        startPct: ((mStart - windowStart) / (windowEnd - windowStart)) * 100,
        widthPct: ((mEndClamped - mStart) / (windowEnd - windowStart)) * 100,
      });
    }
    return labels;
  }, [monthOffset, windowStart, windowEnd]);

  // Today line position
  const todayPct = ((nowMs - windowStart) / (windowEnd - windowStart)) * 100;

  // Convert a date to percentage position in the window
  function dateToPct(dateStr: string): number {
    const ms = toMs(dateStr);
    return ((ms - windowStart) / (windowEnd - windowStart)) * 100;
  }

  // Clamp percentage to 0-100
  function clamp(pct: number): number {
    return Math.max(0, Math.min(100, pct));
  }

  // Extract all pipeline deals for a row as flat array
  function getDeals(row: PilotPipelineRow) {
    const deals: Array<{ name: string; acv: number; close_date: string; stage: string }> = [];
    for (const qData of Object.values(row.pipeline_by_quarter)) {
      deals.push(...qData.opps);
    }
    return deals.sort((a, b) => a.close_date.localeCompare(b.close_date));
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pilot Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (timelineRows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Pilot Timeline
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMonthOffset((o) => o - 2)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMonthOffset(0)}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMonthOffset((o) => o + 2)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-violet-500 inline-block" /> Pilot Duration
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Est. Go-Live
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Pipeline Deal
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Won Deal
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-0.5 h-3 bg-red-500 inline-block" /> Today
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Month header */}
            <div className="flex h-6 border-b border-border mb-1">
              <div className="w-[200px] shrink-0" />
              <div className="flex flex-1">
                {monthLabels.map((m, i) => (
                  <div
                    key={i}
                    className="border-l border-border/40 pl-1 text-[10px] text-muted-foreground flex items-center"
                    style={{ width: `${m.widthPct}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            {timelineRows.map((row) => {
              const deals = getDeals(row);
              const pilotStartPct = row.pilot_start_date
                ? clamp(dateToPct(row.pilot_start_date))
                : null;
              const pilotEndPct = row.pilot_end_date
                ? clamp(dateToPct(row.pilot_end_date))
                : row.estimated_go_live
                  ? clamp(dateToPct(row.estimated_go_live))
                  : null;
              const goLivePct = row.estimated_go_live
                ? clamp(dateToPct(row.estimated_go_live))
                : null;

              // Risk zone: red overlay between earliest deal and go-live
              let riskZone: { left: number; width: number } | null = null;
              if (row.at_risk && goLivePct !== null && deals.length > 0) {
                const earliestDealDate = deals[0]?.close_date;
                if (earliestDealDate) {
                  const dealPct = clamp(dateToPct(earliestDealDate));
                  if (dealPct < goLivePct) {
                    riskZone = { left: dealPct, width: Math.max(goLivePct - dealPct, 0.3) };
                  }
                }
              }

              return (
                <div
                  key={row.pilot_id}
                  className={cn(
                    "flex items-center h-10 border-b border-border/30 group",
                    row.at_risk && "bg-red-500/[0.03]"
                  )}
                >
                  {/* Label area */}
                  <div className="w-[200px] shrink-0 pr-2 flex items-center gap-1.5 overflow-hidden">
                    {row.at_risk && (
                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate leading-tight">
                        {row.account_name}
                      </p>
                      <p className="text-[9px] text-muted-foreground truncate leading-tight">
                        {row.ae_name}
                      </p>
                    </div>
                    {row.pilot_implementation_stage && (
                      <PilotStageBadge stage={row.pilot_implementation_stage} />
                    )}
                  </div>

                  {/* Chart area */}
                  <div className="flex-1 relative h-full">
                    {/* Month grid lines */}
                    {monthLabels.map((m, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full border-l border-border/20"
                        style={{ left: `${m.startPct}%` }}
                      />
                    ))}

                    {/* Today line */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div
                        className="absolute top-0 h-full w-px bg-red-500 z-10"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}

                    {/* Pilot duration bar */}
                    {pilotStartPct !== null && pilotEndPct !== null && (
                      <Tooltip>
                        <TooltipTrigger
                          className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm bg-violet-500/70 border border-violet-500 cursor-default z-[2]"
                          style={{
                            left: `${pilotStartPct}%`,
                            width: `${Math.max(pilotEndPct - pilotStartPct, 0.5)}%`,
                          }}
                        />
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-medium">{row.pilot_name}</p>
                          <p>
                            {row.pilot_start_date && formatDateFull(row.pilot_start_date)}
                            {" → "}
                            {row.pilot_end_date
                              ? formatDateFull(row.pilot_end_date)
                              : row.estimated_go_live
                                ? `~${formatDateFull(row.estimated_go_live)} (est.)`
                                : "TBD"}
                          </p>
                          <p>{fmtCurrency(row.pilot_acv)} pilot ACV</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Estimated go-live marker */}
                    {goLivePct !== null && goLivePct >= 0 && goLivePct <= 100 && (
                      <Tooltip>
                        <TooltipTrigger
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 cursor-default z-[3]",
                            row.at_risk
                              ? "bg-red-500 border-red-300"
                              : "bg-amber-500 border-amber-300"
                          )}
                          style={{ left: `${goLivePct}%` }}
                        />
                        <TooltipContent side="top" className="text-xs">
                          Est. Go-Live: {row.estimated_go_live && formatDateFull(row.estimated_go_live)}
                          {row.at_risk && (
                            <span className="block text-red-400">
                              Past quarter end — pipeline at risk
                            </span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Pipeline deal markers */}
                    {deals.map((deal, di) => {
                      if (!deal.close_date) return null;
                      const dealPct = clamp(dateToPct(deal.close_date));
                      if (dealPct <= 0 || dealPct >= 100) return null;

                      return (
                        <Tooltip key={di}>
                          <TooltipTrigger
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500 border border-blue-300 cursor-default z-[4]"
                            style={{ left: `${dealPct}%` }}
                          />
                          <TooltipContent side="top" className="text-xs max-w-[220px]">
                            <p className="font-medium truncate">{deal.name}</p>
                            <p>{fmtCurrency(deal.acv)} — {deal.stage}</p>
                            <p>Close: {formatDateFull(deal.close_date)}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}

                    {/* Risk zone: red overlay between earliest deal close and go-live */}
                    {riskZone && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-5 bg-red-500/10 border-y border-red-500/20 rounded-sm z-[1]"
                        style={{
                          left: `${riskZone.left}%`,
                          width: `${riskZone.width}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary footer */}
        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
          <span>{timelineRows.length} pilots shown</span>
          <span>
            {timelineRows.filter((r) => r.at_risk).length} at risk
          </span>
          <span>
            {shortCurrency(timelineRows.reduce((s, r) => s + r.total_pipeline_acv, 0))} downstream pipeline
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
