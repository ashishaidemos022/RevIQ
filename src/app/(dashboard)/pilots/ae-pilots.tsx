"use client";

import { useMemo, useState } from "react";
import { useFilterParam } from "@/hooks/use-filter-param";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  getCurrentFiscalPeriod,
  getQuarterStartDate,
  getQuarterEndDate,
  getForwardQuarters,
} from "@/lib/fiscal";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpportunityDrawer } from "@/components/dashboard/opportunity-drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FlaskConical, Filter, RotateCcw } from "lucide-react";
import { PilotPipelineLinkage } from "@/components/dashboard/pilot-pipeline-linkage";
import { PilotConversionTracker } from "@/components/dashboard/pilot-conversion-tracker";
import { PilotDurationAnalytics } from "@/components/dashboard/pilot-duration-analytics";
import { PilotRiskPanel } from "@/components/dashboard/pilot-risk-panel";
import { PilotStageProgress } from "@/components/dashboard/pilot-stage-progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const BOOKED_STAGES = [
  "Stage 8-Closed Won: Finance",
  "Stage 7-Closed Won",
  "Stage 6-Closed-Won: Finance Approved",
  "Stage 5-Closed Won",
];

const OPEN_PILOT_STAGES = [
  "Stage 0",
  "Stage 1-Business Discovery",
  "Stage 1-Renewal Placeholder",
  "Stage 2-Renewal Under Management",
  "Stage 2-Solution Discovery",
  "Stage 3-Evaluation",
  "Stage 3-Proposal",
  "Stage 4-Shortlist",
  "Stage 4-Verbal",
  "Stage 5-Vendor of Choice",
  "Stage 6-Commit",
];

type PilotStatus = "Active" | "Converted" | "Expired" | "Lost";

const statusBadgeVariant: Record<PilotStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Active: "default",
  Converted: "secondary",
  Expired: "destructive",
  Lost: "destructive",
};

// Quarter filter options are built dynamically from getForwardQuarters(4)

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

interface PilotOpp {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  sf_created_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  paid_pilot_end_date: string | null;
  pilot_implementation_stage: string | null;
  age: number | null;
  accounts?: { id: string; name: string };
  users?: { id: string; full_name: string; email: string };
  [key: string]: unknown;
}

interface PilotsResponse {
  data: PilotOpp[];
  kpis: {
    booked_pilots: number;
    win_rate: number;
    conversion_rate: number;
    avg_deal_duration: number;
  };
}

function getPilotStatus(opp: PilotOpp): PilotStatus {
  if (opp.is_closed_won) return "Converted";
  if (opp.is_closed_lost) return "Lost";
  if (opp.paid_pilot_end_date) {
    const endDate = new Date(opp.paid_pilot_end_date);
    if (endDate < new Date()) return "Expired";
  }
  return "Active";
}

const fmtMonth = (v: string) => {
  const [y, m] = v.split("-");
  return `${MONTH_LABELS[m] || m} '${y.slice(2)}`;
};

export function AePilots() {
  const [selectedOpp, setSelectedOpp] = useState<string | null>(null);
  const [drillChart, setDrillChart] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const quarters = getForwardQuarters(4);
  const defaultQuarter = `${fiscalYear}-${fiscalQuarter}`;
  const [quarterFilter, setQuarterFilter] = useFilterParam("quarter", defaultQuarter);

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery<PilotsResponse>({
    queryKey: ["ae-pilots"],
    queryFn: () => apiFetch("/api/pilots"),
  });

  const allPilots = response?.data || [];
  const serverKpis = response?.kpis;

  // Filter by quarter
  const pilots = useMemo(() => {
    const parts = quarterFilter.split("-");
    const fy = parseInt(parts[0]) || fiscalYear;
    const fq = parseInt(parts[1]) || fiscalQuarter;
    const start = getQuarterStartDate(fy, fq).toISOString().split("T")[0];
    const end = getQuarterEndDate(fy, fq).toISOString().split("T")[0];
    return allPilots.filter((o) => {
      if (!o.close_date) return false;
      return o.close_date >= start && o.close_date <= end;
    });
  }, [allPilots, quarterFilter, fiscalYear, fiscalQuarter]);

  // Recompute KPIs for the filtered set
  const kpis = useMemo(() => {
    const booked = pilots.filter((p) => BOOKED_STAGES.includes(p.stage));
    const won = pilots.filter((p) => p.is_closed_won);
    const lost = pilots.filter((p) => p.is_closed_lost);
    const winRate = (won.length + lost.length) > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;

    const ages = pilots.map((p) => p.age).filter((a): a is number => a !== null && a >= 0);
    const avgDealDuration = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;

    return {
      booked_pilots: booked.length,
      win_rate: winRate,
      conversion_rate: serverKpis?.conversion_rate || 0,
      avg_deal_duration: avgDealDuration,
    };
  }, [pilots, quarterFilter, serverKpis]);

  // Chart 1: Booked Pilots by close month
  const bookedChartData = useMemo(() => {
    const map: Record<string, PilotOpp[]> = {};
    pilots.filter((p) => BOOKED_STAGES.includes(p.stage)).forEach((p) => {
      const month = p.close_date?.substring(0, 7) || "Unknown";
      if (!map[month]) map[month] = [];
      map[month].push(p);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, opps]) => ({ month, count: opps.length, opps }));
  }, [pilots]);

  // Chart 2: Open Paid Pilot Deals by close month
  const openChartData = useMemo(() => {
    const map: Record<string, PilotOpp[]> = {};
    pilots.filter((p) => OPEN_PILOT_STAGES.includes(p.stage)).forEach((p) => {
      const month = p.close_date?.substring(0, 7) || "Unknown";
      if (!map[month]) map[month] = [];
      map[month].push(p);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, opps]) => ({ month, count: opps.length, opps }));
  }, [pilots]);

  // Chart 3: Pilots Added to Pipeline by sf_created_date month
  const addedChartData = useMemo(() => {
    const map: Record<string, PilotOpp[]> = {};
    pilots.forEach((p) => {
      const month = p.sf_created_date?.substring(0, 7) || "Unknown";
      if (!map[month]) map[month] = [];
      map[month].push(p);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, opps]) => ({ month, count: opps.length, opps }));
  }, [pilots]);

  // Get drilled-down deals list
  const drillDeals = useMemo(() => {
    if (!drillChart || !drillMonth) return [];
    const chart = drillChart === "booked" ? bookedChartData : drillChart === "open" ? openChartData : addedChartData;
    return chart.find((c) => c.month === drillMonth)?.opps || [];
  }, [drillChart, drillMonth, bookedChartData, openChartData, addedChartData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = (chartName: string) => (data: any) => {
    const month = data?.payload?.month || data?.month;
    if (!month) return;
    if (drillChart === chartName && drillMonth === month) {
      setDrillChart(null);
      setDrillMonth(null);
    } else {
      setDrillChart(chartName);
      setDrillMonth(month);
    }
  };

  const drillColumns: Column<Record<string, unknown>>[] = [
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
    { key: "name", header: "Opportunity" },
    {
      key: "stage",
      header: "Stage",
      render: (row) => <Badge variant="secondary">{row.stage as string}</Badge>,
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "age",
      header: "Duration (Days)",
      render: (row) => (row.age != null ? `${row.age}d` : "—"),
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
    { key: "name", header: "Opportunity" },
    {
      key: "stage",
      header: "Stage",
      render: (row) => <Badge variant="secondary">{row.stage as string}</Badge>,
    },
    { key: "close_date", header: "Close Date" },
    {
      key: "age",
      header: "Duration (Days)",
      render: (row) => (row.age != null ? `${row.age}d` : "—"),
    },
    {
      key: "implementation",
      header: "Implementation",
      render: (row) => (
        <PilotStageProgress stage={row.pilot_implementation_stage as string | null} compact />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status = getPilotStatus(row as unknown as PilotOpp);
        return <Badge variant={statusBadgeVariant[status]}>{status}</Badge>;
      },
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load pilot data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Paid Pilots</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setQuarterFilter(defaultQuarter)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <MultiSelect
            options={quarters.map((q) => ({ value: `${q.fiscalYear}-${q.fiscalQuarter}`, label: q.label }))}
            value={[quarterFilter]}
            onChange={(v) => setQuarterFilter(v[v.length - 1] || defaultQuarter)}
            placeholder="Quarter"
            className="w-[160px]"
          />
        </div>
      </div>

      {/* At-Risk Pipeline Alert */}
      <PilotRiskPanel />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Booked Pilots" value={kpis.booked_pilots} format="number" />
        <KpiCard label="Paid Pilot Win Rate" value={kpis.win_rate} format="percent" />
        <KpiCard label="Paid Pilot Conversion Rate" value={kpis.conversion_rate} format="percent" />
        <KpiCard label="Avg Pilot Deal Duration" value={`${kpis.avg_deal_duration}d`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Booked Pilots */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Booked Pilots</CardTitle>
          </CardHeader>
          <CardContent>
            {bookedChartData.length === 0 ? (
              <EmptyState title="No data" description="No booked pilots found" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bookedChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={fmtMonth} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip labelFormatter={(v: any) => fmtMonth(String(v))} />
                  <Bar dataKey="count" fill="#5405BD" cursor="pointer" radius={[4, 4, 0, 0]} onClick={handleBarClick("booked")} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Open Paid Pilot Deals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Paid Pilot Deals</CardTitle>
          </CardHeader>
          <CardContent>
            {openChartData.length === 0 ? (
              <EmptyState title="No data" description="No open pilot deals" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={openChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={fmtMonth} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip labelFormatter={(v: any) => fmtMonth(String(v))} />
                  <Bar dataKey="count" fill="#14C3B7" cursor="pointer" radius={[4, 4, 0, 0]} onClick={handleBarClick("open")} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pilots Added to Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Paid Pilots Added to Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {addedChartData.length === 0 ? (
              <EmptyState title="No data" description="No pilots found" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={addedChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={fmtMonth} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip labelFormatter={(v: any) => fmtMonth(String(v))} />
                  <Bar dataKey="count" fill="#FFCC00" cursor="pointer" radius={[4, 4, 0, 0]} onClick={handleBarClick("added")} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drill-down modal for chart clicks */}
      <Dialog
        open={!!(drillChart && drillMonth && drillDeals.length > 0)}
        onOpenChange={(open) => {
          if (!open) {
            setDrillChart(null);
            setDrillMonth(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drillChart === "booked" ? "Booked Pilots" : drillChart === "open" ? "Open Pilot Deals" : "Pilots Added"} — {drillMonth ? fmtMonth(drillMonth) : ""}
            </DialogTitle>
          </DialogHeader>
          <DataTable
            data={drillDeals as unknown as Record<string, unknown>[]}
            columns={drillColumns}
            pageSize={10}
            onRowClick={(row) => setSelectedOpp(row.id as string)}
          />
        </DialogContent>
      </Dialog>

      {/* Pilot → Pipeline Linkage */}
      <PilotPipelineLinkage />

      {/* Pilot Conversion Tracker */}
      <PilotConversionTracker />

      {/* Pilot Duration Analytics */}
      <PilotDurationAnalytics pilots={allPilots as PilotOpp[]} />

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
