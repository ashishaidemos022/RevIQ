"use client";

import { useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useCommissions } from "@/hooks/use-commissions";
import { useQuotas } from "@/hooks/use-quotas";
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
  getFiscalYearRange,
} from "@/lib/fiscal";
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

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);

  const {
    data: oppsData,
    isLoading: oppsLoading,
    error: oppsError,
    refetch: refetchOpps,
  } = useOpportunities({ limit: 100 });

  const { data: commissionsData, isLoading: commissionsLoading } =
    useCommissions({ fiscal_year: fiscalYear });

  const { data: quotasData, isLoading: quotasLoading } = useQuotas({
    fiscal_year: fiscalYear,
    quota_type: "revenue",
    user_id: user?.user_id,
  });

  const isLoading = oppsLoading || commissionsLoading || quotasLoading;

  const kpis = useMemo(() => {
    if (!oppsData?.data) return null;

    const opps = oppsData.data;
    const commissions = commissionsData?.data || [];
    const quotas = quotasData?.data || [];

    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);

    const inQuarter = (d: string) => {
      const date = new Date(d);
      return date >= qStart && date <= qEnd;
    };
    const inYear = (d: string) => {
      const date = new Date(d);
      return date >= fyStart && date <= fyEnd;
    };

    const closedWonQTD = opps.filter(
      (o) => o.is_closed_won && o.close_date && inQuarter(o.close_date)
    );
    const closedWonYTD = opps.filter(
      (o) => o.is_closed_won && o.close_date && inYear(o.close_date)
    );

    const acvClosedQTD = closedWonQTD.reduce((s, o) => s + (o.acv || 0), 0);
    const acvClosedYTD = closedWonYTD.reduce((s, o) => s + (o.acv || 0), 0);
    const dealsClosedQTD = closedWonQTD.length;

    const commissionEarnedQTD = commissions
      .filter((c) => c.fiscal_quarter === fiscalQuarter && c.is_finalized)
      .reduce((s, c) => s + (c.commission_amount || 0), 0);

    const commissionProjectedQTD = commissions
      .filter((c) => c.fiscal_quarter === fiscalQuarter && !c.is_finalized)
      .reduce((s, c) => s + (c.commission_amount || 0), 0);

    const annualQuota = quotas.find(
      (q) => q.fiscal_quarter === null || q.fiscal_quarter === undefined
    );
    const quotaAttainment = annualQuota
      ? (acvClosedYTD / annualQuota.quota_amount) * 100
      : 0;

    return {
      acvClosedQTD,
      acvClosedYTD,
      dealsClosedQTD,
      commissionEarnedQTD,
      commissionProjectedQTD,
      quotaAttainment,
    };
  }, [oppsData, commissionsData, quotasData, fiscalYear, fiscalQuarter]);

  const recentOpps = useMemo(() => {
    if (!oppsData?.data) return [];
    return oppsData.data.slice(0, 25);
  }, [oppsData]);

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
  if (oppsError)
    return (
      <ErrorState
        message="Failed to load dashboard data"
        onRetry={refetchOpps}
      />
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Home Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          label="Commission Earned QTD"
          value={kpis?.commissionEarnedQTD || 0}
          format="currency"
        />
        <KpiCard
          label="Commission Projected QTD"
          value={kpis?.commissionProjectedQTD || 0}
          format="currency"
        />
        <KpiCard
          label="Quota Attainment"
          value={kpis?.quotaAttainment || 0}
          format="percent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ACV by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <AcvByMonthChart opportunities={oppsData?.data || []} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Pipeline by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineByStageChart opportunities={oppsData?.data || []} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Quota Attainment
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <QuotaGauge attainment={kpis?.quotaAttainment || 0} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Recent Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={recentOpps as unknown as Record<string, unknown>[]}
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
