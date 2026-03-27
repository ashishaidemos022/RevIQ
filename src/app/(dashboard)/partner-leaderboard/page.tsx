"use client";

import { useState, useMemo, useCallback } from "react";
import { useFilterParam } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Building2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartnerDetailDrawer } from "@/components/dashboard/partner-detail-drawer";

interface PartnerEntry {
  rank: number;
  partner_id: string;
  partner_name: string;
  partner_type: string | null;
  pbm_name: string | null;
  region: string | null;
  primary_metric: number;
  secondary_metrics: Record<string, number>;
}

type SortDir = "asc" | "desc";
type SortKey = string;

function useSort(defaultKey: SortKey = "rank", defaultDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<SortKey>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" || key === "partner_name" || key === "partner_type" || key === "pbm_name" || key === "region" ? "asc" : "desc");
    }
  }, [sortKey]);

  return { sortKey, sortDir, toggle };
}

function getValue(entry: PartnerEntry, key: SortKey): string | number {
  if (key === "rank") return entry.rank;
  if (key === "partner_name") return entry.partner_name;
  if (key === "partner_type") return entry.partner_type || "";
  if (key === "pbm_name") return entry.pbm_name || "";
  if (key === "region") return entry.region || "";
  if (key === "primary_metric") return entry.primary_metric;
  return entry.secondary_metrics[key] || 0;
}

function sortEntries(entries: PartnerEntry[], key: SortKey, dir: SortDir): PartnerEntry[] {
  return [...entries].sort((a, b) => {
    const va = getValue(a, key);
    const vb = getValue(b, key);
    let cmp: number;
    if (typeof va === "string" && typeof vb === "string") {
      cmp = va.localeCompare(vb);
    } else {
      cmp = (va as number) - (vb as number);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortHeader({
  label,
  sortKey: colKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = colKey === currentKey;
  return (
    <th
      className={cn(
        "py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        className
      )}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && isActive && (
          currentDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        )}
        {align === "right" && !isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
        {label}
        {align === "left" && isActive && (
          currentDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        )}
        {align === "left" && !isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}

const REGIONS = [
  { value: "combined", label: "All Regions" },
  { value: "AMER", label: "AMER" },
  { value: "EMEA", label: "EMEA" },
  { value: "APAC", label: "APAC" },
] as const;

const BOARDS = [
  { id: "revenue", label: "Revenue" },
  { id: "pipeline", label: "Pipeline" },
  { id: "pilots", label: "Paid Pilots" },
] as const;

const PERIODS = [
  { value: "qtd", label: "QTD" },
  { value: "prev_qtd", label: "PQ" },
  { value: "ytd", label: "YTD" },
];

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-bold text-lg">🥇</span>;
  if (rank === 2) return <span className="text-gray-400 font-bold text-lg">🥈</span>;
  if (rank === 3) return <span className="text-amber-700 font-bold text-lg">🥉</span>;
  return <span className="text-muted-foreground text-sm font-medium w-6 text-center">{rank}</span>;
}

function RevenueBoard({ entries, onRowClick }: { entries: PartnerEntry[]; onRowClick: (id: string) => void }) {
  const { sortKey, sortDir, toggle } = useSort("rank", "asc");
  const sorted = useMemo(() => sortEntries(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggle };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <SortHeader label="Rank" sortKey="rank" {...hp} className="w-12" />
            <SortHeader label="Partner Name" sortKey="partner_name" {...hp} />
            <SortHeader label="Partner Type" sortKey="partner_type" {...hp} />
            <SortHeader label="PBM Name" sortKey="pbm_name" {...hp} />
            <SortHeader label="Region" sortKey="region" {...hp} className="w-20" />
            <SortHeader label="ACV Closed w/ Multiplier" sortKey="acv_closed_multiplier" {...hp} align="right" />
            <SortHeader label="ACV Closed" sortKey="acv_closed" {...hp} align="right" />
            <SortHeader label="Deals" sortKey="deals" {...hp} align="right" className="w-16" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr
              key={e.partner_id}
              className={cn(
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20"
              )}
              onClick={() => onRowClick(e.partner_id)}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">{e.partner_name}</td>
              <td className="py-2 px-2 text-muted-foreground text-xs">{e.partner_type || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.pbm_name || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.region || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{formatCurrency(e.secondary_metrics.acv_closed_multiplier || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.acv_closed || 0)}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.deals || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineBoard({ entries, onRowClick }: { entries: PartnerEntry[]; onRowClick: (id: string) => void }) {
  const { sortKey, sortDir, toggle } = useSort("primary_metric", "desc");
  const sorted = useMemo(() => sortEntries(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggle };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[950px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <SortHeader label="Rank" sortKey="rank" {...hp} className="w-12" />
            <SortHeader label="Partner Name" sortKey="partner_name" {...hp} />
            <SortHeader label="Partner Type" sortKey="partner_type" {...hp} />
            <SortHeader label="PBM Name" sortKey="pbm_name" {...hp} />
            <SortHeader label="Region" sortKey="region" {...hp} className="w-20" />
            <SortHeader label="Total ACV Created" sortKey="primary_metric" {...hp} align="right" />
            <SortHeader label="Partner Sourced" sortKey="partner_sourced" {...hp} align="right" />
            <SortHeader label="Partner Influenced" sortKey="partner_influenced" {...hp} align="right" />
            <SortHeader label="Deals" sortKey="deals" {...hp} align="right" className="w-16" />
            <SortHeader label="Avg Size" sortKey="avg_size" {...hp} align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr
              key={e.partner_id}
              className={cn(
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20"
              )}
              onClick={() => onRowClick(e.partner_id)}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">{e.partner_name}</td>
              <td className="py-2 px-2 text-muted-foreground text-xs">{e.partner_type || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.pbm_name || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.region || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{formatCurrency(e.primary_metric)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.partner_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.partner_influenced || 0)}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.deals || 0}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.avg_size || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PilotsBoard({ entries, onRowClick }: { entries: PartnerEntry[]; onRowClick: (id: string) => void }) {
  const { sortKey, sortDir, toggle } = useSort("primary_metric", "desc");
  const sorted = useMemo(() => sortEntries(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggle };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <SortHeader label="Rank" sortKey="rank" {...hp} className="w-12" />
            <SortHeader label="Partner Name" sortKey="partner_name" {...hp} />
            <SortHeader label="Partner Type" sortKey="partner_type" {...hp} />
            <SortHeader label="PBM Name" sortKey="pbm_name" {...hp} />
            <SortHeader label="Region" sortKey="region" {...hp} className="w-20" />
            <SortHeader label="Booked Paid Pilots" sortKey="primary_metric" {...hp} align="right" />
            <SortHeader label="Open Pilots" sortKey="open_pilots" {...hp} align="right" />
            <SortHeader label="Avg Duration" sortKey="avg_duration" {...hp} align="right" />
            <SortHeader label="Numbers Created" sortKey="num_created" {...hp} align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr
              key={e.partner_id}
              className={cn(
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20"
              )}
              onClick={() => onRowClick(e.partner_id)}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">{e.partner_name}</td>
              <td className="py-2 px-2 text-muted-foreground text-xs">{e.partner_type || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.pbm_name || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.region || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{e.primary_metric}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.open_pilots || 0}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.avg_duration || 0}d</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.num_created || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PartnerLeaderboardPage() {
  const [board, setBoard] = useFilterParam("board", "revenue");
  const [period, setPeriod] = useFilterParam("period", "qtd");
  const [region, setRegion] = useFilterParam("region", "combined");
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["partner-leaderboard", board, period, region],
    queryFn: () =>
      apiFetch<{ data: PartnerEntry[] }>(
        `/api/partner-leaderboard?board=${board}&period=${period}&region=${region}`
      ),
  });

  const entries = data?.data || [];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load Partner leaderboard" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Partner Leaderboards
          </h1>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5 gap-0.5">
            {REGIONS.map((r) => (
              <Button
                key={r.value}
                variant={region === r.value ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-3"
                onClick={() => setRegion(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Tabs value={board} onValueChange={(v) => { setBoard(v); setPeriod("qtd"); }}>
        <TabsList>
          {BOARDS.map((b) => (
            <TabsTrigger key={b.id} value={b.id}>
              {b.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No revenue data for the selected period" icon={Building2} />
              ) : (
                <RevenueBoard entries={entries} onRowClick={setSelectedPartner} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pipeline data available" icon={Building2} />
              ) : (
                <PipelineBoard entries={entries} onRowClick={setSelectedPartner} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilots" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pilot data available" icon={Building2} />
              ) : (
                <PilotsBoard entries={entries} onRowClick={setSelectedPartner} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PartnerDetailDrawer
        partnerId={selectedPartner}
        open={!!selectedPartner}
        onClose={() => setSelectedPartner(null)}
        board={board}
        period={period}
      />
    </div>
  );
}
