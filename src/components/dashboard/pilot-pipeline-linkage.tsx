"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { PilotStageProgress } from "./pilot-stage-progress";

// ─── Types ──────────────────────────────────────────────

interface QuarterPipeline {
  acv: number;
  count: number;
  opps: Array<{ name: string; stage: string; acv: number; close_date: string }>;
}

interface PilotPipelineRow {
  pilot_id: string;
  pilot_name: string;
  pilot_sf_id: string;
  pilot_stage: string;
  pilot_acv: number;
  pilot_close_date: string | null;
  pilot_start_date: string | null;
  pilot_end_date: string | null;
  pilot_status: string;
  pilot_implementation_stage: string | null;
  estimated_go_live: string | null;
  at_risk: boolean;
  account_id: string;
  account_name: string;
  account_region: string | null;
  ae_name: string;
  pipeline_by_quarter: Record<string, QuarterPipeline>;
  total_pipeline_acv: number;
}

interface PilotPipelineResponse {
  data: PilotPipelineRow[];
  quarters: string[];
}

// ─── Helpers ────────────────────────────────────────────

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

function statusColor(status: string) {
  switch (status) {
    case "Booked": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20";
    case "In Funnel": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "Converted": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "Expired": return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function daysFromNow(d: string | null): number | null {
  if (!d) return null;
  const diff = new Date(d + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Component ──────────────────────────────────────────

export function PilotPipelineLinkage() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
  const quarters = response?.quarters || [];

  // Summary KPIs
  const summary = useMemo(() => {
    const atRiskCount = rows.filter((r) => r.at_risk).length;
    const totalPipeline = rows.reduce((s, r) => s + r.total_pipeline_acv, 0);
    const pilotsWithPipeline = rows.filter((r) => r.total_pipeline_acv > 0).length;
    const atRiskAcv = rows
      .filter((r) => r.at_risk)
      .reduce((s, r) => s + r.total_pipeline_acv, 0);
    return { atRiskCount, totalPipeline, pilotsWithPipeline, atRiskAcv };
  }, [rows]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pilot → Pipeline Linkage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Pilot → Pipeline Linkage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No pilot accounts with open pipeline found
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Pilot → Pipeline Linkage
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {summary.pilotsWithPipeline} accounts with pipeline
            </span>
            <span className="font-semibold">
              {shortCurrency(summary.totalPipeline)} total
            </span>
            {summary.atRiskCount > 0 && (
              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/15 gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                {summary.atRiskCount} at risk ({shortCurrency(summary.atRiskAcv)})
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20px]" />
                <TableHead>Account</TableHead>
                <TableHead>Pilot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pilot ACV</TableHead>
                <TableHead>Est. Go-Live</TableHead>
                {quarters.map((q) => (
                  <TableHead key={q} className="text-right whitespace-nowrap">
                    {q}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total Pipeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isExpanded = expandedRow === row.pilot_id;
                const goLiveDays = daysFromNow(row.estimated_go_live);

                return (
                  <Fragment key={row.pilot_id}>
                    {/* Main row */}
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors",
                        row.at_risk && "bg-red-500/5",
                        isExpanded && "bg-muted/50"
                      )}
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : row.pilot_id)
                      }
                    >
                      <TableCell className="w-[20px] pr-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">
                            {row.account_name}
                          </span>
                          {row.account_region && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {row.account_region}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {row.ae_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs line-clamp-1 max-w-[180px]">
                          {row.pilot_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", statusColor(row.pilot_status))}
                        >
                          {row.pilot_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {fmtCurrency(row.pilot_acv)}
                      </TableCell>
                      <TableCell>
                        {row.estimated_go_live ? (
                          <Tooltip>
                            <TooltipTrigger
                              className={cn(
                                "text-xs tabular-nums cursor-default",
                                row.at_risk
                                  ? "text-red-600 dark:text-red-400 font-semibold"
                                  : "text-muted-foreground"
                              )}
                            >
                              {formatDate(row.estimated_go_live)}
                              {row.at_risk && (
                                <AlertTriangle className="inline h-3 w-3 ml-1 -mt-0.5" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {goLiveDays !== null && goLiveDays > 0
                                ? `${goLiveDays} days from now`
                                : goLiveDays !== null && goLiveDays <= 0
                                  ? `${Math.abs(goLiveDays)} days overdue`
                                  : "Estimated based on pilot close + 90 days"}
                              {row.at_risk && (
                                <span className="block text-red-400 mt-0.5">
                                  Go-live extends past current quarter — pipeline at risk
                                </span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {quarters.map((q) => {
                        const qData = row.pipeline_by_quarter[q];
                        const acv = qData?.acv || 0;
                        const count = qData?.count || 0;
                        return (
                          <TableCell key={q} className="text-right tabular-nums">
                            {acv > 0 ? (
                              <Tooltip>
                                <TooltipTrigger className="text-sm font-medium cursor-default">
                                  {shortCurrency(acv)}
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    ({count})
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[240px]">
                                  <div className="space-y-1">
                                    {qData.opps.map((o, i) => (
                                      <div key={i} className="flex justify-between gap-3">
                                        <span className="truncate">{o.name}</span>
                                        <span className="tabular-nums whitespace-nowrap">
                                          {fmtCurrency(o.acv)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums">
                        <span className={cn(
                          "text-sm font-semibold",
                          row.total_pipeline_acv > 0 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {row.total_pipeline_acv > 0
                            ? shortCurrency(row.total_pipeline_acv)
                            : "—"}
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7 + quarters.length} className="py-3 px-6">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Pilot details */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                Pilot Details
                              </p>
                              {row.pilot_implementation_stage && (
                                <PilotStageProgress stage={row.pilot_implementation_stage} className="mb-2" />
                              )}
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                <span className="text-muted-foreground">Sales Stage</span>
                                <span>{row.pilot_stage}</span>
                                <span className="text-muted-foreground">Close Date</span>
                                <span>{formatDate(row.pilot_close_date)}</span>
                                <span className="text-muted-foreground">Pilot Start</span>
                                <span>{formatDate(row.pilot_start_date)}</span>
                                <span className="text-muted-foreground">Pilot End</span>
                                <span>{formatDate(row.pilot_end_date)}</span>
                                <span className="text-muted-foreground">Est. Go-Live</span>
                                <span className={cn(row.at_risk && "text-red-600 dark:text-red-400 font-semibold")}>
                                  {formatDate(row.estimated_go_live)}
                                  {goLiveDays !== null && (
                                    <span className="text-muted-foreground ml-1">
                                      ({goLiveDays > 0 ? `in ${goLiveDays}d` : `${Math.abs(goLiveDays)}d overdue`})
                                    </span>
                                  )}
                                </span>
                              </div>
                              {row.at_risk && (
                                <div className="flex items-start gap-2 mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-700 dark:text-red-400">
                                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  <span>
                                    Pilot go-live is estimated past current quarter end.
                                    Pipeline in the current quarter ({shortCurrency(
                                      row.pipeline_by_quarter[quarters[0]]?.acv || 0
                                    )}) may not close on schedule.
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Pipeline breakdown */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                Downstream Pipeline
                              </p>
                              {Object.entries(row.pipeline_by_quarter).map(
                                ([qLabel, qData]) => {
                                  if (qData.count === 0) return null;
                                  return (
                                    <div key={qLabel} className="space-y-1">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium">{qLabel}</span>
                                        <span className="tabular-nums font-semibold">
                                          {fmtCurrency(qData.acv)} ({qData.count} deal{qData.count !== 1 ? "s" : ""})
                                        </span>
                                      </div>
                                      <div className="space-y-0.5">
                                        {qData.opps.map((o, i) => (
                                          <div
                                            key={i}
                                            className="flex items-center gap-2 text-[11px] text-muted-foreground pl-2"
                                          >
                                            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                            <span className="truncate flex-1">
                                              {o.name}
                                            </span>
                                            <Badge
                                              variant="secondary"
                                              className="text-[9px] h-4"
                                            >
                                              {o.stage}
                                            </Badge>
                                            <span className="tabular-nums whitespace-nowrap">
                                              {fmtCurrency(o.acv)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                              )}
                              {row.total_pipeline_acv === 0 && (
                                <p className="text-xs text-muted-foreground italic">
                                  No open pipeline on this account
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
