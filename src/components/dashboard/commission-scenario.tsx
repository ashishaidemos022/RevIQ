"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useOpportunities } from "@/hooks/use-opportunities";
import { apiFetch } from "@/lib/api";
import {
  getCurrentFiscalPeriod,
  getFiscalYear,
  getFiscalQuarter,
  getQuarterEndDate,
} from "@/lib/fiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Target,
} from "lucide-react";
import type { Opportunity } from "@/types";

// ─── Types ──────────────────────────────────────────────

type OppWithRelations = Opportunity & {
  accounts?: { id: string; name: string };
  users?: { id: string; full_name: string };
};

interface QuarterBucket {
  label: string;
  fy: number;
  fq: number;
  deals: OppWithRelations[];
  selectedAcv: number;
  selectedCount: number;
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

const STORAGE_KEY = "revenueiq-commission-rate";

function loadRate(): number {
  if (typeof window === "undefined") return 8;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseFloat(raw) : 8;
  } catch {
    return 8;
  }
}

function saveRate(rate: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(rate));
}

// ─── Component ──────────────────────────────────────────

export function CommissionScenario() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [commissionRate, setCommissionRate] = useState<number>(loadRate);
  const [expandedQuarter, setExpandedQuarter] = useState<string | null>(
    `Q${fiscalQuarter} FY${fiscalYear}`
  );

  // Fetch open pipeline deals (next 4 quarters)
  const cutoffDate = useMemo(() => {
    let eq = fiscalQuarter + 3;
    let efy = fiscalYear;
    if (eq > 4) { eq -= 4; efy += 1; }
    return getQuarterEndDate(efy, eq).toISOString().split("T")[0];
  }, [fiscalYear, fiscalQuarter]);

  const { data: oppsData, isLoading: oppsLoading } = useOpportunities({
    status: "open",
    close_date_lte: cutoffDate,
    sort_by: "acv",
    sort_asc: "false",
    viewAs: viewAsUser?.user_id,
    limit: 200,
  });

  // Fetch current ACV closed and quota
  const viewAsParam = viewAsUser ? `?viewAs=${viewAsUser.user_id}` : "";
  const { data: kpisData } = useQuery({
    queryKey: ["commission-scenario-kpis", viewAsUser?.user_id],
    queryFn: () =>
      apiFetch<{
        data: {
          acvClosedQTD: number;
          acvClosedYTD: number;
          quotaAttainmentQTD: number;
          quotaAttainmentYTD: number;
        };
      }>(`/api/home/kpis${viewAsParam}`),
  });

  // Fetch quota from performance API
  const quotaParams = useMemo(() => {
    const params = [{ fy: fiscalYear, q: fiscalQuarter }];
    return encodeURIComponent(JSON.stringify(params));
  }, [fiscalYear, fiscalQuarter]);

  const { data: perfData } = useQuery({
    queryKey: ["commission-scenario-quota", quotaParams, viewAsUser?.user_id],
    queryFn: () =>
      apiFetch<{ data: Record<string, { annualQuota: number | null }> }>(
        `/api/performance?quarters=${quotaParams}${viewAsUser ? `&viewAs=${viewAsUser.user_id}` : ""}`
      ),
  });

  const kpis = kpisData?.data;
  const annualQuota = useMemo(() => {
    if (!perfData?.data) return null;
    const qData = Object.values(perfData.data)[0];
    return qData?.annualQuota ?? null;
  }, [perfData]);
  const quarterlyQuota = annualQuota ? annualQuota / 4 : null;

  const openDeals = (oppsData?.data || []) as OppWithRelations[];

  // ─── Group deals by fiscal quarter ────────────────

  const quarterBuckets = useMemo(() => {
    const buckets: Record<string, QuarterBucket> = {};

    for (const deal of openDeals) {
      if (!deal.close_date) continue;
      const d = new Date(deal.close_date);
      const fy = getFiscalYear(d);
      const fq = getFiscalQuarter(d);
      const label = `Q${fq} FY${fy}`;

      if (!buckets[label]) {
        buckets[label] = { label, fy, fq, deals: [], selectedAcv: 0, selectedCount: 0 };
      }
      buckets[label].deals.push(deal);

      if (selectedDealIds.has(deal.id)) {
        buckets[label].selectedAcv += deal.acv || 0;
        buckets[label].selectedCount++;
      }
    }

    return Object.values(buckets).sort((a, b) => {
      if (a.fy !== b.fy) return a.fy - b.fy;
      return a.fq - b.fq;
    });
  }, [openDeals, selectedDealIds]);

  // ─── Projections ──────────────────────────────────

  const projections = useMemo(() => {
    const selectedAcv = openDeals
      .filter((d) => selectedDealIds.has(d.id))
      .reduce((s, d) => s + (d.acv || 0), 0);

    const currentClosedQTD = kpis?.acvClosedQTD || 0;
    const currentClosedYTD = kpis?.acvClosedYTD || 0;

    // Only count selected deals closing in current quarter for QTD projection
    const selectedQtdAcv = openDeals
      .filter((d) => {
        if (!selectedDealIds.has(d.id) || !d.close_date) return false;
        const date = new Date(d.close_date);
        return getFiscalYear(date) === fiscalYear && getFiscalQuarter(date) === fiscalQuarter;
      })
      .reduce((s, d) => s + (d.acv || 0), 0);

    const projectedQTD = currentClosedQTD + selectedQtdAcv;
    const projectedYTD = currentClosedYTD + selectedAcv;

    const rate = commissionRate / 100;
    const projectedCommissionFromSelected = selectedAcv * rate;
    const totalProjectedCommissionQTD = projectedQTD * rate;

    const currentAttainmentQTD = kpis?.quotaAttainmentQTD || 0;
    const projectedAttainmentQTD =
      quarterlyQuota && quarterlyQuota > 0
        ? (projectedQTD / quarterlyQuota) * 100
        : 0;
    const projectedAttainmentYTD =
      annualQuota && annualQuota > 0
        ? (projectedYTD / annualQuota) * 100
        : 0;

    return {
      selectedAcv,
      selectedCount: selectedDealIds.size,
      selectedQtdAcv,
      currentClosedQTD,
      currentClosedYTD,
      projectedQTD,
      projectedYTD,
      projectedCommissionFromSelected,
      totalProjectedCommissionQTD,
      currentAttainmentQTD,
      projectedAttainmentQTD,
      projectedAttainmentYTD,
    };
  }, [selectedDealIds, openDeals, kpis, commissionRate, quarterlyQuota, annualQuota, fiscalYear, fiscalQuarter]);

  // ─── Handlers ─────────────────────────────────────

  const toggleDeal = useCallback((id: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((deals: OppWithRelations[]) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      deals.forEach((d) => next.add(d.id));
      return next;
    });
  }, []);

  const deselectAll = useCallback((deals: OppWithRelations[]) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      deals.forEach((d) => next.delete(d.id));
      return next;
    });
  }, []);

  const handleRateChange = useCallback((val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setCommissionRate(num);
      saveRate(num);
    }
  }, []);

  // ─── Render ───────────────────────────────────────

  if (oppsLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calculator className="h-4 w-4 animate-pulse" />
            Loading pipeline data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            Commission Scenario Modeling
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Commission Rate:</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionRate}
                onChange={(e) => handleRateChange(e.target.value)}
                className="h-7 w-16 text-xs text-center tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left: Deal Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Select deals to model — {openDeals.length} open opportunities
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => selectAll(openDeals)}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setSelectedDealIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Quarter buckets */}
            <div className="space-y-2">
              {quarterBuckets.map((bucket) => {
                const isCurrentQ = bucket.fy === fiscalYear && bucket.fq === fiscalQuarter;
                const isExpanded = expandedQuarter === bucket.label;
                const allSelected = bucket.deals.every((d) => selectedDealIds.has(d.id));
                const someSelected = bucket.deals.some((d) => selectedDealIds.has(d.id));

                return (
                  <div
                    key={bucket.label}
                    className={cn(
                      "rounded-lg border overflow-hidden",
                      isCurrentQ && "border-primary/30"
                    )}
                  >
                    {/* Quarter header */}
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        setExpandedQuarter(isExpanded ? null : bucket.label)
                      }
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
                        )}
                        <span className="text-sm font-medium">{bucket.label}</span>
                        {isCurrentQ && (
                          <Badge variant="secondary" className="text-[9px] h-4">
                            Current
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {bucket.deals.length} deal{bucket.deals.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {bucket.selectedCount > 0 && (
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            +{fmtCurrency(bucket.selectedAcv)} ({bucket.selectedCount})
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtCurrency(
                            bucket.deals.reduce((s, d) => s + (d.acv || 0), 0)
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Deal list */}
                    {isExpanded && (
                      <div className="border-t">
                        {/* Select all for this quarter */}
                        <div className="px-3 py-1.5 bg-muted/30 border-b flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() =>
                                allSelected
                                  ? deselectAll(bucket.deals)
                                  : selectAll(bucket.deals)
                              }
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {allSelected ? "Deselect all" : "Select all"} in{" "}
                              {bucket.label}
                            </span>
                          </div>
                        </div>

                        {bucket.deals
                          .sort((a, b) => (b.acv || 0) - (a.acv || 0))
                          .map((deal) => {
                            const isSelected = selectedDealIds.has(deal.id);
                            return (
                              <div
                                key={deal.id}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer border-b last:border-0",
                                  isSelected && "bg-green-500/[0.04]"
                                )}
                                onClick={() => toggleDeal(deal.id)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleDeal(deal.id)}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {deal.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {deal.accounts?.name || "—"} &middot;{" "}
                                    {deal.stage}
                                    {deal.probability != null &&
                                      ` &middot; ${deal.probability}%`}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-semibold tabular-nums">
                                    {fmtCurrency(deal.acv || 0)}
                                  </p>
                                  {isSelected && (
                                    <p className="text-[10px] text-green-600 dark:text-green-400 tabular-nums">
                                      +{fmtCurrency((deal.acv || 0) * (commissionRate / 100))}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}

              {quarterBuckets.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No open pipeline deals found
                </div>
              )}
            </div>
          </div>

          {/* Right: Projection Panel */}
          <div className="space-y-4">
            {/* Selected summary */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">What-If Projection</span>
              </div>

              {projections.selectedCount === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Select deals from the left to see projected impact
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Selected deals summary */}
                  <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      If you close {projections.selectedCount} selected deal{projections.selectedCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
                      +{fmtCurrency(projections.selectedAcv)}
                    </p>
                  </div>

                  {/* QTD Projection */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Q{fiscalQuarter} FY{fiscalYear} Projection
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Current:</span>
                      <span className="font-semibold">{fmtCurrency(projections.currentClosedQTD)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {fmtCurrency(projections.projectedQTD)}
                      </span>
                    </div>

                    {/* Attainment bar */}
                    {quarterlyQuota && quarterlyQuota > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-muted-foreground">Quota Attainment</span>
                          <span className={cn(
                            "font-semibold",
                            projections.projectedAttainmentQTD >= 100
                              ? "text-green-600 dark:text-green-400"
                              : projections.projectedAttainmentQTD >= 70
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-red-600 dark:text-red-400"
                          )}>
                            {projections.currentAttainmentQTD.toFixed(0)}%{" "}
                            <ArrowRight className="h-2.5 w-2.5 inline" />{" "}
                            {projections.projectedAttainmentQTD.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                          {/* Current attainment */}
                          <div
                            className="h-full bg-primary/40 rounded-full absolute left-0 top-0"
                            style={{
                              width: `${Math.min(100, projections.currentAttainmentQTD)}%`,
                            }}
                          />
                          {/* Projected attainment */}
                          <div
                            className="h-full bg-green-500 rounded-full absolute left-0 top-0 transition-all"
                            style={{
                              width: `${Math.min(100, projections.projectedAttainmentQTD)}%`,
                              opacity: 0.6,
                            }}
                          />
                          {/* 100% marker */}
                          <div className="absolute right-0 top-0 h-full w-px bg-foreground/30" />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                          <span>0%</span>
                          <span>{fmtCurrency(quarterlyQuota)} quota</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Commission projection */}
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Commission Impact
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">From Selected</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          +{fmtCurrency(projections.projectedCommissionFromSelected)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Total QTD</p>
                        <p className="text-lg font-bold">
                          {fmtCurrency(projections.totalProjectedCommissionQTD)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      Based on {commissionRate}% rate &middot; Actual rate may vary by deal type
                    </p>
                  </div>

                  {/* YTD summary */}
                  <div className="border-t pt-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Full Year Impact
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">YTD ACV:</span>
                      <span>{fmtCurrency(projections.currentClosedYTD)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {fmtCurrency(projections.projectedYTD)}
                      </span>
                    </div>
                    {annualQuota && annualQuota > 0 && (
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <span className="text-muted-foreground">Annual Attainment:</span>
                        <span className={cn(
                          "font-semibold",
                          projections.projectedAttainmentYTD >= 100
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        )}>
                          {projections.projectedAttainmentYTD.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick select helpers */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Quick Scenarios
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] justify-start"
                  onClick={() => {
                    const forecasted = openDeals.filter(
                      (d) => d.mgmt_forecast_category === "Forecast"
                    );
                    setSelectedDealIds(new Set(forecasted.map((d) => d.id)));
                  }}
                >
                  <TrendingUp className="h-3 w-3 mr-1.5" />
                  Select all Forecast deals
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] justify-start"
                  onClick={() => {
                    const high = openDeals.filter(
                      (d) => (d.probability || 0) >= 70
                    );
                    setSelectedDealIds(new Set(high.map((d) => d.id)));
                  }}
                >
                  <Target className="h-3 w-3 mr-1.5" />
                  Select deals with 70%+ probability
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] justify-start"
                  onClick={() => {
                    const currentQDeals = openDeals.filter((d) => {
                      if (!d.close_date) return false;
                      const date = new Date(d.close_date);
                      return (
                        getFiscalYear(date) === fiscalYear &&
                        getFiscalQuarter(date) === fiscalQuarter
                      );
                    });
                    setSelectedDealIds(new Set(currentQDeals.map((d) => d.id)));
                  }}
                >
                  <Calculator className="h-3 w-3 mr-1.5" />
                  Select all closing this quarter
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
