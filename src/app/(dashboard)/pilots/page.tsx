"use client";

import { useMemo, useState } from "react";
import { useOpportunities } from "@/hooks/use-opportunities";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

type PilotStatus = "Active" | "Converted" | "Expired" | "Lost";

function getPilotStatus(opp: Record<string, unknown>): PilotStatus {
  if (opp.is_closed_won) return "Converted";
  if (opp.is_closed_lost) return "Lost";
  if (opp.paid_pilot_end_date) {
    const endDate = new Date(opp.paid_pilot_end_date as string);
    if (endDate < new Date()) return "Expired";
  }
  return "Active";
}

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

const statusBadgeVariant: Record<PilotStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Active: "default",
  Converted: "secondary",
  Expired: "destructive",
  Lost: "destructive",
};

export default function PilotsPage() {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const {
    data: oppsData,
    isLoading,
    error,
    refetch,
  } = useOpportunities({ is_paid_pilot: true, limit: 500 });

  const pilots = oppsData?.data || [];

  const kpis = useMemo(() => {
    const active = pilots.filter(
      (o) => !o.is_closed_won && !o.is_closed_lost && getPilotStatus(o as unknown as Record<string, unknown>) === "Active"
    );
    const totalPilotArr = active.reduce((s, o) => s + (o.arr || 0), 0);

    const converted = pilots.filter((o) => o.is_closed_won);
    const conversionRate = pilots.length > 0 ? (converted.length / pilots.length) * 100 : 0;

    const convertedDurations = converted
      .map((o) => getDuration(o.paid_pilot_start_date, o.close_date))
      .filter((d): d is number => d !== null);
    const avgDuration =
      convertedDurations.length > 0
        ? Math.round(convertedDurations.reduce((s, d) => s + d, 0) / convertedDurations.length)
        : 0;

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringCount = pilots.filter((o) => {
      if (o.is_closed_won || o.is_closed_lost) return false;
      if (!o.paid_pilot_end_date) return false;
      const end = new Date(o.paid_pilot_end_date);
      return end <= thirtyDays && end >= now;
    }).length;

    return {
      activePilots: active.length,
      totalPilotArr,
      conversionRate,
      avgDuration,
      expiringCount,
    };
  }, [pilots]);

  // Pilots at risk (expiring within 30 days, not closed)
  const atRiskPilots = useMemo(() => {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return pilots
      .filter((o) => {
        if (o.is_closed_won || o.is_closed_lost) return false;
        if (!o.paid_pilot_end_date) return false;
        const end = new Date(o.paid_pilot_end_date);
        return end <= thirtyDays;
      })
      .map((o) => ({
        ...o,
        daysRemaining: getDaysRemaining(o.paid_pilot_end_date),
      }))
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
  }, [pilots]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

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
      key: "arr",
      header: "ARR",
      render: (row) => (row.arr ? formatCurrency(row.arr as number) : "—"),
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
      key: "stage",
      header: "Stage",
      render: (row) => <Badge variant="secondary">{row.stage as string}</Badge>,
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
      key: "arr",
      header: "ARR",
      render: (row) => (row.arr ? formatCurrency(row.arr as number) : "—"),
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
      key: "status",
      header: "Status",
      render: (row) => {
        const status = getPilotStatus(row);
        return <Badge variant={statusBadgeVariant[status]}>{status}</Badge>;
      },
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load pilot data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Paid Pilots</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Active Pilots" value={kpis.activePilots} format="number" />
        <KpiCard label="Total Pilot ARR" value={kpis.totalPilotArr} format="currency" />
        <KpiCard label="Conversion Rate" value={kpis.conversionRate} format="percent" />
        <KpiCard label="Avg Pilot Duration" value={`${kpis.avgDuration}d`} />
        <KpiCard label="Expiring Within 30 Days" value={kpis.expiringCount} format="number" />
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
          <CardTitle className="text-sm font-medium">All Pilots</CardTitle>
        </CardHeader>
        <CardContent>
          {pilots.length === 0 ? (
            <EmptyState
              title="No paid pilots"
              description="No paid pilot opportunities found"
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
