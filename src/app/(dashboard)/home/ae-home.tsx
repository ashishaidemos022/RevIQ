"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useOpportunities } from "@/hooks/use-opportunities";
import { getCurrentFiscalPeriod, getQuarterEndDate } from "@/lib/fiscal";
import { apiFetch } from "@/lib/api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { AcvByMonthChart } from "@/components/charts/acv-by-month";
import { PipelineByStageChart } from "@/components/charts/pipeline-by-stage";
import { QuotaGauge } from "@/components/charts/quota-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HomeKpis {
  acvClosedQTD: number;
  acvClosedYTD: number;
  dealsClosedQTD: number;
  quotaAttainmentQTD: number;
  quotaAttainmentYTD: number;
  quarterPacePercent: number;
}

interface HomeCharts {
  acvByMonth: Record<string, number>;
  pipelineByStage: Record<string, { count: number; acv: number }>;
  pipelineByMonthAndGroup?: Record<string, Record<string, { count: number; acv: number }>>;
  pipelineDeals?: Record<string, Array<{ id: string; name: string; owner: string; acv: number; stage: string }>>;
}

export function AeHome() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const viewAsParam = viewAsUser ? `?viewAs=${viewAsUser.user_id}` : '';
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const {
    data: kpisData,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = useQuery({
    queryKey: ["home-kpis", viewAsUser?.user_id],
    queryFn: () => apiFetch<{ data: HomeKpis }>(`/api/home/kpis${viewAsParam}`),
  });

  const {
    data: chartsData,
    isLoading: chartsLoading,
    error: chartsError,
    refetch: refetchCharts,
  } = useQuery({
    queryKey: ["home-charts", viewAsUser?.user_id],
    queryFn: () => apiFetch<{ data: HomeCharts }>(`/api/home/charts${viewAsParam}`),
  });

  // Compute cutoff: end of current quarter + next 3 quarters
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
    error: oppsError,
    refetch: refetchOpps,
  } = useOpportunities({
    status: "open",
    close_date_lte: cutoffDate,
    sort_by: "acv",
    sort_asc: "false",
    viewAs: viewAsUser?.user_id,
    limit: 25,
  });

  const isLoading = kpisLoading || chartsLoading || oppsLoading;
  const kpis = kpisData?.data || null;
  const charts = chartsData?.data || null;

  const openOpps = oppsData?.data || [];

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
        row.acv
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(row.acv as number)
          : "—",
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "is_paid_pilot",
      header: "Paid Pilot",
      render: (row) =>
        row.is_paid_pilot ? <Badge variant="outline">Pilot</Badge> : null,
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (kpisError || chartsError || oppsError)
    return (
      <ErrorState
        message="Failed to load dashboard data"
        onRetry={() => { refetchKpis(); refetchCharts(); refetchOpps(); }}
      />
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Home Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="ACV Closed QTD"
          value={kpis?.acvClosedQTD || 0}
          format="currency"
        />
        <KpiCard
          label="ACV Closed YTD"
          value={kpis?.acvClosedYTD || 0}
          format="currency"
        />
        <KpiCard
          label="Deals Closed QTD"
          value={kpis?.dealsClosedQTD || 0}
          format="number"
        />
        <KpiCard
          label="Quota Attainment QTD"
          value={kpis?.quotaAttainmentQTD || 0}
          format="percent"
        />
        <KpiCard
          label="Quota Attainment YTD"
          value={kpis?.quotaAttainmentYTD || 0}
          format="percent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ACV by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <AcvByMonthChart acvByMonth={charts?.acvByMonth} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Pipeline by Close Month
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
              attainment={kpis?.quotaAttainmentQTD || 0}
              expectedPace={kpis?.quarterPacePercent || 0}
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
            data={openOpps as unknown as Record<string, unknown>[]}
            columns={columns}
            pageSize={25}
            onRowClick={(row) => setSelectedOpp(row.id as string)}
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
