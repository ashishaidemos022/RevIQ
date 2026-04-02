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
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  TrendingUp,
  XCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface DealInfo {
  id: string;
  name: string;
  stage: string;
  acv: number;
  close_date: string | null;
}

interface ConversionRow {
  pilot_id: string;
  pilot_sf_id: string;
  pilot_name: string;
  pilot_stage: string;
  pilot_acv: number;
  pilot_close_date: string | null;
  pilot_start_date: string | null;
  pilot_end_date: string | null;
  pilot_duration_days: number | null;
  account_id: string;
  account_name: string;
  ae_name: string;
  conversion_status: string;
  conversion_acv: number;
  pending_acv: number;
  uplift_multiplier: number | null;
  avg_conversion_days: number | null;
  won_deals: DealInfo[];
  open_deals: DealInfo[];
  lost_deals: DealInfo[];
}

interface ConversionKpis {
  total_booked_pilots: number;
  converted_count: number;
  conversion_rate: number;
  total_conversion_acv: number;
  total_pilot_acv: number;
  avg_uplift_multiplier: number;
  avg_days_to_convert: number | null;
  total_pending_acv: number;
}

interface ConversionResponse {
  data: ConversionRow[];
  kpis: ConversionKpis;
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

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function statusConfig(status: string) {
  switch (status) {
    case "Converted":
      return {
        color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
        icon: CheckCircle2,
      };
    case "Pending":
      return {
        color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
        icon: Clock,
      };
    case "Lost":
      return {
        color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
        icon: XCircle,
      };
    default:
      return {
        color: "bg-muted text-muted-foreground",
        icon: Clock,
      };
  }
}

// ─── Component ──────────────────────────────────────────

export function PilotConversionTracker() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (viewAsUser) p.set("viewAs", viewAsUser.user_id);
    return p.toString();
  }, [viewAsUser]);

  const { data: response, isLoading } = useQuery<ConversionResponse>({
    queryKey: ["pilot-conversions", params],
    queryFn: () =>
      apiFetch(`/api/pilots/conversions${params ? `?${params}` : ""}`),
  });

  const rows = response?.data || [];
  const kpis = response?.kpis;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pilot Conversion Tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
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
            <GitBranch className="h-4 w-4" />
            Pilot Conversion Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No booked pilots to track conversions for
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Pilot Conversion Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KPI Strip */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MiniKpi
              label="Booked Pilots"
              value={kpis.total_booked_pilots.toString()}
            />
            <MiniKpi
              label="Converted"
              value={kpis.converted_count.toString()}
              sub={`${kpis.conversion_rate.toFixed(0)}% rate`}
              accent="green"
            />
            <MiniKpi
              label="Conversion ACV"
              value={shortCurrency(kpis.total_conversion_acv)}
              accent="green"
            />
            <MiniKpi
              label="Avg Uplift"
              value={kpis.avg_uplift_multiplier > 0 ? `${kpis.avg_uplift_multiplier.toFixed(1)}x` : "—"}
              sub={kpis.avg_uplift_multiplier > 0 ? `${shortCurrency(kpis.total_pilot_acv)} → ${shortCurrency(kpis.total_conversion_acv)}` : undefined}
              accent="blue"
            />
            <MiniKpi
              label="Avg Days to Convert"
              value={kpis.avg_days_to_convert !== null ? `${kpis.avg_days_to_convert}d` : "—"}
            />
            <MiniKpi
              label="Pending Pipeline"
              value={shortCurrency(kpis.total_pending_acv)}
              accent="amber"
            />
          </div>
        )}

        {/* Conversion Funnel Visual */}
        {kpis && (
          <ConversionFunnel
            booked={kpis.total_booked_pilots}
            converted={kpis.converted_count}
            pending={rows.filter(r => r.conversion_status === "Pending").length}
            noPipeline={rows.filter(r => r.conversion_status === "No Pipeline").length}
            lost={rows.filter(r => r.conversion_status === "Lost").length}
          />
        )}

        {/* Conversion Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20px]" />
                <TableHead>Account</TableHead>
                <TableHead>Pilot</TableHead>
                <TableHead className="text-right">Pilot ACV</TableHead>
                <TableHead className="text-center">
                  <span className="sr-only">Flow</span>
                </TableHead>
                <TableHead className="text-right">Conversion ACV</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Uplift</TableHead>
                <TableHead className="text-right">Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isExpanded = expandedRow === row.pilot_id;
                const cfg = statusConfig(row.conversion_status);
                const StatusIcon = cfg.icon;

                return (
                  <Fragment key={row.pilot_id}>
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors",
                        row.conversion_status === "Converted" && "bg-green-500/[0.03]",
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
                          <span className="font-medium text-sm">{row.account_name}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{row.ae_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs line-clamp-1 max-w-[200px]">{row.pilot_name}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {fmtCurrency(row.pilot_acv)}
                      </TableCell>
                      <TableCell className="text-center px-1">
                        <ArrowRight className={cn(
                          "h-4 w-4 mx-auto",
                          row.conversion_status === "Converted"
                            ? "text-green-500"
                            : "text-muted-foreground/40"
                        )} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.conversion_acv > 0 ? (
                          <span className="font-semibold text-green-700 dark:text-green-400">
                            {fmtCurrency(row.conversion_acv)}
                          </span>
                        ) : row.pending_acv > 0 ? (
                          <span className="text-muted-foreground">
                            {fmtCurrency(row.pending_acv)}
                            <span className="text-[10px] ml-1">(pending)</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] gap-1", cfg.color)}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {row.conversion_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.uplift_multiplier !== null ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                            <TrendingUp className="h-3 w-3" />
                            {row.uplift_multiplier.toFixed(1)}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {row.avg_conversion_days !== null ? `${row.avg_conversion_days}d` : "—"}
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={9} className="py-3 px-6">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Pilot Timeline */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                Pilot Timeline
                              </p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                <span className="text-muted-foreground">Pilot Close</span>
                                <span>{formatDate(row.pilot_close_date)}</span>
                                <span className="text-muted-foreground">Pilot Start</span>
                                <span>{formatDate(row.pilot_start_date)}</span>
                                <span className="text-muted-foreground">Pilot End</span>
                                <span>{formatDate(row.pilot_end_date)}</span>
                                <span className="text-muted-foreground">Duration</span>
                                <span>
                                  {row.pilot_duration_days !== null
                                    ? `${row.pilot_duration_days} days`
                                    : "—"}
                                </span>
                              </div>
                            </div>

                            {/* Won Deals */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                Converted Deals ({row.won_deals.length})
                              </p>
                              {row.won_deals.length > 0 ? (
                                <div className="space-y-1.5">
                                  {row.won_deals.map((d) => (
                                    <div
                                      key={d.id}
                                      className="flex items-center gap-2 text-xs p-2 rounded bg-green-500/5 border border-green-500/10"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                      <span className="truncate flex-1">{d.name}</span>
                                      <span className="tabular-nums font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">
                                        {fmtCurrency(d.acv)}
                                      </span>
                                      <span className="text-muted-foreground whitespace-nowrap">
                                        {formatDate(d.close_date)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">
                                  No converted deals yet
                                </p>
                              )}
                            </div>

                            {/* Open / Pending Deals */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                Pending Pipeline ({row.open_deals.length})
                              </p>
                              {row.open_deals.length > 0 ? (
                                <div className="space-y-1.5">
                                  {row.open_deals.map((d) => (
                                    <div
                                      key={d.id}
                                      className="flex items-center gap-2 text-xs p-2 rounded bg-blue-500/5 border border-blue-500/10"
                                    >
                                      <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                      <span className="truncate flex-1">{d.name}</span>
                                      <Badge variant="secondary" className="text-[9px] h-4">
                                        {d.stage}
                                      </Badge>
                                      <span className="tabular-nums whitespace-nowrap">
                                        {fmtCurrency(d.acv)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">
                                  No pending pipeline
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

// ─── Sub-components ─────────────────────────────────────

function MiniKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "blue" | "amber";
}) {
  const accentClass =
    accent === "green"
      ? "text-green-700 dark:text-green-400"
      : accent === "blue"
        ? "text-blue-700 dark:text-blue-400"
        : accent === "amber"
          ? "text-amber-700 dark:text-amber-400"
          : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className={cn("text-lg font-bold mt-0.5 tabular-nums", accentClass)}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function ConversionFunnel({
  booked,
  converted,
  pending,
  noPipeline,
  lost,
}: {
  booked: number;
  converted: number;
  pending: number;
  noPipeline: number;
  lost: number;
}) {
  const stages = [
    { label: "Booked", count: booked, color: "bg-slate-500", textColor: "text-slate-700 dark:text-slate-300" },
    { label: "Converted", count: converted, color: "bg-green-500", textColor: "text-green-700 dark:text-green-400" },
    { label: "Pending", count: pending, color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400" },
    { label: "No Pipeline", count: noPipeline, color: "bg-slate-300 dark:bg-slate-700", textColor: "text-muted-foreground" },
    { label: "Lost", count: lost, color: "bg-red-500", textColor: "text-red-700 dark:text-red-400" },
  ];

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Conversion Funnel
      </p>
      <div className="flex items-end gap-2 h-20">
        {stages.map((stage) => {
          const height = Math.max((stage.count / maxCount) * 100, 8);
          return (
            <div
              key={stage.label}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className={cn("text-xs font-bold tabular-nums", stage.textColor)}>
                {stage.count}
              </span>
              <div
                className={cn("w-full rounded-t transition-all", stage.color)}
                style={{ height: `${height}%`, minHeight: "4px" }}
              />
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
