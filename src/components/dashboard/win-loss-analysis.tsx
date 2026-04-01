"use client";

import { useMemo, useState } from "react";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useAuthStore } from "@/stores/auth-store";
import { getCurrentFiscalPeriod, getFiscalYear, getFiscalQuarter } from "@/lib/fiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { PieChart as PieChartIcon, TrendingDown, TrendingUp, Scale } from "lucide-react";
import type { Opportunity } from "@/types";

// ─── Types ──────────────────────────────────────────────

type OppWithRelations = Opportunity & {
  accounts?: { id: string; name: string; industry: string; region: string };
  users?: { id: string; full_name: string; email: string };
};

interface WinRateBucket {
  label: string;
  won: number;
  lost: number;
  wonAcv: number;
  lostAcv: number;
  winRate: number;
  total: number;
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

const DEAL_SIZE_BUCKETS = [
  { label: "<$25K", min: 0, max: 25_000 },
  { label: "$25K–$50K", min: 25_000, max: 50_000 },
  { label: "$50K–$100K", min: 50_000, max: 100_000 },
  { label: "$100K–$250K", min: 100_000, max: 250_000 },
  { label: "$250K–$500K", min: 250_000, max: 500_000 },
  { label: "$500K–$1M", min: 500_000, max: 1_000_000 },
  { label: "$1M+", min: 1_000_000, max: Infinity },
];

function buildWinRateData(
  won: OppWithRelations[],
  lost: OppWithRelations[],
  keyFn: (o: OppWithRelations) => string
): WinRateBucket[] {
  const map: Record<string, { won: number; lost: number; wonAcv: number; lostAcv: number }> = {};

  for (const o of won) {
    const key = keyFn(o);
    if (!map[key]) map[key] = { won: 0, lost: 0, wonAcv: 0, lostAcv: 0 };
    map[key].won++;
    map[key].wonAcv += o.acv || 0;
  }
  for (const o of lost) {
    const key = keyFn(o);
    if (!map[key]) map[key] = { won: 0, lost: 0, wonAcv: 0, lostAcv: 0 };
    map[key].lost++;
    map[key].lostAcv += o.acv || 0;
  }

  return Object.entries(map)
    .map(([label, data]) => ({
      label,
      ...data,
      total: data.won + data.lost,
      winRate: data.won + data.lost > 0 ? (data.won / (data.won + data.lost)) * 100 : 0,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
}

function winRateColor(pct: number): string {
  if (pct >= 50) return "#22c55e";
  if (pct >= 30) return "#f59e0b";
  return "#ef4444";
}

// ─── Component ──────────────────────────────────────────

export function WinLossAnalysis() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear } = getCurrentFiscalPeriod();
  const [selectedFY, setSelectedFY] = useState(fiscalYear);
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const fyOptions = [fiscalYear, fiscalYear - 1, fiscalYear - 2];

  const baseParams = {
    fiscal_year: selectedFY,
    limit: 2000,
    ...(viewAsUser && { viewAs: viewAsUser.user_id }),
  };

  const { data: wonData, isLoading: wonLoading } = useOpportunities({
    ...baseParams,
    status: "closed_won",
  });

  const { data: lostData, isLoading: lostLoading } = useOpportunities({
    ...baseParams,
    status: "closed_lost",
  });

  const isLoading = wonLoading || lostLoading;
  const wonDeals = (wonData?.data || []) as OppWithRelations[];
  const lostDeals = (lostData?.data || []) as OppWithRelations[];

  // ─── KPIs ──────────────────────────────────────────

  const kpis = useMemo(() => {
    const wonCount = wonDeals.length;
    const lostCount = lostDeals.length;
    const totalCount = wonCount + lostCount;
    const wonAcv = wonDeals.reduce((s, o) => s + (o.acv || 0), 0);
    const lostAcv = lostDeals.reduce((s, o) => s + (o.acv || 0), 0);
    const winRateCount = totalCount > 0 ? (wonCount / totalCount) * 100 : 0;
    const winRateAcv = wonAcv + lostAcv > 0 ? (wonAcv / (wonAcv + lostAcv)) * 100 : 0;
    const avgWonSize = wonCount > 0 ? wonAcv / wonCount : 0;
    const avgLostSize = lostCount > 0 ? lostAcv / lostCount : 0;

    return {
      wonCount, lostCount, totalCount,
      wonAcv, lostAcv,
      winRateCount, winRateAcv,
      avgWonSize, avgLostSize,
    };
  }, [wonDeals, lostDeals]);

  // ─── Win Rate by Deal Type ─────────────────────────

  const winRateByType = useMemo(
    () => buildWinRateData(wonDeals, lostDeals, (o) => o.type || "Unknown"),
    [wonDeals, lostDeals]
  );

  // ─── Win Rate by Sub Type ─────────────────────────

  const winRateBySubType = useMemo(
    () => buildWinRateData(wonDeals, lostDeals, (o) => o.sub_type || "Unknown"),
    [wonDeals, lostDeals]
  );

  // ─── Win Rate by Deal Size ─────────────────────────

  const winRateBySize = useMemo(() => {
    function getBucket(acv: number): string {
      for (const b of DEAL_SIZE_BUCKETS) {
        if (acv >= b.min && acv < b.max) return b.label;
      }
      return "$1M+";
    }
    const data = buildWinRateData(wonDeals, lostDeals, (o) => getBucket(o.acv || 0));
    // Sort by bucket order
    const order = DEAL_SIZE_BUCKETS.map((b) => b.label);
    return data.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }, [wonDeals, lostDeals]);

  // ─── Win/Loss by Quarter ──────────────────────────

  const winLossByQuarter = useMemo(() => {
    const map: Record<string, { label: string; won: number; lost: number; wonAcv: number; lostAcv: number }> = {};

    function addToMap(deals: OppWithRelations[], type: "won" | "lost") {
      for (const o of deals) {
        if (!o.close_date) continue;
        const d = new Date(o.close_date);
        const fy = getFiscalYear(d);
        const fq = getFiscalQuarter(d);
        const label = `Q${fq} FY${fy}`;
        if (!map[label]) map[label] = { label, won: 0, lost: 0, wonAcv: 0, lostAcv: 0 };
        if (type === "won") {
          map[label].won++;
          map[label].wonAcv += o.acv || 0;
        } else {
          map[label].lost++;
          map[label].lostAcv += o.acv || 0;
        }
      }
    }

    addToMap(wonDeals, "won");
    addToMap(lostDeals, "lost");

    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
  }, [wonDeals, lostDeals]);

  // ─── Win Rate by Source ───────────────────────────

  const winRateBySource = useMemo(
    () => buildWinRateData(wonDeals, lostDeals, (o) => o.opportunity_source || "Unknown"),
    [wonDeals, lostDeals]
  );

  // ─── Loss table columns ──────────────────────────

  const lossColumns: Column<Record<string, unknown>>[] = [
    {
      key: "account_name",
      header: "Account",
      render: (row) => (row.accounts as { name: string } | undefined)?.name || "—",
    },
    { key: "name", header: "Opportunity" },
    {
      key: "sub_type",
      header: "Sub Type",
      render: (row) => row.sub_type ? <Badge variant="secondary" className="text-[10px]">{row.sub_type as string}</Badge> : "—",
    },
    {
      key: "acv",
      header: "ACV",
      render: (row) => row.acv ? fmtCurrency(row.acv as number) : "—",
    },
    {
      key: "stage",
      header: "Last Stage",
      render: (row) => <Badge variant="outline" className="text-[10px]">{row.stage as string}</Badge>,
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => (row.users as { full_name: string } | undefined)?.full_name || "—",
    },
    { key: "close_date", header: "Close Date" },
  ];

  // ─── Render ──────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Win/Loss Analysis</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4 pb-4 px-4 h-20 animate-pulse bg-muted/30" /></Card>
          ))}
        </div>
      </div>
    );
  }

  const noData = kpis.totalCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Win/Loss Analysis</h2>
        </div>
        <div className="flex items-center gap-1">
          {fyOptions.map((fy) => (
            <Button
              key={fy}
              variant={selectedFY === fy ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedFY(fy)}
            >
              FY{fy}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deals Won</p>
            <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{kpis.wonCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{fmtCurrency(kpis.wonAcv)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deals Lost</p>
            <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{kpis.lostCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{fmtCurrency(kpis.lostAcv)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border", kpis.winRateCount >= 50 ? "bg-green-500/5 border-green-500/20" : kpis.winRateCount >= 30 ? "bg-amber-500/5 border-amber-500/20" : "bg-red-500/5 border-red-500/20")}>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Win Rate (Deals)</p>
            <p className={cn("text-2xl font-bold mt-1", kpis.winRateCount >= 50 ? "text-green-600 dark:text-green-400" : kpis.winRateCount >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
              {noData ? "N/A" : `${kpis.winRateCount.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{kpis.wonCount} of {kpis.totalCount} deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Win Rate (ACV)</p>
            <p className="text-2xl font-bold mt-1">
              {noData ? "N/A" : `${kpis.winRateAcv.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">By dollar value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Avg Deal Size</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {fmtCurrency(kpis.avgWonSize)}
              </span>
              <span className="text-muted-foreground text-xs">vs</span>
              <span className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-0.5">
                <TrendingDown className="h-3 w-3" />
                {fmtCurrency(kpis.avgLostSize)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Won vs Lost</p>
          </CardContent>
        </Card>
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No closed deals found for FY{selectedFY}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts Row 1: Win Rate by Type + by Size */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win Rate by Deal Type</CardTitle>
              </CardHeader>
              <CardContent>
                {winRateByType.length === 0 ? (
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={winRateByType} layout="vertical" barSize={20}>
                      <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={100} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(val: any) => `${Number(val).toFixed(1)}%`} labelFormatter={(l) => `${l}`} />
                      <Bar dataKey="winRate" name="Win Rate" radius={[0, 4, 4, 0]}>
                        {winRateByType.map((entry, idx) => (
                          <Cell key={idx} fill={winRateColor(entry.winRate)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {/* Legend with counts */}
                <div className="flex flex-wrap gap-3 mt-2">
                  {winRateByType.map((d) => (
                    <span key={d.label} className="text-[10px] text-muted-foreground">
                      {d.label}: {d.won}W / {d.lost}L ({d.total})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win Rate by Deal Size</CardTitle>
              </CardHeader>
              <CardContent>
                {winRateBySize.length === 0 ? (
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={winRateBySize} barSize={24}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(val: any) => `${Number(val).toFixed(1)}%`} />
                      <Bar dataKey="winRate" name="Win Rate" radius={[4, 4, 0, 0]}>
                        {winRateBySize.map((entry, idx) => (
                          <Cell key={idx} fill={winRateColor(entry.winRate)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {winRateBySize.map((d) => (
                    <span key={d.label} className="text-[10px] text-muted-foreground">
                      {d.label}: {d.won}W / {d.lost}L
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2: Win/Loss Trend + Win Rate by Sub Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win/Loss Trend by Quarter</CardTitle>
              </CardHeader>
              <CardContent>
                {winLossByQuarter.length === 0 ? (
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={winLossByQuarter} barGap={2}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(val: any, name: any) => [Number(val), name === "won" ? "Won" : "Lost"]} />
                      <Legend formatter={(v) => (v === "won" ? "Won" : "Lost")} />
                      <Bar dataKey="won" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win Rate by Sub Type</CardTitle>
              </CardHeader>
              <CardContent>
                {winRateBySubType.length === 0 ? (
                  <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={winRateBySubType.slice(0, 8)} layout="vertical" barSize={18}>
                      <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={120} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(val: any) => `${Number(val).toFixed(1)}%`} />
                      <Bar dataKey="winRate" name="Win Rate" radius={[0, 4, 4, 0]}>
                        {winRateBySubType.slice(0, 8).map((entry, idx) => (
                          <Cell key={idx} fill={winRateColor(entry.winRate)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {winRateBySubType.slice(0, 8).map((d) => (
                    <span key={d.label} className="text-[10px] text-muted-foreground">
                      {d.label}: {d.won}W / {d.lost}L
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Win Rate by Source */}
          {winRateBySource.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win Rate by Opportunity Source</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, winRateBySource.length * 36)}>
                  <BarChart data={winRateBySource} layout="vertical" barSize={20}>
                    <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={120} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip
                      formatter={(val: any, _: any, props: any) => {
                        const d = props?.payload;
                        return [`${Number(val).toFixed(1)}% (${d?.won ?? 0}W / ${d?.lost ?? 0}L)`, "Win Rate"];
                      }}
                    />
                    <Bar dataKey="winRate" name="Win Rate" radius={[0, 4, 4, 0]}>
                      {winRateBySource.map((entry, idx) => (
                        <Cell key={idx} fill={winRateColor(entry.winRate)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Closed-Lost Deals Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Closed-Lost Deals</CardTitle>
                <Badge variant="destructive" className="text-[10px]">
                  {lostDeals.length} deal{lostDeals.length !== 1 ? "s" : ""} &middot; {fmtCurrency(kpis.lostAcv)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                data={[...lostDeals].sort((a, b) => (b.acv || 0) - (a.acv || 0)) as unknown as Record<string, unknown>[]}
                columns={lossColumns}
                pageSize={10}
                onRowClick={(row) => setSelectedOpp(row.id as string)}
                emptyMessage="No closed-lost deals found"
              />
            </CardContent>
          </Card>
        </>
      )}

      <OpportunityDrawer
        opportunityId={selectedOpp}
        open={!!selectedOpp}
        onClose={() => setSelectedOpp(null)}
      />
    </div>
  );
}
