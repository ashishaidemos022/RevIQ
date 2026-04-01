"use client";

import { useMemo, useState, useCallback } from "react";
import { useFilterParam, useFilterParamArray } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { usePbmOpportunities, PbmOpportunity } from "@/hooks/use-pbm-opportunities";
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
} from "@/lib/fiscal";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { DealDrilldownDrawer, DrillDownDeal } from "@/components/charts/deal-drilldown-drawer";
import { CreditPathBadge } from "@/components/pbm/credit-path-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Filter, RotateCcw } from "lucide-react";
import { SS0_SS2_STAGES, QUALIFIED_STAGES } from "@/lib/stage-groups";
import { analyzeStageAging, getAgingSeverity } from "@/lib/deal-velocity";
import { StageAgingAlerts, AgingIndicator } from "@/components/dashboard/stage-aging-alerts";
import { AgingThresholdsDialog } from "@/components/dashboard/aging-thresholds-dialog";
import { useAgingThresholds } from "@/hooks/use-aging-thresholds";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const STAGES = [...SS0_SS2_STAGES, ...QUALIFIED_STAGES];

const DEAL_SIZE_RANGES = [
  { value: "0-25000", label: "$0 to $25K", min: 0, max: 25000 },
  { value: "25000-50000", label: "$25K to $50K", min: 25000, max: 50000 },
  { value: "50000-100000", label: "$50K to $100K", min: 50000, max: 100000 },
  { value: "100000-250000", label: "$100K to $250K", min: 100000, max: 250000 },
  { value: "250000-500000", label: "$250K to $500K", min: 250000, max: 500000 },
  { value: "500000-1000000", label: "$500K to $1M", min: 500000, max: 1000000 },
  { value: "1000000-plus", label: "$1M Plus", min: 1000000, max: Infinity },
];

// Build quarter options: current quarter + next 3 quarters
function getQuarterOptions() {
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const options: { value: string; label: string }[] = [];
  let fy = fiscalYear;
  let fq = fiscalQuarter;
  for (let i = 0; i < 4; i++) {
    const value = i === 0 ? "current" : `${fy}-${fq}`;
    const label = i === 0 ? `Current Quarter (Q${fq} FY${fy})` : `Q${fq} FY${fy}`;
    options.push({ value, label });
    fq++;
    if (fq > 4) { fq = 1; fy++; }
  }
  return options;
}

const QUARTER_OPTIONS_ITEMS = getQuarterOptions();

const PILOT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "yes", label: "Paid Pilot" },
  { value: "no", label: "Non-Pilot" },
];

const PIE_COLORS = [
  "#5405BD", "#14C3B7", "#7c3aed", "#FFCC00", "#f97316",
  "#ec4899", "#06b6d4", "#84cc16", "#8b5cf6", "#f43f5e",
  "#10b981", "#6366f1",
];

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) =>
  val >= 1000000
    ? `$${(val / 1000000).toFixed(1)}M`
    : val >= 1000
      ? `$${(val / 1000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

export function PbmPipeline() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

  // Fetch quota for pipeline coverage ratio
  const quotaQueryParams = useMemo(() => {
    const params = [{ fy: fiscalYear, q: fiscalQuarter }];
    return encodeURIComponent(JSON.stringify(params));
  }, [fiscalYear, fiscalQuarter]);

  const { data: perfData } = useQuery({
    queryKey: ["pbm-pipeline-quota", quotaQueryParams, viewAsUser?.user_id],
    queryFn: () =>
      apiFetch<{ data: Record<string, { annualQuota: number | null }> }>(
        `/api/pbm/performance?quarters=${quotaQueryParams}${viewAsUser ? `&viewAs=${viewAsUser.user_id}` : ""}`
      ),
  });

  const quarterlyQuota = useMemo(() => {
    if (!perfData?.data) return null;
    const qData = Object.values(perfData.data)[0];
    return qData?.annualQuota ? qData.annualQuota / 4 : null;
  }, [perfData]);

  const [quarterFilter, setQuarterFilter] = useFilterParamArray("quarter");
  const [stageFilter, setStageFilter] = useFilterParamArray("stage");
  const [pilotFilter, setPilotFilter] = useFilterParamArray("pilot");
  const [dealSizeFilter, setDealSizeFilter] = useFilterParamArray("dealSize");
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<{
    title: string;
    deals: DrillDownDeal[];
  } | null>(null);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const { thresholds: customThresholds, isCustomized, updateThresholds, resetToDefaults } = useAgingThresholds();

  const {
    data: oppsData,
    isLoading,
    error,
    refetch,
  } = usePbmOpportunities({
    status: "open",
    ...(pilotFilter.includes("yes") && !pilotFilter.includes("no") && { is_paid_pilot: true }),
    ...(pilotFilter.includes("no") && !pilotFilter.includes("yes") && { is_paid_pilot: false }),
    limit: 10000,
  });

  const opps = oppsData?.data || [];

  // Client-side filter by stage (multi-select)
  const stageFiltered = useMemo(() => {
    if (stageFilter.length === 0) return opps;
    return opps.filter((o) => stageFilter.includes(o.stage));
  }, [opps, stageFilter]);

  // Deal size filter
  const dealSizeFiltered = useMemo(() => {
    if (dealSizeFilter.length === 0) return stageFiltered;
    const ranges = dealSizeFilter.map(v => DEAL_SIZE_RANGES.find(r => r.value === v)).filter(Boolean) as typeof DEAL_SIZE_RANGES;
    return stageFiltered.filter(o => {
      const acv = o.acv || 0;
      return ranges.some(r => acv >= r.min && acv < (r.max === Infinity ? Infinity : r.max));
    });
  }, [stageFiltered, dealSizeFilter]);

  // Filter by close date quarter (multi-select)
  const filteredOpps = useMemo(() => {
    if (quarterFilter.length === 0) return dealSizeFiltered;

    const ranges: Array<{ start: string; end: string }> = [];
    for (const qf of quarterFilter) {
      let fy = fiscalYear;
      let fq = fiscalQuarter;
      if (qf !== "current") {
        const parts = qf.split("-");
        fy = parseInt(parts[0]);
        fq = parseInt(parts[1]);
      }
      const start = getQuarterStartDate(fy, fq);
      const end = getQuarterEndDate(fy, fq);
      ranges.push({
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      });
    }

    return dealSizeFiltered.filter((o) => {
      if (!o.close_date) return false;
      return ranges.some(r => o.close_date! >= r.start && o.close_date! <= r.end);
    });
  }, [dealSizeFiltered, quarterFilter, fiscalYear, fiscalQuarter]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPipelineAcv = filteredOpps.reduce((s, o) => s + (o.acv || 0), 0);
    const qualifiedPipelineAcv = filteredOpps
      .filter(o => QUALIFIED_STAGES.includes(o.stage || ''))
      .reduce((s, o) => s + (o.acv || 0), 0);
    const forecastedPipelineAcv = filteredOpps
      .filter(o => o.mgmt_forecast_category === 'Forecast')
      .reduce((s, o) => s + (o.acv || 0), 0);
    const upsidePipelineAcv = filteredOpps
      .filter(o => o.mgmt_forecast_category === 'Upside')
      .reduce((s, o) => s + (o.acv || 0), 0);
    const dealCount = filteredOpps.length;
    const avgDealSize = dealCount > 0 ? totalPipelineAcv / dealCount : 0;

    return { totalPipelineAcv, qualifiedPipelineAcv, forecastedPipelineAcv, upsidePipelineAcv, dealCount, avgDealSize };
  }, [filteredOpps]);

  // Forecast chart data
  const forecastChartData = useMemo(() => {
    const monthMap: Record<string, { month: string; Forecast: number; Upside: number }> = {};
    for (const o of filteredOpps) {
      if (!o.close_date) continue;
      const month = o.close_date.substring(0, 7);
      if (!monthMap[month]) monthMap[month] = { month, Forecast: 0, Upside: 0 };
      const acv = o.acv || 0;
      if (o.mgmt_forecast_category === 'Forecast') {
        monthMap[month].Forecast += acv;
      } else {
        monthMap[month].Upside += acv;
      }
    }
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOpps]);

  // Pie chart data
  const stagePieData = useMemo(() => {
    const stageMap: Record<string, number> = {};
    filteredOpps.forEach((o) => {
      const stage = o.stage || "Other";
      stageMap[stage] = (stageMap[stage] || 0) + (o.acv || 0);
    });
    const total = Object.values(stageMap).reduce((s, v) => s + v, 0);
    return Object.entries(stageMap)
      .sort(([, a], [, b]) => b - a)
      .map(([stage, acv]) => ({
        stage,
        acv,
        percent: total > 0 ? ((acv / total) * 100).toFixed(1) : "0",
      }));
  }, [filteredOpps]);

  // Pipeline by stage aggregation
  const stageData = useMemo(() => {
    const stages: Record<
      string,
      { deals: PbmOpportunity[]; totalAcv: number; totalCxaAcv: number; totalDays: number; daysCount: number }
    > = {};
    filteredOpps.forEach((o) => {
      const stage = o.stage || "Other";
      if (!stages[stage]) stages[stage] = { deals: [], totalAcv: 0, totalCxaAcv: 0, totalDays: 0, daysCount: 0 };
      stages[stage].deals.push(o);
      stages[stage].totalAcv += o.acv || 0;
      stages[stage].totalCxaAcv += o.cxa_committed_arr || 0;
      if (o.days_in_current_stage != null) {
        stages[stage].totalDays += o.days_in_current_stage;
        stages[stage].daysCount++;
      }
    });

    return Object.entries(stages)
      .sort(([, a], [, b]) => b.totalAcv - a.totalAcv)
      .map(([stage, data]) => ({
        stage,
        deals: data.deals.length,
        totalAcv: data.totalAcv,
        totalCxaAcv: data.totalCxaAcv,
        avgDaysInStage: data.daysCount > 0 ? Math.round(data.totalDays / data.daysCount) : 0,
        oppList: [...data.deals].sort((a, b) => (b.acv || 0) - (a.acv || 0)),
      }));
  }, [filteredOpps]);

  // Stage aging analysis
  const agingSummary = useMemo(
    () => analyzeStageAging(filteredOpps, customThresholds),
    [filteredOpps, customThresholds]
  );

  const oppColumns: Column<Record<string, unknown>>[] = [
    {
      key: "account_name",
      header: "Account",
      render: (row) => (row.accounts as { name: string } | undefined)?.name || "—",
    },
    { key: "name", header: "Opportunity" },
    {
      key: "stage",
      header: "Stage",
      render: (row) => <Badge variant="secondary">{row.stage as string}</Badge>,
    },
    {
      key: "acv",
      header: "ACV",
      render: (row) => (row.acv ? fmtCurrency(row.acv as number) : "—"),
    },
    {
      key: "cxa_committed_arr",
      header: "AI ACV",
      render: (row) => (row.cxa_committed_arr ? fmtCurrency(row.cxa_committed_arr as number) : "—"),
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "days_in_current_stage",
      header: "Days in Stage",
      render: (row) => {
        const days = row.days_in_current_stage as number | null;
        const stage = row.stage as string;
        const severity = getAgingSeverity(stage, days, customThresholds);
        return <AgingIndicator days={days} stage={stage} severity={severity} />;
      },
    },
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

  // Drill-down: bar chart click — filter opps by clicked month
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleForecastBarClick = useCallback((barData: any) => {
    const month = barData?.month || barData?.payload?.month;
    if (!month) return;
    const [y, m] = month.split("-");
    const label = `${MONTH_LABELS[m] || m} ${y}`;
    const deals = filteredOpps
      .filter(o => o.close_date?.startsWith(month))
      .sort((a, b) => (b.reporting_acv || b.acv || 0) - (a.reporting_acv || a.acv || 0))
      .map(o => ({
        id: o.id,
        name: o.name || "Unnamed",
        owner: o.users?.full_name || "Unknown",
        acv: o.reporting_acv || o.acv || 0,
        stage: o.stage,
      }));
    if (deals.length > 0) setDrillDown({ title: `Pipeline — ${label}`, deals });
  }, [filteredOpps]);

  // Drill-down: pie chart click — filter opps by clicked stage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePieClick = useCallback((_: any, idx: number) => {
    const entry = stagePieData[idx];
    if (!entry) return;
    const deals = filteredOpps
      .filter(o => (o.stage || "Other") === entry.stage)
      .sort((a, b) => (b.reporting_acv || b.acv || 0) - (a.reporting_acv || a.acv || 0))
      .map(o => ({
        id: o.id,
        name: o.name || "Unnamed",
        owner: o.users?.full_name || "Unknown",
        acv: o.reporting_acv || o.acv || 0,
        stage: o.stage,
      }));
    if (deals.length > 0) setDrillDown({ title: `Pipeline — ${entry.stage}`, deals });
  }, [filteredOpps, stagePieData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPieLabel = ({ stage, percent }: any) => `${stage} (${percent}%)`;

  if (isLoading) return <DashboardSkeleton />;
  if (error)
    return <ErrorState message="Failed to load PBM pipeline data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">PBM Pipeline</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setQuarterFilter([]);
              setStageFilter([]);
              setPilotFilter([]);
              setDealSizeFilter([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <MultiSelect
            options={QUARTER_OPTIONS_ITEMS}
            value={quarterFilter}
            onChange={setQuarterFilter}
            placeholder="All Quarters"
            className="w-[220px]"
          />
          <MultiSelect
            options={STAGES.map(s => ({ value: s, label: s }))}
            value={stageFilter}
            onChange={setStageFilter}
            placeholder="All Stages"
            className="w-[160px]"
          />
          <MultiSelect
            options={PILOT_OPTIONS}
            value={pilotFilter}
            onChange={setPilotFilter}
            placeholder="Pilot"
            className="w-[130px]"
          />
          <MultiSelect
            options={DEAL_SIZE_RANGES.map(r => ({ value: r.value, label: r.label }))}
            value={dealSizeFilter}
            onChange={setDealSizeFilter}
            placeholder="Deal Size"
            className="w-[150px]"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Pipeline ACV" value={kpis.totalPipelineAcv} format="currency" />
        <KpiCard label="Qualified Pipeline" value={kpis.qualifiedPipelineAcv} format="currency" />
        <KpiCard label="Forecasted Open Pipeline" value={kpis.forecastedPipelineAcv} format="currency" />
        <KpiCard label="Upside Open Pipeline" value={kpis.upsidePipelineAcv} format="currency" />
        <KpiCard label="Deals in Pipeline" value={kpis.dealCount} format="number" />
        <KpiCard label="Avg Deal Size" value={kpis.avgDealSize} format="currency" />
        <KpiCard
          label="Pipeline Coverage"
          value={quarterlyQuota && quarterlyQuota > 0
            ? `${(kpis.totalPipelineAcv / quarterlyQuota).toFixed(1)}x`
            : "N/A"}
          className={quarterlyQuota && quarterlyQuota > 0
            ? kpis.totalPipelineAcv / quarterlyQuota >= 3
              ? "border-green-500/30 bg-green-500/5"
              : kpis.totalPipelineAcv / quarterlyQuota >= 2
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
            : undefined}
          trend={quarterlyQuota && quarterlyQuota > 0
            ? { direction: kpis.totalPipelineAcv / quarterlyQuota >= 3 ? "up" : kpis.totalPipelineAcv / quarterlyQuota >= 2 ? "flat" : "down",
                value: 0,
                label: `${fmtCurrency(kpis.totalPipelineAcv)} / ${fmtCurrency(quarterlyQuota)} quota` }
            : undefined}
        />
        <KpiCard
          label="Qualified Coverage"
          value={quarterlyQuota && quarterlyQuota > 0
            ? `${(kpis.qualifiedPipelineAcv / quarterlyQuota).toFixed(1)}x`
            : "N/A"}
          className={quarterlyQuota && quarterlyQuota > 0
            ? kpis.qualifiedPipelineAcv / quarterlyQuota >= 2
              ? "border-green-500/30 bg-green-500/5"
              : kpis.qualifiedPipelineAcv / quarterlyQuota >= 1
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
            : undefined}
          trend={quarterlyQuota && quarterlyQuota > 0
            ? { direction: kpis.qualifiedPipelineAcv / quarterlyQuota >= 2 ? "up" : kpis.qualifiedPipelineAcv / quarterlyQuota >= 1 ? "flat" : "down",
                value: 0,
                label: `SS3+ only vs quota` }
            : undefined}
        />
      </div>

      {/* Stage Aging Alerts */}
      <StageAgingAlerts
        summary={agingSummary}
        onDealClick={(id) => setSelectedOpp(id)}
        onConfigureThresholds={() => setThresholdsOpen(true)}
        isCustomized={isCustomized}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline by Forecast Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline by Forecast Category</CardTitle>
          </CardHeader>
          <CardContent>
            {forecastChartData.length === 0 ? (
              <EmptyState title="No data" description="No open opportunities with close dates" />
            ) : (
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={forecastChartData}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const [y, m] = v.split("-");
                      return `${MONTH_LABELS[m] || m} '${y.slice(2)}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={shortCurrency} width={70} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    formatter={(val: any) => fmtCurrency(Number(val))}
                    labelFormatter={(v: any) => {
                      const [y, m] = String(v).split("-");
                      return `${MONTH_LABELS[m] || m} ${y}`;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Forecast" stackId="fc" fill="#5405BD" radius={[0, 0, 0, 0]} onClick={handleForecastBarClick} style={{ cursor: "pointer" }} />
                  <Bar dataKey="Upside" stackId="fc" fill="#14C3B7" radius={[4, 4, 0, 0]} onClick={handleForecastBarClick} style={{ cursor: "pointer" }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pipeline by Stage — Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {stagePieData.length === 0 ? (
              <EmptyState title="No data" description="No open opportunities" />
            ) : (
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={stagePieData}
                    dataKey="acv"
                    nameKey="stage"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={renderPieLabel}
                    labelLine={{ strokeWidth: 1 }}
                    onClick={handlePieClick}
                    style={{ cursor: "pointer" }}
                  >
                    {stagePieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(val: any) => fmtCurrency(Number(val))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Stage Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          {stageData.length === 0 ? (
            <EmptyState
              title="No open opportunities"
              description="No open opportunities match the selected filters"
            />
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 text-xs font-medium text-muted-foreground px-3 py-2 border-b">
                <span>Stage</span>
                <span className="text-right"># Deals</span>
                <span className="text-right">Total ACV</span>
                <span className="text-right">AI ACV</span>
                <span className="text-right">Avg Days in Stage</span>
              </div>
              {stageData.map((row) => (
                <div key={row.stage}>
                  <button
                    className="grid grid-cols-5 w-full text-sm px-3 py-3 hover:bg-muted/50 rounded-md transition-colors"
                    onClick={() =>
                      setExpandedStage(expandedStage === row.stage ? null : row.stage)
                    }
                  >
                    <span className="flex items-center gap-2 text-left font-medium">
                      {expandedStage === row.stage ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {row.stage}
                    </span>
                    <span className="text-right">{row.deals}</span>
                    <span className="text-right">{fmtCurrency(row.totalAcv)}</span>
                    <span className="text-right">{fmtCurrency(row.totalCxaAcv)}</span>
                    <span className="text-right">
                      <AgingIndicator
                        days={row.avgDaysInStage}
                        stage={row.stage}
                        severity={getAgingSeverity(row.stage, row.avgDaysInStage, customThresholds)}
                      />
                    </span>
                  </button>
                  {expandedStage === row.stage && (
                    <div className="pl-6 pb-4">
                      <DataTable
                        data={row.oppList as unknown as Record<string, unknown>[]}
                        columns={oppColumns}
                        pageSize={10}
                        onRowClick={(r) => setSelectedOpp(r.id as string)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Opportunities Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Open Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={[...filteredOpps].sort((a, b) => (b.acv || 0) - (a.acv || 0)) as unknown as Record<string, unknown>[]}
            columns={oppColumns}
            pageSize={25}
            onRowClick={(row) => setSelectedOpp(row.id as string)}
            emptyMessage="No open opportunities match the selected filters"
          />
        </CardContent>
      </Card>

      <OpportunityDrawer
        opportunityId={selectedOpp}
        open={!!selectedOpp}
        onClose={() => setSelectedOpp(null)}
      />

      <DealDrilldownDrawer
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title || ""}
        deals={drillDown?.deals || []}
        showStage
        acvLabel="Reporting ACV"
      />

      <AgingThresholdsDialog
        open={thresholdsOpen}
        onClose={() => setThresholdsOpen(false)}
        currentThresholds={customThresholds}
        onSave={updateThresholds}
        onReset={resetToDefaults}
        isCustomized={isCustomized}
      />
    </div>
  );
}
