"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  XCircle,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgingSummary } from "@/lib/deal-velocity";

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

interface StageAgingAlertsProps {
  summary: AgingSummary;
  onDealClick?: (dealId: string) => void;
  onConfigureThresholds?: () => void;
  isCustomized?: boolean;
}

function AgingBadge({ severity }: { severity: "warning" | "critical" }) {
  return severity === "critical" ? (
    <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/15 gap-1">
      <XCircle className="h-3 w-3" />
      Critical
    </Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15 gap-1">
      <AlertTriangle className="h-3 w-3" />
      Warning
    </Badge>
  );
}

export function StageAgingAlerts({ summary, onDealClick, onConfigureThresholds, isCustomized }: StageAgingAlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const totalAlerts = summary.criticalCount + summary.warningCount;

  if (totalAlerts === 0) return null;

  const hasCritical = summary.criticalCount > 0;
  const displayDeals = expanded ? summary.deals : summary.deals.slice(0, 5);

  return (
    <Card
      className={cn(
        "border-l-4",
        hasCritical ? "border-l-red-500" : "border-l-amber-500"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Deal Velocity & Stage Aging Alerts
          </CardTitle>
          <div className="flex items-center gap-3">
            {summary.criticalCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-semibold tabular-nums">
                  {summary.criticalCount}
                </span>
                <span className="text-muted-foreground">
                  critical ({fmtCurrency(summary.criticalAcv)})
                </span>
              </div>
            )}
            {summary.warningCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                  {summary.warningCount}
                </span>
                <span className="text-muted-foreground">
                  warning ({fmtCurrency(summary.warningAcv)})
                </span>
              </div>
            )}
            {onConfigureThresholds && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onConfigureThresholds}
                title="Configure aging thresholds"
              >
                <Settings2 className={cn("h-3.5 w-3.5", isCustomized ? "text-blue-500" : "text-muted-foreground")} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/80 border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">
                  Severity
                </th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">
                  Deal
                </th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">
                  Account
                </th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">
                  Owner
                </th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">
                  Stage
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">
                  ACV
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">
                  Days in Stage
                </th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">
                  Threshold
                </th>
              </tr>
            </thead>
            <tbody>
              {displayDeals.map((deal, i) => (
                <tr
                  key={deal.id}
                  className={cn(
                    "border-b last:border-0 transition-colors",
                    deal.severity === "critical"
                      ? "bg-red-500/[0.03] hover:bg-red-500/[0.06]"
                      : "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]",
                    onDealClick && "cursor-pointer"
                  )}
                  onClick={() => onDealClick?.(deal.id)}
                >
                  <td className="py-2 px-3">
                    <AgingBadge severity={deal.severity as "warning" | "critical"} />
                  </td>
                  <td className="py-2 px-3 font-medium max-w-48 truncate" title={deal.name}>
                    {deal.name}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground max-w-36 truncate" title={deal.accountName}>
                    {deal.accountName}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground" title={deal.ownerName}>
                    {deal.ownerName}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="secondary" className="text-xs">
                      {deal.stage}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                    {fmtCurrency(deal.acv)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    <span
                      className={cn(
                        "font-semibold",
                        deal.severity === "critical"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {deal.daysInStage}d
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground tabular-nums text-xs">
                    {deal.severity === "critical"
                      ? `>${deal.threshold.critical}d`
                      : `>${deal.threshold.warning}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalAlerts > 5 && (
          <div className="flex justify-center mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Show all {totalAlerts} alerts
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Inline aging indicator for use in table cells */
export function AgingIndicator({
  days,
  stage,
  severity,
}: {
  days: number | null | undefined;
  stage: string;
  severity: "healthy" | "warning" | "critical";
}) {
  if (days == null || severity === "healthy") {
    return <span className="text-muted-foreground tabular-nums">{days != null ? `${days}d` : "—"}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        severity === "critical"
          ? "text-red-600 dark:text-red-400"
          : "text-amber-600 dark:text-amber-400"
      )}
    >
      {severity === "critical" ? (
        <XCircle className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {days}d
    </span>
  );
}
