"use client";

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
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

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
  };
}

export default function TeamPage() {
  const user = useAuthStore((s) => s.user);
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  const {
    data: teamData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["team"],
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
    { key: "full_name", header: "Name" },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge variant="outline" className="text-[10px]">
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
      render: (row) => formatCurrency(row.annual_quota as number),
    },
    {
      key: "attainment_qtd",
      header: "Attainment QTD",
      render: (row) => renderAttainment(row.attainment_qtd as number),
    },
    {
      key: "attainment",
      header: "Attainment YTD",
      render: (row) => renderAttainment(row.attainment as number),
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
    {
      key: "commission_qtd",
      header: "Commission QTD",
      render: (row) => formatCurrency(row.commission_qtd as number),
    },
  ];

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

  const { aes, summary } = teamData?.data || { aes: [], summary: { acvClosedQTD: 0, avgAttainment: 0, avgAttainmentQTD: 0, activePilots: 0, activitiesQTD: 0 } };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Users className="h-6 w-6" />
        Team View
      </h1>

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
          <CardTitle className="text-sm font-medium">Team Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {aes.length === 0 ? (
            <EmptyState
              title="No team members"
              description="No AEs found in your org tree"
              icon={Users}
            />
          ) : (
            <DataTable
              data={aes as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={25}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
