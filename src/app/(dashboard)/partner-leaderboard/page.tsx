"use client";

import { useState } from "react";
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
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartnerDetailDrawer } from "@/components/dashboard/partner-detail-drawer";

interface PartnerEntry {
  rank: number;
  partner_id: string;
  partner_name: string;
  pbm_name: string | null;
  region: string | null;
  primary_metric: number;
  secondary_metrics: Record<string, number>;
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">Partner Name</th>
            <th className="text-left py-2 px-2">PBM Name</th>
            <th className="text-left py-2 px-2 w-20">Region</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">ACV Closed w/ Multiplier</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">ACV Closed</th>
            <th className="text-right py-2 px-2 w-16">Deals</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[950px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">Partner Name</th>
            <th className="text-left py-2 px-2">PBM Name</th>
            <th className="text-left py-2 px-2 w-20">Region</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Total ACV Created</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Partner Sourced</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Partner Influenced</th>
            <th className="text-right py-2 px-2 w-16">Deals</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Avg Size</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">Partner Name</th>
            <th className="text-left py-2 px-2">PBM Name</th>
            <th className="text-left py-2 px-2 w-20">Region</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Booked Paid Pilots</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Open Pilots</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Avg Duration</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Numbers Created</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
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
  const [board, setBoard] = useState("revenue");
  const [period, setPeriod] = useState("qtd");
  const [region, setRegion] = useState("combined");
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
            Partner Leaderboard
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
      />
    </div>
  );
}
