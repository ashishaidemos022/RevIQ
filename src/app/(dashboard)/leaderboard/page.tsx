"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Trophy, Medal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaderboardEntry } from "@/types";

const AE_TYPES = [
  { value: "combined", label: "Combined" },
  { value: "commercial", label: "Commercial AE" },
  { value: "enterprise", label: "Enterprise AE" },
] as const;

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
  { id: "activities", label: "Activities" },
] as const;

const REVENUE_PERIODS = [
  { value: "qtd", label: "QTD" },
  { value: "prev_qtd", label: "PQ" },
  { value: "ytd", label: "YTD" },
];

const PIPELINE_PERIODS = [
  { value: "qtd", label: "QTD" },
  { value: "prev_qtd", label: "PQ" },
  { value: "ytd", label: "YTD" },
];

const PILOT_PERIODS = [
  { value: "qtd", label: "QTD" },
  { value: "prev_qtd", label: "PQ" },
  { value: "ytd", label: "YTD" },
];

const ACTIVITY_PERIODS = [
  { value: "mtd", label: "MTD" },
  { value: "qtd", label: "QTD" },
  { value: "prev_qtd", label: "PQ" },
];

function getPeriods(board: string) {
  switch (board) {
    case "pipeline": return PIPELINE_PERIODS;
    case "pilots": return PILOT_PERIODS;
    case "activities": return ACTIVITY_PERIODS;
    default: return REVENUE_PERIODS;
  }
}

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

function RevenueBoard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[750px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">AE Name</th>
            <th className="text-left py-2 px-2">Manager</th>
            <th className="text-left py-2 px-2 w-20">Region</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">ACV Closed w/ Multiplier</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">ACV Closed</th>
            <th className="text-right py-2 px-2 w-16">Deals</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.user_id}
              className={cn(
                "text-sm",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-muted-foreground">{e.manager_name || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.region || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{formatCurrency(e.primary_metric)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.acv_closed || 0)}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.deals_closed || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineBoard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">AE Name</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Total ACV Created</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">AE Sourced</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Sales Sourced</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Mktg Sourced</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Partner Sourced</th>
            <th className="text-right py-2 px-2 w-16">Deals</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Avg Size</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.user_id}
              className={cn(
                "text-sm",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-right font-medium">{formatCurrency(e.primary_metric)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.ae_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.sales_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.marketing_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.partner_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.open_deals || 0}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.avg_deal_size || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PilotsBoard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">AE Name</th>
            <th className="text-left py-2 px-2">Manager</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Booked Paid Pilots</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Open Pilots</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Avg Duration</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Number Created</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.user_id}
              className={cn(
                "text-sm",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-muted-foreground">{e.manager_name || "—"}</td>
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

function ActivitiesBoard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">AE Name</th>
            <th className="text-left py-2 px-2">Manager</th>
            <th className="text-right py-2 px-2">Total</th>
            <th className="text-right py-2 px-2">Calls</th>
            <th className="text-right py-2 px-2">Emails</th>
            <th className="text-right py-2 px-2">Meetings</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">LinkedIn Activity</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.user_id}
              className={cn(
                "text-sm",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-muted-foreground">{e.manager_name || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{e.primary_metric}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.calls || 0}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.emails || 0}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.meetings || 0}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.linkedin || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [board, setBoard] = useState("revenue");
  const [period, setPeriod] = useState("qtd");
  const [aeType, setAeType] = useState("combined");
  const [region, setRegion] = useState("combined");
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);

  // Fetch available managers
  const { data: managersData } = useQuery({
    queryKey: ["leaderboard-managers"],
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; full_name: string; region: string | null }> }>(
        "/api/leaderboard/managers"
      ),
  });
  const managers = managersData?.data || [];

  // Build manager_ids param: empty = all managers (no filter)
  const managerIdsParam = selectedManagerIds.length > 0 && selectedManagerIds.length < managers.length
    ? selectedManagerIds.join(",")
    : "";

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["leaderboard", board, period, aeType, region, managerIdsParam],
    queryFn: () =>
      apiFetch<{ data: LeaderboardEntry[] }>(
        `/api/leaderboard?board=${board}&period=${period}&ae_type=${aeType}&region=${region}${managerIdsParam ? `&manager_ids=${managerIdsParam}` : ""}`
      ),
  });

  const entries = data?.data || [];
  const visibleEntries = entries;

  const periods = getPeriods(board);

  // When specific managers are selected, reset AE type and region to combined
  const handleManagerToggle = (managerId: string) => {
    setSelectedManagerIds((prev) => {
      const next = prev.includes(managerId)
        ? prev.filter((id) => id !== managerId)
        : [...prev, managerId];
      // If specific managers are now selected (not all), reset filters
      if (next.length > 0 && next.length < managers.length) {
        setAeType("combined");
        setRegion("combined");
      }
      return next;
    });
  };

  const handleSelectAllManagers = () => {
    setSelectedManagerIds([]);
  };

  const isAllManagersSelected = selectedManagerIds.length === 0 || selectedManagerIds.length === managers.length;
  const managerLabel = isAllManagersSelected
    ? "All Managers"
    : selectedManagerIds.length === 1
      ? managers.find((m) => m.id === selectedManagerIds[0])?.full_name || "1 Manager"
      : `${selectedManagerIds.length} Managers`;

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load leaderboard" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            AE Leaderboard
          </h1>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5 gap-0.5">
            {AE_TYPES.map((t) => (
              <Button
                key={t.value}
                variant={aeType === t.value ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-3"
                onClick={() => setAeType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="hidden sm:block w-px h-6 bg-border" />
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
          <div className="hidden sm:block w-px h-6 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-7 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {managerLabel}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuCheckboxItem
                checked={isAllManagersSelected}
                onCheckedChange={handleSelectAllManagers}
              >
                All Managers
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {managers.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.id}
                  checked={selectedManagerIds.includes(m.id)}
                  onCheckedChange={() => handleManagerToggle(m.id)}
                >
                  {m.full_name}
                  {m.region && <span className="ml-auto text-xs text-muted-foreground">{m.region}</span>}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={board} onValueChange={(v) => { setBoard(v); setPeriod(getPeriods(v)[0].value); }}>
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
                <EmptyState title="No data" description="No revenue data for the selected period" icon={Trophy} />
              ) : (
                <RevenueBoard entries={visibleEntries} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pipeline data available" icon={Trophy} />
              ) : (
                <PipelineBoard entries={visibleEntries} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilots" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pilot data available" icon={Trophy} />
              ) : (
                <PilotsBoard entries={visibleEntries} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No activity data for the selected period" icon={Trophy} />
              ) : (
                <ActivitiesBoard entries={visibleEntries} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
