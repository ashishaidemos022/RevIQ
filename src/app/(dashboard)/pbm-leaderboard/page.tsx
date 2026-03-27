"use client";

import { useState } from "react";
import { useFilterParam } from "@/hooks/use-filter-param";
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
import { Handshake, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaderboardEntry } from "@/types";
import { UserDetailDrawer } from "@/components/dashboard/user-detail-drawer";

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

function RevenueBoard({ entries, onRowClick }: { entries: LeaderboardEntry[]; onRowClick?: (userId: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[750px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">PBM Name</th>
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
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
              onClick={() => onRowClick?.(e.user_id)}
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

function PipelineBoard({ entries, onRowClick }: { entries: LeaderboardEntry[]; onRowClick?: (userId: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">PBM Name</th>
            <th className="text-left py-2 px-2">Manager</th>
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
              key={e.user_id}
              className={cn(
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
              onClick={() => onRowClick?.(e.user_id)}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-muted-foreground">{e.manager_name || "—"}</td>
              <td className="py-2 px-2 text-muted-foreground">{e.region || "—"}</td>
              <td className="py-2 px-2 text-right font-medium">{formatCurrency(e.primary_metric)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.partner_sourced || 0)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.partner_influenced || 0)}</td>
              <td className="py-2 px-2 text-right">{e.secondary_metrics.open_deals || 0}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(e.secondary_metrics.avg_deal_size || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PilotsBoard({ entries, onRowClick }: { entries: LeaderboardEntry[]; onRowClick?: (userId: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[750px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b">
            <th className="text-left py-2 px-2 w-12">Rank</th>
            <th className="text-left py-2 px-2">PBM Name</th>
            <th className="text-left py-2 px-2">Manager</th>
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
              key={e.user_id}
              className={cn(
                "text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                e.rank <= 3 && "bg-amber-50/50 dark:bg-amber-950/20",
                e.is_current_user && "bg-primary/5 ring-1 ring-primary/20"
              )}
              onClick={() => onRowClick?.(e.user_id)}
            >
              <td className="py-2 px-2"><RankBadge rank={e.rank} /></td>
              <td className="py-2 px-2 font-medium">
                {e.full_name}
                {e.is_current_user && <span className="ml-2 text-xs text-primary font-semibold">(You)</span>}
              </td>
              <td className="py-2 px-2 text-muted-foreground">{e.manager_name || "—"}</td>
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

export default function PbmLeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [board, setBoard] = useFilterParam("board", "revenue");
  const [period, setPeriod] = useFilterParam("period", "qtd");
  const [region, setRegion] = useFilterParam("region", "combined");
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Fetch available managers for PBMs
  const { data: managersData } = useQuery({
    queryKey: ["pbm-leaderboard-managers"],
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; full_name: string; region: string | null }> }>(
        "/api/pbm-leaderboard/managers"
      ),
  });
  const managers = managersData?.data || [];

  const managerIdsParam = selectedManagerIds.length > 0 && selectedManagerIds.length < managers.length
    ? selectedManagerIds.join(",")
    : "";

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["pbm-leaderboard", board, period, region, managerIdsParam],
    queryFn: () =>
      apiFetch<{ data: LeaderboardEntry[] }>(
        `/api/pbm-leaderboard?board=${board}&period=${period}&region=${region}${managerIdsParam ? `&manager_ids=${managerIdsParam}` : ""}`
      ),
  });

  const entries = data?.data || [];

  const handleManagerToggle = (managerId: string) => {
    setSelectedManagerIds((prev) => {
      const next = prev.includes(managerId)
        ? prev.filter((id) => id !== managerId)
        : [...prev, managerId];
      if (next.length > 0 && next.length < managers.length) {
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
  if (error) return <ErrorState message="Failed to load PBM leaderboard" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Handshake className="h-6 w-6" />
            PBM Leaderboards
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setBoard("revenue");
              setPeriod("qtd");
              setRegion("combined");
              setSelectedManagerIds([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
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
          {managers.length > 0 && (
            <>
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
            </>
          )}
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
                <EmptyState title="No data" description="No revenue data for the selected period" icon={Handshake} />
              ) : (
                <RevenueBoard entries={entries} onRowClick={setSelectedUserId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pipeline data available" icon={Handshake} />
              ) : (
                <PipelineBoard entries={entries} onRowClick={setSelectedUserId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilots" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {entries.length === 0 ? (
                <EmptyState title="No data" description="No pilot data available" icon={Handshake} />
              ) : (
                <PilotsBoard entries={entries} onRowClick={setSelectedUserId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UserDetailDrawer
        userId={selectedUserId}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        board={board}
        period={period}
        apiPrefix="/api/pbm-leaderboard"
      />
    </div>
  );
}
