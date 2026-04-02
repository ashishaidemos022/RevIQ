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
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldAlert,
  Timer,
  XOctagon,
  Zap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

type RiskType = "go_live_past_quarter" | "early_stage" | "overdue" | "stalled";
type Severity = "critical" | "high" | "medium";

interface AffectedDeal {
  name: string;
  acv: number;
  close_date: string | null;
  stage: string;
}

interface RiskEntry {
  risk_type: RiskType;
  severity: Severity;
  reason: string;
  pilot_id: string;
  pilot_name: string;
  pilot_stage: string;
  pilot_acv: number;
  pilot_close_date: string | null;
  pilot_start_date: string | null;
  pilot_end_date: string | null;
  estimated_go_live: string | null;
  pilot_age_days: number | null;
  account_id: string;
  account_name: string;
  ae_name: string;
  affected_pipeline_acv: number;
  affected_deals: AffectedDeal[];
}

interface RiskSummary {
  total_risks: number;
  total_at_risk_acv: number;
  by_type: Record<string, { count: number; acv: number }>;
}

interface RiskResponse {
  data: RiskEntry[];
  summary: RiskSummary;
}

// ─── Config ─────────────────────────────────────────────

const RISK_CONFIG: Record<
  RiskType,
  { label: string; icon: typeof AlertTriangle; color: string; bgColor: string }
> = {
  overdue: {
    label: "Overdue",
    icon: XOctagon,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  go_live_past_quarter: {
    label: "Go-Live Past Quarter",
    icon: Timer,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  early_stage: {
    label: "Early Stage",
    icon: Zap,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
  },
  stalled: {
    label: "Stalled",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; border: string }> = {
  critical: {
    label: "Critical",
    dot: "bg-red-500",
    border: "border-l-red-500",
  },
  high: {
    label: "High",
    dot: "bg-orange-500",
    border: "border-l-orange-500",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
  },
};

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

// ─── Component ──────────────────────────────────────────

export function PilotRiskPanel() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<RiskType | "all">("all");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (viewAsUser) p.set("viewAs", viewAsUser.user_id);
    return p.toString();
  }, [viewAsUser]);

  const { data: response, isLoading } = useQuery<RiskResponse>({
    queryKey: ["pilot-at-risk", params],
    queryFn: () =>
      apiFetch(`/api/pilots/at-risk${params ? `?${params}` : ""}`),
  });

  const allRisks = response?.data || [];
  const summary = response?.summary;

  const filteredRisks = useMemo(() => {
    if (filterType === "all") return allRisks;
    return allRisks.filter((r) => r.risk_type === filterType);
  }, [allRisks, filterType]);

  // Don't render anything if no risks
  if (!isLoading && allRisks.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Pipeline at Risk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-500/20 bg-red-500/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Pipeline at Risk
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {summary?.total_risks} risk{summary?.total_risks !== 1 ? "s" : ""}
            </span>
            <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/15 text-[10px] font-bold tabular-nums">
              {shortCurrency(summary?.total_at_risk_acv || 0)} at risk
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk type filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All"
            count={allRisks.length}
            active={filterType === "all"}
            onClick={() => setFilterType("all")}
          />
          {(Object.entries(RISK_CONFIG) as [RiskType, typeof RISK_CONFIG[RiskType]][]).map(
            ([type, cfg]) => {
              const typeData = summary?.by_type[type];
              if (!typeData) return null;
              return (
                <FilterChip
                  key={type}
                  label={cfg.label}
                  count={typeData.count}
                  acv={typeData.acv}
                  active={filterType === type}
                  onClick={() => setFilterType(type)}
                  className={filterType === type ? cfg.bgColor : undefined}
                />
              );
            }
          )}
        </div>

        {/* Risk table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20px]" />
                <TableHead className="w-[80px]">Severity</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Pilot Stage</TableHead>
                <TableHead className="text-right">At-Risk ACV</TableHead>
                <TableHead className="text-right">Deals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRisks.map((risk) => {
                const isExpanded = expandedRow === risk.pilot_id;
                const riskCfg = RISK_CONFIG[risk.risk_type];
                const sevCfg = SEVERITY_CONFIG[risk.severity];
                const RiskIcon = riskCfg.icon;

                return (
                  <Fragment key={risk.pilot_id}>
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors border-l-2",
                        sevCfg.border,
                        isExpanded && "bg-muted/50"
                      )}
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : risk.pilot_id)
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
                        <div className="flex items-center gap-1.5">
                          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", sevCfg.dot)} />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">
                            {sevCfg.label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{risk.account_name}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{risk.ae_name}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <RiskIcon className={cn("h-3.5 w-3.5 shrink-0", riskCfg.color)} />
                          <Badge variant="outline" className={cn("text-[10px]", riskCfg.bgColor)}>
                            {riskCfg.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {risk.pilot_stage}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                          {fmtCurrency(risk.affected_pipeline_acv)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {risk.affected_deals.length}
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30 border-l-2 border-l-transparent">
                        <TableCell colSpan={7} className="py-3 px-6">
                          <div className="space-y-3">
                            {/* Risk reason */}
                            <div className={cn(
                              "flex items-start gap-2 p-3 rounded-md border text-xs",
                              riskCfg.bgColor,
                              riskCfg.color
                            )}>
                              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>{risk.reason}</span>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Pilot info */}
                              <div className="space-y-2">
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                  Pilot Details
                                </p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                  <span className="text-muted-foreground">Pilot</span>
                                  <span className="truncate">{risk.pilot_name}</span>
                                  <span className="text-muted-foreground">Pilot ACV</span>
                                  <span className="tabular-nums">{fmtCurrency(risk.pilot_acv)}</span>
                                  <span className="text-muted-foreground">Close Date</span>
                                  <span>{formatDate(risk.pilot_close_date)}</span>
                                  <span className="text-muted-foreground">Pilot Start</span>
                                  <span>{formatDate(risk.pilot_start_date)}</span>
                                  <span className="text-muted-foreground">Pilot End</span>
                                  <span>{formatDate(risk.pilot_end_date)}</span>
                                  {risk.estimated_go_live && (
                                    <>
                                      <span className="text-muted-foreground">Est. Go-Live</span>
                                      <span className="font-semibold">{formatDate(risk.estimated_go_live)}</span>
                                    </>
                                  )}
                                  {risk.pilot_age_days !== null && (
                                    <>
                                      <span className="text-muted-foreground">Age</span>
                                      <span className={cn(
                                        "tabular-nums",
                                        risk.pilot_age_days > 90 && "text-red-600 dark:text-red-400 font-semibold"
                                      )}>
                                        {risk.pilot_age_days}d
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Affected deals */}
                              <div className="space-y-2">
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                  Affected Pipeline ({risk.affected_deals.length} deal{risk.affected_deals.length !== 1 ? "s" : ""})
                                </p>
                                <div className="space-y-1.5">
                                  {risk.affected_deals.map((deal, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 text-xs p-2 rounded bg-red-500/5 border border-red-500/10"
                                    >
                                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                                      <span className="truncate flex-1">{deal.name}</span>
                                      <Badge variant="secondary" className="text-[9px] h-4">
                                        {deal.stage}
                                      </Badge>
                                      <span className="text-muted-foreground whitespace-nowrap text-[11px]">
                                        {formatDate(deal.close_date)}
                                      </span>
                                      <span className="tabular-nums font-semibold whitespace-nowrap text-red-600 dark:text-red-400">
                                        {fmtCurrency(deal.acv)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
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

function FilterChip({
  label,
  count,
  acv,
  active,
  onClick,
  className,
}: {
  label: string;
  count: number;
  acv?: number;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors",
        active
          ? className || "bg-foreground/10 border-foreground/20 text-foreground"
          : "bg-transparent border-border text-muted-foreground hover:bg-muted/50"
      )}
    >
      {label}
      <span className="tabular-nums">{count}</span>
      {acv !== undefined && active && (
        <span className="text-[10px] text-muted-foreground">
          ({shortCurrency(acv)})
        </span>
      )}
    </button>
  );
}
