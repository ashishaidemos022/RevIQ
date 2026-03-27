"use client";

import { useMemo, useState, useCallback } from "react";
import { useFilterParam, useFilterParamArray } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
} from "@/lib/fiscal";
import { MANAGER_PLUS_ROLES } from "@/lib/constants";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { DealDrilldownDrawer, DrillDownDeal } from "@/components/charts/deal-drilldown-drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Opportunity } from "@/types";
import { SS0_SS2_STAGES, QUALIFIED_STAGES } from "@/lib/stage-groups";
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
const DEAL_TYPES = [
  { value: "new_business", label: "New Business" },
  { value: "renewal", label: "Renewal" },
  { value: "expansion", label: "Expansion" },
  { value: "amendment", label: "Amendment" },
];

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

interface PipelineKpis {
  totalPipelineAcv: number;
  weightedPipelineAcv: number;
  dealCount: number;
  avgDealSize: number;
  forecastedPipelineAcv: number;
  upsidePipelineAcv: number;
}

interface StagesResponse {
  data: {
    stages: {
      stage: string;
      deals: number;
      totalAcv: number;
      totalCxaAcv: number;
      avgDaysInStage: number;
    }[];
    opportunities: Opportunity[];
  };
}

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

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

export function AePipeline() {
  const user = useAuthStore((s) => s.user);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  // Filters — multi-select stored as arrays, single-select as strings
  const [quarterFilter, setQuarterFilter] = useFilterParam("quarter", "current");
  const [stageFilter, setStageFilter] = useFilterParamArray("stage");
  const [typeFilter, setTypeFilter] = useFilterParamArray("type");
  const [pilotFilter, setPilotFilter] = useFilterParamArray("pilot");
  const [dealSizeFilter, setDealSizeFilter] = useFilterParamArray("dealSize");
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<{
    title: string;
    deals: DrillDownDeal[];
  } | null>(null);

  // Build query params shared across server-side endpoints
  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (viewAsUser) params.set('viewAs', viewAsUser.user_id);
    if (typeFilter.length > 0) params.set('type', typeFilter.join(','));
    if (stageFilter.length > 0) params.set('stage', stageFilter.join(','));
    if (pilotFilter.includes("yes") && !pilotFilter.includes("no")) params.set('is_paid_pilot', 'true');
    if (pilotFilter.includes("no") && !pilotFilter.includes("yes")) params.set('is_paid_pilot', 'false');
    // Deal size: compute min/max across selected ranges
    if (dealSizeFilter.length > 0) {
      const ranges = dealSizeFilter.map(v => DEAL_SIZE_RANGES.find(r => r.value === v)).filter(Boolean) as typeof DEAL_SIZE_RANGES;
      if (ranges.length > 0) {
        const min = Math.min(...ranges.map(r => r.min));
        const max = Math.max(...ranges.map(r => r.max));
        if (min > 0) params.set('acv_min', String(min));
        if (max < Infinity) params.set('acv_max', String(max));
      }
    }
    return params.toString();
  }, [viewAsUser, typeFilter, stageFilter, pilotFilter, dealSizeFilter]);

  // Server-side KPIs
  const {
    data: kpisData,
    isLoading: kpisLoading,
  } = useQuery({
    queryKey: ["pipeline-kpis", filterParams],
    queryFn: () => apiFetch<{ data: PipelineKpis }>(`/api/pipeline/kpis${filterParams ? `?${filterParams}` : ''}`),
  });

  const serverKpis = kpisData?.data || { totalPipelineAcv: 0, weightedPipelineAcv: 0, dealCount: 0, avgDealSize: 0, forecastedPipelineAcv: 0, upsidePipelineAcv: 0 };

  // Server-side stages + full opp list
  const {
    data: stagesData,
    isLoading: stagesLoading,
    error: stagesError,
    refetch: refetchStages,
  } = useQuery({
    queryKey: ["pipeline-stages", filterParams],
    queryFn: () => apiFetch<StagesResponse>(`/api/pipeline/stages${filterParams ? `?${filterParams}` : ''}`),
  });

  const isLoading = kpisLoading || stagesLoading;
  const allOpps = stagesData?.data?.opportunities || [];

  // Client-side deal size filter (ranges may be non-contiguous)
  const dealSizeFiltered = useMemo(() => {
    if (dealSizeFilter.length === 0) return allOpps;
    const ranges = dealSizeFilter.map(v => DEAL_SIZE_RANGES.find(r => r.value === v)).filter(Boolean) as typeof DEAL_SIZE_RANGES;
    return allOpps.filter(o => {
      const acv = o.acv || 0;
      return ranges.some(r => acv >= r.min && acv < (r.max === Infinity ? Infinity : r.max));
    });
  }, [allOpps, dealSizeFilter]);

  // Filter by close date quarter
  const filteredOpps = useMemo(() => {
    if (quarterFilter === "all") return dealSizeFiltered;
    let fy = fiscalYear;
    let fq = fiscalQuarter;
    if (quarterFilter !== "current") {
      const parts = quarterFilter.split("-");
      fy = parseInt(parts[0]);
      fq = parseInt(parts[1]);
    }
    const start = getQuarterStartDate(fy, fq);
    const end = getQuarterEndDate(fy, fq);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return dealSizeFiltered.filter((o) => {
      if (!o.close_date) return false;
      return o.close_date >= startStr && o.close_date <= endStr;
    });
  }, [dealSizeFiltered, quarterFilter, fiscalYear, fiscalQuarter]);

  // Recompute KPIs from filtered opps
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
    return {
      totalPipelineAcv,
      qualifiedPipelineAcv,
      forecastedPipelineAcv,
      upsidePipelineAcv,
      dealCount,
      avgDealSize,
    };
  }, [filteredOpps]);

  // Pipeline by Forecast Category chart data (by close month)
  const forecastChartData = useMemo(() => {
    const monthMap: Record<string, { month: string; Forecast: number; Upside: number }> = {};
    for (const o of filteredOpps) {
      if (!o.close_date) continue;
      const month = o.close_date.substring(0, 7); // YYYY-MM
      if (!monthMap[month]) monthMap[month] = { month, Forecast: 0, Upside: 0 };
      const acv = o.acv || 0;
      if (o.mgmt_forecast_category === 'Forecast') {
        monthMap[month].Forecast += acv;
      } else {
        // Everything else (including Upside, null, other values) goes to Upside
        monthMap[month].Upside += acv;
      }
    }
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOpps]);

  // Pipeline by Stage pie chart data
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

  // Client-side stage aggregation
  const stageData = useMemo(() => {
    const stages: Record<
      string,
      { deals: typeof filteredOpps; totalAcv: number; totalCxaAcv: number; totalDays: number; daysCount: number }
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

  // Columns for expanded stage rows — sorted by ACV desc, no Prob %, add CXA ACV
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
      header: "CXA ACV",
      render: (row) => (row.cxa_committed_arr ? fmtCurrency(row.cxa_committed_arr as number) : "—"),
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "is_paid_pilot",
      header: "Pilot",
      render: (row) =>
        row.is_paid_pilot ? <Badge variant="outline">Pilot</Badge> : null,
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
        owner: (o as unknown as { users?: { full_name: string } }).users?.full_name || "Unknown",
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
        owner: (o as unknown as { users?: { full_name: string } }).users?.full_name || "Unknown",
        acv: o.reporting_acv || o.acv || 0,
        stage: o.stage,
      }));
    if (deals.length > 0) setDrillDown({ title: `Pipeline — ${entry.stage}`, deals });
  }, [filteredOpps, stagePieData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPieLabel = ({ stage, percent }: any) => `${stage} (${percent}%)`;

  if (isLoading) return <DashboardSkeleton />;
  if (stagesError)
    return <ErrorState message="Failed to load pipeline data" onRetry={refetchStages} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <MultiSelect
            options={QUARTER_OPTIONS_ITEMS}
            value={[quarterFilter]}
            onChange={(v) => setQuarterFilter(v[v.length - 1] || "current")}
            placeholder="Quarter"
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
            options={DEAL_TYPES}
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="All Types"
            className="w-[150px]"
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Pipeline ACV" value={kpis.totalPipelineAcv} format="currency" />
        <KpiCard label="Qualified Pipeline" value={kpis.qualifiedPipelineAcv} format="currency" />
        <KpiCard label="Forecasted Open Pipeline" value={kpis.forecastedPipelineAcv} format="currency" />
        <KpiCard label="Upside Open Pipeline" value={kpis.upsidePipelineAcv} format="currency" />
        <KpiCard label="Deals in Pipeline" value={kpis.dealCount} format="number" />
        <KpiCard label="Avg Deal Size" value={kpis.avgDealSize} format="currency" />
      </div>

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
              description="No opportunities match the selected filters"
            />
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 text-xs font-medium text-muted-foreground px-3 py-2 border-b">
                <span>Stage</span>
                <span className="text-right"># Deals</span>
                <span className="text-right">Total ACV</span>
                <span className="text-right">CXA ACV</span>
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
                    <span className="text-right">{row.avgDaysInStage}d</span>
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
    </div>
  );
}
