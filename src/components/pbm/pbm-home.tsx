"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { usePbmHome } from "@/hooks/use-pbm-home";
import { usePbmOpportunities } from "@/hooks/use-pbm-opportunities";
import { apiFetch } from "@/lib/api";
import { getCurrentFiscalPeriod, getQuarterEndDate } from "@/lib/fiscal";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { CreditPathBadge } from "@/components/pbm/credit-path-badge";
import { AcvByMonthChart } from "@/components/charts/acv-by-month";
import { PipelineByStageChart } from "@/components/charts/pipeline-by-stage";
import { QuotaGauge } from "@/components/charts/quota-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PbmCharts {
  acvByMonth: Record<string, number>;
  cxaAcvByMonth?: Record<string, number>;
  ccaasAcvByMonth?: Record<string, number>;
  acvDeals?: Record<string, Array<{ id: string; name: string; owner: string; acv: number }>>;
  pipelineByStage: Record<string, { count: number; acv: number }>;
  pipelineByMonthAndGroup?: Record<string, Record<string, { count: number; acv: number }>>;
  pipelineDeals?: Record<string, Array<{ id: string; name: string; owner: string; acv: number; stage: string }>>;
}

export function PbmHome() {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const viewAsId = viewAsUser?.user_id ?? null;

  const {
    data: homeData,
    isLoading: homeLoading,
    error: homeError,
    refetch: refetchHome,
  } = usePbmHome();

  const cutoffDate = useMemo(() => {
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    let endQ = fiscalQuarter + 3;
    let endFY = fiscalYear;
    if (endQ > 4) { endQ -= 4; endFY += 1; }
    return getQuarterEndDate(endFY, endQ).toISOString().split("T")[0];
  }, []);

  const {
    data: oppsData,
    isLoading: oppsLoading,
  } = usePbmOpportunities({
    status: "open",
    close_date_lte: cutoffDate,
    sort_by: "acv",
    sort_asc: "false",
    limit: 25,
  });

  const {
    data: chartsResponse,
    isLoading: chartsLoading,
  } = useQuery({
    queryKey: ["pbm-charts", viewAsId],
    queryFn: () => apiFetch<{ data: PbmCharts }>("/api/pbm/charts"),
  });

  const charts = chartsResponse?.data;

  const isLoading = homeLoading || oppsLoading || chartsLoading;

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
    {
      key: "ai_acv",
      header: "CXA ACV",
      render: (row) =>
        row.ai_acv ? formatCurrency(row.ai_acv as number) : "—",
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

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <KpiCard
          label="ACV Closed QTD"
          value={d?.acv_closed_qtd || 0}
          format="currency"
        />
        <KpiCard
          label="CXA ACV Closed QTD"
          value={d?.cxa_acv_closed_qtd || 0}
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
          label="% Closed Deals with CXA"
          value={d?.pct_closed_deals_with_cxa || 0}
          format="percent"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ACV by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <AcvByMonthChart acvByMonth={charts?.acvByMonth} cxaAcvByMonth={charts?.cxaAcvByMonth} ccaasAcvByMonth={charts?.ccaasAcvByMonth} acvDeals={charts?.acvDeals} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Open Pipeline by Close Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineByStageChart
              pipelineByMonthAndGroup={charts?.pipelineByMonthAndGroup}
              pipelineDeals={charts?.pipelineDeals}
              pipelineByStage={charts?.pipelineByStage}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Quarterly Pacing
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <QuotaGauge
              attainment={d?.quota_attainment_qtd || 0}
              expectedPace={d?.quarter_pace_percent || 0}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Open Opportunities
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
