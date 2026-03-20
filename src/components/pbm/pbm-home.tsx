"use client";

import { useState } from "react";
import { usePbmHome } from "@/hooks/use-pbm-home";
import { usePbmOpportunities } from "@/hooks/use-pbm-opportunities";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { CreditPathBadge } from "@/components/pbm/credit-path-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PbmHome() {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const {
    data: homeData,
    isLoading: homeLoading,
    error: homeError,
    refetch: refetchHome,
  } = usePbmHome();

  const {
    data: oppsData,
    isLoading: oppsLoading,
  } = usePbmOpportunities({ limit: 25 });

  const isLoading = homeLoading || oppsLoading;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "account_name",
      header: "Account",
      render: (row) =>
        (row.accounts as { name: string } | undefined)?.name || "—",
    },
    { key: "name", header: "Opportunity" },
    {
      key: "stage",
      header: "Stage",
      render: (row) => (
        <Badge
          variant={
            row.is_closed_won
              ? "default"
              : row.is_closed_lost
                ? "destructive"
                : "secondary"
          }
        >
          {row.stage as string}
        </Badge>
      ),
    },
    {
      key: "acv",
      header: "ACV",
      render: (row) =>
        row.acv ? formatCurrency(row.acv as number) : "—",
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "credit_path",
      header: "Credit Path",
      render: (row) => (
        <CreditPathBadge
          creditPath={row.credit_path as string | null}
          partnerName={row.partner_name as string | null}
        />
      ),
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
  if (homeError)
    return (
      <ErrorState
        message="Failed to load PBM dashboard data"
        onRetry={refetchHome}
      />
    );

  const d = homeData;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        PBM Home Dashboard
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="ACV Closed QTD"
          value={d?.acv_closed_qtd || 0}
          format="currency"
        />
        <KpiCard
          label="ACV Closed YTD"
          value={d?.acv_closed_ytd || 0}
          format="currency"
        />
        <KpiCard
          label="Deals Closed QTD"
          value={d?.deals_closed_qtd || 0}
          format="number"
        />
        <KpiCard
          label="Quota Attainment QTD"
          value={d?.quota_attainment_qtd || 0}
          format="percent"
        />
        <KpiCard
          label="Quota Attainment YTD"
          value={d?.quota_attainment_ytd || 0}
          format="percent"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            My Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={(oppsData?.data || []) as unknown as Record<string, unknown>[]}
            columns={columns}
            pageSize={25}
            onRowClick={(row) => setSelectedOpp(row.id as string)}
            emptyMessage="No opportunities found"
          />
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
