"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { MANAGER_PLUS_ROLES } from "@/lib/constants";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, List, Search, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareSelectionBar } from "@/components/team/compare-selection-bar";
import { ComparePanel } from "@/components/team/compare-panel";
import { GroupedRosterTable } from "@/components/team/grouped-roster-table";

interface AeData {
  id: string;
  full_name: string;
  email: string;
  role: string;
  region: string | null;
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  annual_quota: number;
  quarterly_quota: number;
  attainment: number;
  attainment_qtd: number;
  active_pilots: number;
  activities_qtd: number;
  commission_qtd: number;
  is_leader_aggregate?: boolean;
  team_size?: number;
}

interface ManagerGroup {
  managerId: string | null;
  managerName: string;
  managerRole: string;
  memberIds: string[];
  memberCount: number;
  summary: {
    acvClosedQTD: number;
    acvClosedYTD: number;
    avgAttainmentQTD: number;
    avgAttainmentYTD: number;
    activePilots: number;
    activitiesQTD: number;
    commissionQTD: number;
  };
}

interface TeamResponse {
  data: {
    aes: AeData[];
    summary: {
      acvClosedQTD: number;
      avgAttainment: number;
      avgAttainmentQTD: number;
      activePilots: number;
      activitiesQTD: number;
    };
    managerGroups: ManagerGroup[];
  };
}

type SelectionMode = "none" | "individual" | "team";
type RosterView = "flat" | "grouped";

const MAX_COMPARE = 4;

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "commercial_ae", label: "Commercial AE" },
  { value: "enterprise_ae", label: "Enterprise AE" },
  { value: "pbm", label: "PBM" },
  { value: "leader", label: "Leader" },
];

export default function TeamPage() {
  const user = useAuthStore((s) => s.user);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("none");
  const [viewMode, setViewMode] = useState<"roster" | "compare">("roster");
  const [rosterView, setRosterView] = useState<RosterView>("flat");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Reset selection when ViewAs changes
  const viewAsId = viewAsUser?.user_id ?? null;
  const prevViewAsRef = useRef(viewAsId);
  if (prevViewAsRef.current !== viewAsId) {
    prevViewAsRef.current = viewAsId;
    clearSelection();
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectionMode("none");
    setViewMode("roster");
  }

  const {
    data: teamData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["team", viewAsId],
    queryFn: () => apiFetch<TeamResponse>("/api/team"),
    enabled: !!isManager,
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  const formatRole = (role: string) => {
    const map: Record<string, string> = {
      other: "Other", commercial_ae: "Commercial AE", enterprise_ae: "Enterprise AE",
      pbm: "PBM", leader: "Leader",
    };
    return map[role] || role;
  };

  const renderAttainment = (val: number) => (
    <span
      className={cn(
        "font-medium",
        val >= 75 ? "text-green-600" : val >= 50 ? "text-amber-600" : val > 0 ? "text-red-600" : "text-muted-foreground"
      )}
    >
      {val > 0 ? `${val.toFixed(1)}%` : "—"}
    </span>
  );

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "full_name",
      header: "Name",
      render: (row) => (
        <span className={row.is_leader_aggregate ? "font-semibold" : ""}>
          {row.full_name as string}
          {row.is_leader_aggregate ? (
            <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
              ({row.team_size as number} reports)
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge variant={row.is_leader_aggregate ? "default" : "outline"} className="text-[10px]">
          {formatRole(row.role as string)}
        </Badge>
      ),
    },
    {
      key: "region",
      header: "Region",
      render: (row) => (row.region as string) || "—",
    },
    {
      key: "acv_closed_qtd",
      header: "ACV Closed QTD",
      render: (row) => formatCurrency(row.acv_closed_qtd as number),
    },
    {
      key: "acv_closed_ytd",
      header: "ACV Closed YTD",
      render: (row) => formatCurrency(row.acv_closed_ytd as number),
    },
    {
      key: "annual_quota",
      header: "Annual Quota",
      render: (row) => row.is_leader_aggregate ? "—" : formatCurrency(row.annual_quota as number),
    },
    {
      key: "attainment_qtd",
      header: "Attainment QTD",
      render: (row) => row.is_leader_aggregate ? `Avg ${(row.attainment_qtd as number).toFixed(1)}%` : renderAttainment(row.attainment_qtd as number),
    },
    {
      key: "attainment",
      header: "Attainment YTD",
      render: (row) => row.is_leader_aggregate ? `Avg ${(row.attainment as number).toFixed(1)}%` : renderAttainment(row.attainment as number),
    },
    {
      key: "active_pilots",
      header: "Active Pilots",
      render: (row) => row.active_pilots as number,
    },
    {
      key: "activities_qtd",
      header: "Activities QTD",
      render: (row) => (row.activities_qtd as number).toLocaleString(),
    },
  ];

  const { aes, summary, managerGroups } = teamData?.data || {
    aes: [],
    summary: { acvClosedQTD: 0, avgAttainment: 0, avgAttainmentQTD: 0, activePilots: 0, activitiesQTD: 0 },
    managerGroups: [],
  };

  // Apply search and role filter
  const filteredAes = useMemo(() => {
    return aes.filter((ae) => {
      const matchesSearch =
        !searchQuery || ae.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || ae.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [aes, searchQuery, roleFilter]);

  // Filter manager groups based on filtered AEs
  const filteredManagerGroups = useMemo(() => {
    if (!searchQuery && roleFilter === "all") return managerGroups;
    const filteredIds = new Set(filteredAes.map((ae) => ae.id));
    return managerGroups
      .map((group) => ({
        ...group,
        memberIds: group.memberIds.filter((id) => filteredIds.has(id)),
      }))
      .filter((group) => group.memberIds.length > 0)
      .map((group) => ({
        ...group,
        memberCount: group.memberIds.length,
        // Recompute summary for filtered members
        summary: (() => {
          const members = group.memberIds.map((id) => filteredAes.find((ae) => ae.id === id)!).filter(Boolean);
          const withQuota = members.filter((m) => m.annual_quota > 0);
          const withQQuota = members.filter((m) => m.quarterly_quota > 0);
          return {
            acvClosedQTD: members.reduce((s, m) => s + m.acv_closed_qtd, 0),
            acvClosedYTD: members.reduce((s, m) => s + m.acv_closed_ytd, 0),
            avgAttainmentQTD: withQQuota.length > 0
              ? withQQuota.reduce((s, m) => s + m.attainment_qtd, 0) / withQQuota.length
              : 0,
            avgAttainmentYTD: withQuota.length > 0
              ? withQuota.reduce((s, m) => s + m.attainment, 0) / withQuota.length
              : 0,
            activePilots: members.reduce((s, m) => s + m.active_pilots, 0),
            activitiesQTD: members.reduce((s, m) => s + m.activities_qtd, 0),
            commissionQTD: members.reduce((s, m) => s + m.commission_qtd, 0),
          };
        })(),
      }));
  }, [managerGroups, filteredAes, searchQuery, roleFilter]);

  const canShowCompare = aes.length >= 2 || managerGroups.length >= 2;

  // Resolve selected entities for compare — either AEs or manager names
  const selectedAes = useMemo(
    () => aes.filter((ae) => selectedIds.has(ae.id)),
    [aes, selectedIds]
  );

  const selectedManagerGroups = useMemo(
    () => managerGroups.filter((g) => g.managerId && selectedIds.has(g.managerId)),
    [managerGroups, selectedIds]
  );

  // Build names for the selection bar
  const selectedNames = useMemo(() => {
    if (selectionMode === "team") {
      return selectedManagerGroups.map((g) => `${g.managerName}'s Team`);
    }
    return selectedAes.map((ae) => ae.full_name);
  }, [selectionMode, selectedAes, selectedManagerGroups]);

  // Build AeData-compatible objects for team compare (using group summaries)
  const compareEntities = useMemo(() => {
    if (selectionMode === "team") {
      return selectedManagerGroups.map((g) => ({
        id: g.managerId!,
        full_name: g.managerName,
        email: "",
        role: g.managerRole,
        region: null,
        acv_closed_qtd: g.summary.acvClosedQTD,
        acv_closed_ytd: g.summary.acvClosedYTD,
        annual_quota: 0,
        quarterly_quota: 0,
        attainment: g.summary.avgAttainmentYTD,
        attainment_qtd: g.summary.avgAttainmentQTD,
        active_pilots: g.summary.activePilots,
        activities_qtd: g.summary.activitiesQTD,
        commission_qtd: g.summary.commissionQTD,
      }));
    }
    return selectedAes;
  }, [selectionMode, selectedAes, selectedManagerGroups]);

  // Clear selection when switching roster view or filters change
  const handleRosterViewChange = (view: RosterView) => {
    setRosterView(view);
    clearSelection();
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleRoleFilterChange = (role: string | null) => {
    if (!role) return;
    setRoleFilter(role);
  };

  if (!isManager) {
    return (
      <EmptyState
        title="Access Restricted"
        description="Team View is available for Managers and above"
        icon={Users}
      />
    );
  }

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load team data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Network className="h-6 w-6" />
        Team View
      </h1>

      {viewMode === "compare" && compareEntities.length >= 2 ? (
        <ComparePanel
          selectedAes={compareEntities}
          onBack={() => setViewMode("roster")}
          mode={selectionMode === "team" ? "team" : "individual"}
        />
      ) : (
        <>
          {/* Team KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Total ACV Closed (QTD)" value={summary.acvClosedQTD} format="currency" />
            <KpiCard label="Avg Attainment QTD" value={summary.avgAttainmentQTD} format="percent" />
            <KpiCard label="Avg Attainment YTD" value={summary.avgAttainment} format="percent" />
            <KpiCard label="Total Active Pilots" value={summary.activePilots} format="number" />
            <KpiCard label="Total Activities QTD" value={summary.activitiesQTD} format="number" />
          </div>

          {/* Team Roster Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-medium">
                  Team Roster
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({filteredAes.length} of {aes.length})
                  </span>
                </CardTitle>

                <div className="flex items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by name..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="h-8 w-[180px] pl-8 text-xs"
                    />
                  </div>

                  {/* Role Filter */}
                  <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_FILTER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* View Toggle */}
                  {managerGroups.length > 1 && (
                    <div className="flex rounded-md border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 rounded-r-none px-2.5",
                          rosterView === "flat" && "bg-muted"
                        )}
                        onClick={() => handleRosterViewChange("flat")}
                        title="Flat view"
                      >
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 rounded-l-none px-2.5",
                          rosterView === "grouped" && "bg-muted"
                        )}
                        onClick={() => handleRosterViewChange("grouped")}
                        title="Grouped by manager"
                      >
                        <Network className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAes.length === 0 ? (
                <EmptyState
                  title="No team members"
                  description={
                    searchQuery || roleFilter !== "all"
                      ? "No members match the current filters"
                      : "No AEs found in your org tree"
                  }
                  icon={Users}
                />
              ) : rosterView === "grouped" && filteredManagerGroups.length > 0 ? (
                <GroupedRosterTable
                  aes={filteredAes}
                  managerGroups={filteredManagerGroups}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  selectionMode={selectionMode}
                  onSelectionModeChange={setSelectionMode}
                  maxSelections={MAX_COMPARE}
                />
              ) : (
                <DataTable
                  data={filteredAes as unknown as Record<string, unknown>[]}
                  columns={columns}
                  pageSize={25}
                  selectable={canShowCompare}
                  selectedKeys={selectedIds}
                  onSelectionChange={(ids) => {
                    setSelectedIds(ids);
                    setSelectionMode(ids.size > 0 ? "individual" : "none");
                  }}
                  rowKey={(row) => row.id as string}
                  maxSelections={MAX_COMPARE}
                />
              )}
            </CardContent>
          </Card>

          {/* Compare Selection Bar */}
          {canShowCompare && (
            <CompareSelectionBar
              count={selectedIds.size}
              maxSelections={MAX_COMPARE}
              selectedNames={selectedNames}
              mode={selectionMode === "team" ? "team" : "individual"}
              onCompare={() => setViewMode("compare")}
              onClear={clearSelection}
            />
          )}
        </>
      )}
    </div>
  );
}
