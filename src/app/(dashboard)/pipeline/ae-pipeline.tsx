"use client";

import { useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useOpportunities } from "@/hooks/use-opportunities";
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
  getRollingQuarters,
} from "@/lib/fiscal";
import { MANAGER_PLUS_ROLES } from "@/lib/constants";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { PipelineByStageChart } from "@/components/charts/pipeline-by-stage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Opportunity } from "@/types";

const STAGES = ["Discovery", "Qualification", "Proposal", "Negotiation"];
const DEAL_TYPES = [
  { value: "new_business", label: "New Business" },
  { value: "renewal", label: "Renewal" },
  { value: "expansion", label: "Expansion" },
];

export function AePipeline() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  // Filters
  const [quarterFilter, setQuarterFilter] = useState("current");
  const [stageFilter, setStageFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pilotFilter, setPilotFilter] = useState("all");
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const quarters = getRollingQuarters(8);

  const {
    data: oppsData,
    isLoading,
    error,
    refetch,
  } = useOpportunities({
    status: "open",
    ...(typeFilter !== "all" && { type: typeFilter }),
    ...(stageFilter !== "all" && { stage: stageFilter }),
    ...(pilotFilter === "yes" && { is_paid_pilot: true }),
    ...(pilotFilter === "no" && { is_paid_pilot: false }),
    limit: 500,
  });

  const opps = oppsData?.data || [];

  // Filter by close date quarter
  const filteredOpps = useMemo(() => {
    if (quarterFilter === "all") return opps;
    let fy = fiscalYear;
    let fq = fiscalQuarter;
    if (quarterFilter !== "current") {
      const parts = quarterFilter.split("-");
      fy = parseInt(parts[0]);
      fq = parseInt(parts[1]);
    }
    const start = getQuarterStartDate(fy, fq);
    const end = getQuarterEndDate(fy, fq);
    return opps.filter((o) => {
      if (!o.close_date) return false;
      const d = new Date(o.close_date);
      return d >= start && d <= end;
    });
  }, [opps, quarterFilter, fiscalYear, fiscalQuarter]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPipelineAcv = filteredOpps.reduce((s, o) => s + (o.acv || 0), 0);
    const weightedPipelineAcv = filteredOpps.reduce(
      (s, o) => s + (o.acv || 0) * ((o.probability || 0) / 100),
      0
    );
    const dealCount = filteredOpps.length;
    const avgDealSize = dealCount > 0 ? totalPipelineAcv / dealCount : 0;

    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const closingThisQuarter = opps.filter((o) => {
      if (!o.close_date) return false;
      const d = new Date(o.close_date);
      return d >= qStart && d <= qEnd;
    }).length;

    return { totalPipelineAcv, weightedPipelineAcv, dealCount, avgDealSize, closingThisQuarter };
  }, [filteredOpps, opps, fiscalYear, fiscalQuarter]);

  // Pipeline by stage aggregation
  const stageData = useMemo(() => {
    const stages: Record<
      string,
      { deals: typeof filteredOpps; totalAcv: number; weightedAcv: number }
    > = {};
    filteredOpps.forEach((o) => {
      const stage = o.stage || "Other";
      if (!stages[stage]) stages[stage] = { deals: [], totalAcv: 0, weightedAcv: 0 };
      stages[stage].deals.push(o);
      stages[stage].totalAcv += o.acv || 0;
      stages[stage].weightedAcv += (o.acv || 0) * ((o.probability || 0) / 100);
    });

    const stageOrder = [...STAGES, "Other"];
    return Object.entries(stages)
      .sort(([a], [b]) => {
        const ai = stageOrder.indexOf(a);
        const bi = stageOrder.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(([stage, data]) => ({
        stage,
        deals: data.deals.length,
        totalAcv: data.totalAcv,
        weightedAcv: data.weightedAcv,
        avgDaysInStage: Math.round(
          data.deals.reduce((s, o) => {
            if (!o.last_stage_changed_at) return s;
            const days = Math.floor(
              (Date.now() - new Date(o.last_stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            return s + days;
          }, 0) / (data.deals.length || 1)
        ),
        oppList: data.deals,
      }));
  }, [filteredOpps]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

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
      render: (row) => (row.acv ? formatCurrency(row.acv as number) : "—"),
    },
    {
      key: "probability",
      header: "Prob %",
      render: (row) => (row.probability != null ? `${row.probability}%` : "—"),
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "is_paid_pilot",
      header: "Pilot",
      render: (row) =>
        row.is_paid_pilot ? <Badge variant="outline">Pilot</Badge> : null,
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error)
    return <ErrorState message="Failed to load pipeline data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={quarterFilter} onValueChange={(v) => v && setQuarterFilter(v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Quarter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quarters</SelectItem>
              <SelectItem value="current">Current Quarter</SelectItem>
              {quarters.map((q) => (
                <SelectItem key={q.label} value={`${q.fiscalYear}-${q.fiscalQuarter}`}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={(v) => v && setStageFilter(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Deal Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DEAL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pilotFilter} onValueChange={(v) => v && setPilotFilter(v)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Pilot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">Paid Pilot</SelectItem>
              <SelectItem value="no">Non-Pilot</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Pipeline ACV" value={kpis.totalPipelineAcv} format="currency" />
        <KpiCard label="Weighted Pipeline" value={kpis.weightedPipelineAcv} format="currency" />
        <KpiCard label="Deals in Pipeline" value={kpis.dealCount} format="number" />
        <KpiCard label="Avg Deal Size" value={kpis.avgDealSize} format="currency" />
        <KpiCard label="Closing This Quarter" value={kpis.closingThisQuarter} format="number" />
      </div>

      {/* Pipeline by Stage Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineByStageChart opportunities={filteredOpps as Opportunity[]} />
        </CardContent>
      </Card>

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
                <span className="text-right">Weighted ACV</span>
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
                    <span className="text-right">{formatCurrency(row.totalAcv)}</span>
                    <span className="text-right">{formatCurrency(row.weightedAcv)}</span>
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
            data={filteredOpps as unknown as Record<string, unknown>[]}
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
    </div>
  );
}
