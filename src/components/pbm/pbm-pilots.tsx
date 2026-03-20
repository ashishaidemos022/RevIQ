"use client";

import { useMemo, useState } from "react";
import { usePbmPilots } from "@/hooks/use-pbm-pilots";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { CreditPathBadge } from "@/components/pbm/credit-path-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

type PilotStatus = "Active" | "Converted" | "Expired" | "Lost";

const statusBadgeVariant: Record<PilotStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Active: "default",
  Converted: "secondary",
  Expired: "destructive",
  Lost: "destructive",
};

function getDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDuration(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function PbmPilots() {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const {
    data: pilotsData,
    isLoading,
    error,
    refetch,
  } = usePbmPilots();

  const pilots = pilotsData?.data || [];
  const kpis = pilotsData?.kpis;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  // Pilots at risk (Active with end date within 30 days)
  const atRiskPilots = useMemo(() => {
    return pilots
      .filter((o) => o.pilot_status === "Active" && o.paid_pilot_end_date)
      .map((o) => ({
        ...o,
        daysRemaining: getDaysRemaining(o.paid_pilot_end_date),
      }))
      .filter((o) => o.daysRemaining !== null && o.daysRemaining <= 30)
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
  }, [pilots]);

  const atRiskColumns: Column<Record<string, unknown>>[] = [
    {
      key: "account",
      header: "Account",
      render: (row) => (row.accounts as { name: string } | undefined)?.name || "—",
    },
    {
      key: "owner",
      header: "AE",
      render: (row) => (row.users as { full_name: string } | undefined)?.full_name || "—",
    },
    {
      key: "acv",
      header: "ACV",
      render: (row) => (row.acv ? formatCurrency(row.acv as number) : "—"),
    },
    { key: "paid_pilot_start_date", header: "Start Date" },
    { key: "paid_pilot_end_date", header: "End Date" },
    {
      key: "daysRemaining",
      header: "Days Left",
      render: (row) => {
        const days = row.daysRemaining as number;
        return (
          <span
            className={cn(
              "font-medium",
              days != null && days <= 7 ? "text-red-600" : "text-amber-600"
            )}
          >
            {days != null ? `${days}d` : "—"}
          </span>
        );
      },
    },
    {
      key: "credit_path",
      header: "Credit Path",
      render: (row) => <CreditPathBadge creditPath={row.credit_path as string | null} />,
    },
    {
      key: "credited_pbm_name",
      header: "PBM",
      render: (row) => (row.credited_pbm_name as string) || "—",
    },
  ];

  const allPilotColumns: Column<Record<string, unknown>>[] = [
    {
      key: "account",
      header: "Account",
      render: (row) => (row.accounts as { name: string } | undefined)?.name || "—",
    },
    {
      key: "owner",
      header: "AE",
      render: (row) => (row.users as { full_name: string } | undefined)?.full_name || "—",
    },
    {
      key: "acv",
      header: "ACV",
      render: (row) => (row.acv ? formatCurrency(row.acv as number) : "—"),
    },
    { key: "paid_pilot_start_date", header: "Pilot Start" },
    { key: "paid_pilot_end_date", header: "Pilot End" },
    {
      key: "stage",
      header: "Stage",
      render: (row) => <Badge variant="secondary">{row.stage as string}</Badge>,
    },
    {
      key: "duration",
      header: "Duration",
      render: (row) => {
        const d = getDuration(
          row.paid_pilot_start_date as string | null,
          row.is_closed_won
            ? (row.close_date as string | null)
            : (row.paid_pilot_end_date as string | null)
        );
        return d != null ? `${d}d` : "—";
      },
    },
    {
      key: "pilot_status",
      header: "Status",
      render: (row) => {
        const status = row.pilot_status as PilotStatus;
        return <Badge variant={statusBadgeVariant[status] || "outline"}>{status}</Badge>;
      },
    },
    {
      key: "credit_path",
      header: "Credit Path",
      render: (row) => <CreditPathBadge creditPath={row.credit_path as string | null} />,
    },
    {
      key: "partner_name",
      header: "Partner",
      render: (row) => (row.partner_name as string) || "—",
    },
    {
      key: "credited_pbm_name",
      header: "PBM",
      render: (row) => (row.credited_pbm_name as string) || "—",
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load PBM pilot data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">PBM Paid Pilots</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Active Pilots" value={kpis?.active || 0} format="number" />
        <KpiCard label="Total Pilot ACV" value={kpis?.total_acv || 0} format="currency" />
        <KpiCard label="Conversion Rate" value={kpis?.conversion_rate || 0} format="percent" />
        <KpiCard label="Avg Pilot Duration" value={`${kpis?.avg_duration || 0}d`} />
        <KpiCard label="Expiring Within 30 Days" value={kpis?.expiring_30d || 0} format="number" />
      </div>

      {/* Pilots at Risk */}
      {atRiskPilots.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Pilots at Risk — Expiring Within 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={atRiskPilots as unknown as Record<string, unknown>[]}
              columns={atRiskColumns}
              pageSize={10}
              onRowClick={(row) => setSelectedOpp(row.id as string)}
            />
          </CardContent>
        </Card>
      )}

      {/* All Pilots Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">All Credited Pilots</CardTitle>
        </CardHeader>
        <CardContent>
          {pilots.length === 0 ? (
            <EmptyState
              title="No credited paid pilots"
              description="No paid pilot opportunities are credited to PBMs"
              icon={FlaskConical}
            />
          ) : (
            <DataTable
              data={pilots as unknown as Record<string, unknown>[]}
              columns={allPilotColumns}
              pageSize={25}
              onRowClick={(row) => setSelectedOpp(row.id as string)}
            />
          )}
        </CardContent>
      </Card>

      <OpportunityDrawer
        opportunityId={selectedOpp}
        open={!!selectedOpp}
        onClose={() => setSelectedOpp(null)}
      />
    </div>
  );
}
