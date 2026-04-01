"use client";

import { useMemo, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useOpportunities } from "@/hooks/use-opportunities";
import { getCurrentFiscalPeriod } from "@/lib/fiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Flame,
} from "lucide-react";
import type { Opportunity } from "@/types";

// ─── Types ──────────────────────────────────────────────

type OppWithRelations = Opportunity & {
  accounts?: { id: string; name: string; industry: string; region: string };
  users?: { id: string; full_name: string };
};

interface PartnerMetrics {
  partner: string;
  wonCount: number;
  lostCount: number;
  totalClosed: number;
  winRate: number;
  wonAcv: number;
  lostAcv: number;
  avgWonDealSize: number;
  avgSalesCycleDays: number;
  openCount: number;
  openAcv: number;
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

function winRateColor(pct: number): string {
  if (pct >= 50) return "text-green-600 dark:text-green-400";
  if (pct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function winRateBg(pct: number): string {
  if (pct >= 50) return "bg-green-500/10";
  if (pct >= 30) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function winRateFill(pct: number): string {
  if (pct >= 50) return "#22c55e";
  if (pct >= 30) return "#f59e0b";
  return "#ef4444";
}

function cycleBg(days: number): string {
  if (days <= 60) return "bg-green-500/10";
  if (days <= 120) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function cycleColor(days: number): string {
  if (days <= 60) return "text-green-600 dark:text-green-400";
  if (days <= 120) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

type SortKey = "partner" | "winRate" | "wonCount" | "totalClosed" | "wonAcv" | "avgWonDealSize" | "avgSalesCycleDays" | "openAcv";
type SortDir = "asc" | "desc";

// ─── Custom Tooltip ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BubbleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PartnerMetrics;
  if (!d) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm max-w-xs">
      <p className="font-semibold truncate">{d.partner}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <span className="text-muted-foreground">Win Rate:</span>
        <span className={cn("font-medium", winRateColor(d.winRate))}>{d.winRate.toFixed(0)}%</span>
        <span className="text-muted-foreground">Won / Lost:</span>
        <span className="font-medium">{d.wonCount}W / {d.lostCount}L</span>
        <span className="text-muted-foreground">Won ACV:</span>
        <span className="font-medium">{fmtCurrency(d.wonAcv)}</span>
        <span className="text-muted-foreground">Avg Deal:</span>
        <span className="font-medium">{fmtCurrency(d.avgWonDealSize)}</span>
        <span className="text-muted-foreground">Avg Cycle:</span>
        <span className="font-medium">{d.avgSalesCycleDays > 0 ? `${d.avgSalesCycleDays}d` : "—"}</span>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────

export function PartnerInfluenceHeatmap() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear } = getCurrentFiscalPeriod();
  const [selectedFY, setSelectedFY] = useState(fiscalYear);
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minDeals, setMinDeals] = useState(2);

  const fyOptions = [fiscalYear, fiscalYear - 1];

  const baseParams = {
    fiscal_year: selectedFY,
    limit: 2000,
    ...(viewAsUser && { viewAs: viewAsUser.user_id }),
  };

  const { data: wonData, isLoading: wonLoading } = useOpportunities({ ...baseParams, status: "closed_won" });
  const { data: lostData, isLoading: lostLoading } = useOpportunities({ ...baseParams, status: "closed_lost" });
  const { data: openData, isLoading: openLoading } = useOpportunities({ ...baseParams, status: "open" });

  const isLoading = wonLoading || lostLoading || openLoading;

  const wonDeals = (wonData?.data || []) as OppWithRelations[];
  const lostDeals = (lostData?.data || []) as OppWithRelations[];
  const openDeals = (openData?.data || []) as OppWithRelations[];

  // ─── Compute per-partner metrics ──────────────────

  const partnerMetrics = useMemo(() => {
    const map: Record<string, {
      wonDeals: OppWithRelations[];
      lostDeals: OppWithRelations[];
      openDeals: OppWithRelations[];
    }> = {};

    function addDeal(deal: OppWithRelations, type: "won" | "lost" | "open") {
      const partner = deal.rv_account_sf_id;
      if (!partner) return;
      if (!map[partner]) map[partner] = { wonDeals: [], lostDeals: [], openDeals: [] };
      if (type === "won") map[partner].wonDeals.push(deal);
      else if (type === "lost") map[partner].lostDeals.push(deal);
      else map[partner].openDeals.push(deal);
    }

    wonDeals.forEach((d) => addDeal(d, "won"));
    lostDeals.forEach((d) => addDeal(d, "lost"));
    openDeals.forEach((d) => addDeal(d, "open"));

    const metrics: PartnerMetrics[] = Object.entries(map).map(([partner, data]) => {
      const wonCount = data.wonDeals.length;
      const lostCount = data.lostDeals.length;
      const totalClosed = wonCount + lostCount;
      const winRate = totalClosed > 0 ? (wonCount / totalClosed) * 100 : 0;
      const wonAcv = data.wonDeals.reduce((s, d) => s + (d.acv || 0), 0);
      const lostAcv = data.lostDeals.reduce((s, d) => s + (d.acv || 0), 0);
      const avgWonDealSize = wonCount > 0 ? wonAcv / wonCount : 0;

      // Avg sales cycle (days from created to close for won deals)
      const cycleDays = data.wonDeals
        .filter((d) => d.sf_created_date && d.close_date)
        .map((d) => {
          const created = new Date(d.sf_created_date!);
          const closed = new Date(d.close_date!);
          return Math.max(0, Math.ceil((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
        });
      const avgSalesCycleDays = cycleDays.length > 0
        ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length)
        : 0;

      const openCount = data.openDeals.length;
      const openAcv = data.openDeals.reduce((s, d) => s + (d.acv || 0), 0);

      return {
        partner, wonCount, lostCount, totalClosed, winRate,
        wonAcv, lostAcv, avgWonDealSize, avgSalesCycleDays,
        openCount, openAcv,
      };
    });

    return metrics.filter((m) => m.totalClosed >= minDeals);
  }, [wonDeals, lostDeals, openDeals, minDeals]);

  // ─── Sorting ──────────────────────────────────────

  const sorted = useMemo(() => {
    return [...partnerMetrics].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [partnerMetrics, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "partner" ? "asc" : "desc");
    }
  }, [sortKey]);

  // ─── Aggregate stats ─────────────────────────────

  const aggregates = useMemo(() => {
    if (partnerMetrics.length === 0) return null;
    const totalWon = partnerMetrics.reduce((s, p) => s + p.wonCount, 0);
    const totalLost = partnerMetrics.reduce((s, p) => s + p.lostCount, 0);
    const totalWonAcv = partnerMetrics.reduce((s, p) => s + p.wonAcv, 0);
    const avgWinRate = totalWon + totalLost > 0 ? (totalWon / (totalWon + totalLost)) * 100 : 0;
    const avgDealSize = totalWon > 0 ? totalWonAcv / totalWon : 0;
    const bestPartner = [...partnerMetrics].sort((a, b) => b.winRate - a.winRate)[0];
    return { totalWon, totalLost, totalWonAcv, avgWinRate, avgDealSize, bestPartner, partnerCount: partnerMetrics.length };
  }, [partnerMetrics]);

  // ─── Bubble chart data ────────────────────────────

  const medianWinRate = useMemo(() => {
    if (partnerMetrics.length === 0) return 50;
    const rates = partnerMetrics.map((p) => p.winRate).sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
  }, [partnerMetrics]);

  // ─── Sort Header Helper ───────────────────────────

  function SH({ label, col, align = "right" }: { label: string; col: SortKey; align?: "left" | "right" }) {
    const active = sortKey === col;
    return (
      <th
        className={cn(
          "py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap text-xs font-medium text-muted-foreground",
          align === "right" ? "text-right" : "text-left"
        )}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {align === "right" && active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          {align === "right" && !active && <ArrowUpDown className="h-3 w-3 opacity-30" />}
          {label}
          {align === "left" && active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          {align === "left" && !active && <ArrowUpDown className="h-3 w-3 opacity-30" />}
        </span>
      </th>
    );
  }

  // ─── Render ───────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Flame className="h-4 w-4 animate-pulse" />
            Loading partner effectiveness data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Partner Effectiveness</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Min deals:</span>
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5 gap-0.5">
            {[1, 2, 3, 5].map((n) => (
              <Button
                key={n}
                variant={minDeals === n ? "default" : "ghost"}
                size="sm"
                className="h-6 w-7 text-[10px] px-0"
                onClick={() => setMinDeals(n)}
              >
                {n}+
              </Button>
            ))}
          </div>
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5 gap-0.5 ml-2">
            {fyOptions.map((fy) => (
              <Button
                key={fy}
                variant={selectedFY === fy ? "default" : "ghost"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setSelectedFY(fy)}
              >
                FY{fy}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {aggregates && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Partners Tracked</p>
              <p className="text-xl font-bold">{aggregates.partnerCount}</p>
            </CardContent>
          </Card>
          <Card className={cn("border", aggregates.avgWinRate >= 50 ? "border-green-500/20 bg-green-500/5" : aggregates.avgWinRate >= 30 ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5")}>
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Avg Win Rate</p>
              <p className={cn("text-xl font-bold", winRateColor(aggregates.avgWinRate))}>{aggregates.avgWinRate.toFixed(0)}%</p>
              <p className="text-[9px] text-muted-foreground">{aggregates.totalWon}W / {aggregates.totalLost}L</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Won ACV</p>
              <p className="text-xl font-bold">{shortCurrency(aggregates.totalWonAcv)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Avg Deal Size</p>
              <p className="text-xl font-bold">{fmtCurrency(aggregates.avgDealSize)}</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Top Win Rate</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400 truncate">{aggregates.bestPartner?.partner}</p>
              <p className="text-[9px] text-muted-foreground">{aggregates.bestPartner?.winRate.toFixed(0)}% ({aggregates.bestPartner?.wonCount}W / {aggregates.bestPartner?.lostCount}L)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bubble Chart: Volume vs Win Rate */}
      {partnerMetrics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Volume vs Effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  type="number"
                  dataKey="totalClosed"
                  name="Total Deals"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  label={{ value: "Total Closed Deals", position: "bottom", offset: 0, style: { fontSize: 11, fill: "#7A8099" } }}
                />
                <YAxis
                  type="number"
                  dataKey="winRate"
                  name="Win Rate"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  width={45}
                  label={{ value: "Win Rate %", position: "left", angle: -90, offset: 0, style: { fontSize: 11, fill: "#7A8099", textAnchor: "middle" } }}
                />
                <ZAxis dataKey="wonAcv" range={[40, 400]} name="Won ACV" />
                <Tooltip content={<BubbleTooltip />} />
                <ReferenceLine y={medianWinRate} stroke="#3A3F52" strokeDasharray="4 4" strokeWidth={1} />
                <Scatter data={partnerMetrics}>
                  {partnerMetrics.map((entry, idx) => (
                    <Cell key={idx} fill={winRateFill(entry.winRate)} fillOpacity={0.7} stroke={winRateFill(entry.winRate)} strokeWidth={1} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              Bubble size = Won ACV &middot; Dashed line = median win rate ({medianWinRate.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Heatmap Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Partner Effectiveness Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No partners with {minDeals}+ closed deals in FY{selectedFY}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b">
                    <SH label="Partner" col="partner" align="left" />
                    <SH label="Win Rate" col="winRate" />
                    <SH label="Won" col="wonCount" />
                    <SH label="Lost" col="totalClosed" />
                    <SH label="Won ACV" col="wonAcv" />
                    <SH label="Avg Deal Size" col="avgWonDealSize" />
                    <SH label="Avg Cycle" col="avgSalesCycleDays" />
                    <SH label="Open Pipeline" col="openAcv" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.partner} className="border-b last:border-0 hover:bg-muted/30 text-sm">
                      <td className="py-2.5 px-2 font-medium max-w-[200px] truncate" title={p.partner}>
                        {p.partner}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-semibold tabular-nums", winRateBg(p.winRate), winRateColor(p.winRate))}>
                          {p.winRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-green-600 dark:text-green-400 font-medium">{p.wonCount}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-red-600 dark:text-red-400">{p.lostCount}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{fmtCurrency(p.wonAcv)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtCurrency(p.avgWonDealSize)}</td>
                      <td className="py-2.5 px-2 text-right">
                        {p.avgSalesCycleDays > 0 ? (
                          <span className={cn("inline-block px-2 py-0.5 rounded text-xs tabular-nums", cycleBg(p.avgSalesCycleDays), cycleColor(p.avgSalesCycleDays))}>
                            {p.avgSalesCycleDays}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                        {p.openCount > 0 ? (
                          <span>{fmtCurrency(p.openAcv)} <span className="text-[10px]">({p.openCount})</span></span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
