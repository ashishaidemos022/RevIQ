"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Zap,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TrendingUp,
  Layers,
  Gauge,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface AccountRow {
  sf_account_id: string;
  sf_account_name: string;
  sf_account_owner: string;
  consumption: number;
  overage: number;
  charged: number;
  ai_charged: number;
  product_charged: number;
}

type SignalType = "overage" | "ai_whitespace" | "product_whitespace" | "power_user";

interface ExpansionSignal {
  type: SignalType;
  label: string;
  description: string;
  icon: typeof Zap;
  color: string;
}

interface ScoredAccount {
  account: AccountRow;
  score: number;
  overageScore: number;
  aiWhitespaceScore: number;
  intensityScore: number;
  signals: SignalType[];
  overagePct: number;
  aiPct: number;
}

// ─── Signal Definitions ─────────────────────────────────

const SIGNAL_DEFS: Record<SignalType, ExpansionSignal> = {
  overage: {
    type: "overage",
    label: "Overage",
    description: "Usage exceeding allocation — expansion candidate",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
  },
  ai_whitespace: {
    type: "ai_whitespace",
    label: "AI Cross-Sell",
    description: "Low AI product adoption — cross-sell opportunity",
    icon: Zap,
    color: "text-blue-600 dark:text-blue-400",
  },
  product_whitespace: {
    type: "product_whitespace",
    label: "Product Cross-Sell",
    description: "High AI but low product usage — expansion opportunity",
    icon: Layers,
    color: "text-purple-600 dark:text-purple-400",
  },
  power_user: {
    type: "power_user",
    label: "Power User",
    description: "Above-median usage intensity — high engagement, expansion-ready",
    icon: TrendingUp,
    color: "text-green-600 dark:text-green-400",
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

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-muted-foreground/50";
}

function scoreFill(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#94a3b8";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type SortKey = "score" | "name" | "overage" | "aiPct" | "charged";
type SortDir = "asc" | "desc";

// ─── Component ──────────────────────────────────────────

interface ExpansionSignalsProps {
  accounts: AccountRow[];
  onAccountClick?: (sfAccountId: string) => void;
}

export function ExpansionSignals({ accounts, onAccountClick }: ExpansionSignalsProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [signalFilter, setSignalFilter] = useState<SignalType | "all">("all");

  // ─── Score all accounts ───────────────────────────

  const { scored, signalCounts } = useMemo(() => {
    const absAccounts = accounts.map((a) => ({
      ...a,
      consumption: Math.abs(a.consumption),
      overage: Math.abs(a.overage),
      charged: Math.abs(a.charged),
      ai_charged: Math.abs(a.ai_charged),
      product_charged: Math.abs(a.product_charged),
    }));

    const chargedValues = absAccounts.map((a) => a.charged).filter((v) => v > 0);
    const medianCharged = median(chargedValues);
    const p75Charged = chargedValues.length > 0
      ? chargedValues.sort((a, b) => a - b)[Math.floor(chargedValues.length * 0.75)]
      : 0;

    const counts: Record<SignalType, number> = {
      overage: 0,
      ai_whitespace: 0,
      product_whitespace: 0,
      power_user: 0,
    };

    const scored: ScoredAccount[] = absAccounts
      .filter((a) => a.charged > 0)
      .map((a) => {
        const signals: SignalType[] = [];

        // Overage score (0-40): overage as % of charged
        const overagePct = a.charged > 0 ? (a.overage / a.charged) * 100 : 0;
        let overageScore = 0;
        if (overagePct > 0) {
          overageScore = Math.min(40, overagePct * 2); // 20% overage = 40 points
          signals.push("overage");
        }

        // AI whitespace score (0-30): inversely proportional to AI adoption
        const aiPct = a.charged > 0 ? (a.ai_charged / a.charged) * 100 : 0;
        let aiWhitespaceScore = 0;
        if (aiPct < 20 && a.product_charged > 0) {
          // Low AI adoption with product usage = cross-sell opportunity
          aiWhitespaceScore = Math.min(30, (1 - aiPct / 20) * 30);
          signals.push("ai_whitespace");
        } else if (aiPct > 80 && a.product_charged < a.ai_charged * 0.2) {
          // High AI but low product = product cross-sell
          aiWhitespaceScore = 15;
          signals.push("product_whitespace");
        }

        // Intensity score (0-30): usage relative to median
        let intensityScore = 0;
        if (medianCharged > 0 && a.charged > medianCharged) {
          const ratio = a.charged / medianCharged;
          intensityScore = Math.min(30, (ratio - 1) * 15);
          if (a.charged >= p75Charged) signals.push("power_user");
        }

        const score = Math.round(overageScore + aiWhitespaceScore + intensityScore);

        signals.forEach((s) => counts[s]++);

        return {
          account: a,
          score,
          overageScore: Math.round(overageScore),
          aiWhitespaceScore: Math.round(aiWhitespaceScore),
          intensityScore: Math.round(intensityScore),
          signals,
          overagePct,
          aiPct,
        };
      })
      .filter((a) => a.score > 0 || a.signals.length > 0);

    return { scored, signalCounts: counts };
  }, [accounts]);

  // ─── Filter and sort ──────────────────────────────

  const filtered = useMemo(() => {
    let list = scored;
    if (signalFilter !== "all") {
      list = list.filter((a) => a.signals.includes(signalFilter));
    }
    return [...list].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case "score": va = a.score; vb = b.score; break;
        case "name": va = a.account.sf_account_name; vb = b.account.sf_account_name; break;
        case "overage": va = a.overagePct; vb = b.overagePct; break;
        case "aiPct": va = a.aiPct; vb = b.aiPct; break;
        case "charged": va = a.account.charged; vb = b.account.charged; break;
        default: va = a.score; vb = b.score;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? va - (vb as number) : (vb as number) - va;
    });
  }, [scored, signalFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  // ─── Chart data: top 15 by score ──────────────────

  const chartData = useMemo(() => {
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((a) => ({
        name: a.account.sf_account_name.length > 20
          ? a.account.sf_account_name.slice(0, 20) + "…"
          : a.account.sf_account_name,
        fullName: a.account.sf_account_name,
        score: a.score,
        overage: a.overageScore,
        whitespace: a.aiWhitespaceScore,
        intensity: a.intensityScore,
      }));
  }, [scored]);

  // ─── Sort header helper ───────────────────────────

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

  if (scored.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Expansion Signals</h2>
        <Badge variant="secondary" className="text-[10px]">
          {scored.length} account{scored.length !== 1 ? "s" : ""} flagged
        </Badge>
      </div>

      {/* Signal Filter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card
          className={cn("cursor-pointer transition-colors", signalFilter === "all" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
          onClick={() => setSignalFilter("all")}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">All Signals</p>
            <p className="text-xl font-bold">{scored.length}</p>
          </CardContent>
        </Card>
        {(Object.entries(SIGNAL_DEFS) as [SignalType, ExpansionSignal][]).map(([type, def]) => {
          const Icon = def.icon;
          const count = signalCounts[type];
          return (
            <Card
              key={type}
              className={cn("cursor-pointer transition-colors", signalFilter === type ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
              onClick={() => setSignalFilter(signalFilter === type ? "all" : type)}
            >
              <CardContent className="pt-3 pb-3 px-4">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Icon className={cn("h-3 w-3", def.color)} />
                  {def.label}
                </p>
                <p className={cn("text-xl font-bold", count > 0 ? def.color : "text-muted-foreground")}>{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expansion Readiness Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 15 Expansion Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 28)}>
              <BarChart data={chartData} layout="vertical" barSize={16} margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip
                  formatter={(val: any, name: any) => [`${Number(val)} pts`, name === "overage" ? "Overage" : name === "whitespace" ? "Cross-Sell" : "Intensity"]}
                  labelFormatter={(l: any) => {
                    const item = chartData.find((d) => d.name === l);
                    return item?.fullName || l;
                  }}
                />
                <Bar dataKey="overage" stackId="s" fill="#f59e0b" name="Overage" radius={[0, 0, 0, 0]} />
                <Bar dataKey="whitespace" stackId="s" fill="#7c3aed" name="Cross-Sell" />
                <Bar dataKey="intensity" stackId="s" fill="#22c55e" name="Intensity" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Overage (0-40)</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-purple-600" /> Cross-Sell (0-30)</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Intensity (0-30)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Account Expansion Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b">
                  <SH label="Account" col="name" align="left" />
                  <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Owner</th>
                  <SH label="Score" col="score" />
                  <SH label="Total Charged" col="charged" />
                  <SH label="Overage %" col="overage" />
                  <SH label="AI %" col="aiPct" />
                  <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Signals</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((item) => (
                  <tr
                    key={item.account.sf_account_id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30 text-sm transition-colors",
                      onAccountClick && "cursor-pointer"
                    )}
                    onClick={() => onAccountClick?.(item.account.sf_account_id)}
                  >
                    <td className="py-2.5 px-2 font-medium max-w-[200px] truncate" title={item.account.sf_account_name}>
                      {item.account.sf_account_name}
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{item.account.sf_account_owner || "—"}</td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", scoreBg(item.score))} style={{ width: `${item.score}%` }} />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums w-6 text-right", scoreColor(item.score))}>
                          {item.score}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmtCurrency(item.account.charged)}</td>
                    <td className="py-2.5 px-2 text-right">
                      {item.overagePct > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums text-xs">
                          {item.overagePct.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">0%</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={cn(
                        "tabular-nums text-xs",
                        item.aiPct < 20 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-muted-foreground"
                      )}>
                        {item.aiPct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.signals.map((s) => {
                          const def = SIGNAL_DEFS[s];
                          const Icon = def.icon;
                          return (
                            <Badge
                              key={s}
                              variant="outline"
                              className={cn("text-[9px] gap-0.5 h-5", def.color)}
                            >
                              <Icon className="h-2.5 w-2.5" />
                              {def.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 50 && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Showing top 50 of {filtered.length} accounts
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
