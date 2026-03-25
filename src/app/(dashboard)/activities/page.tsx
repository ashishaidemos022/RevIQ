"use client";

import { useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useActivities, ActivitySummaryRow } from "@/hooks/use-activities";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Zap } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const ACTIVITY_TYPES = [
  { value: "call", label: "Calls", color: "hsl(var(--chart-1))", countKey: "call_count" as const },
  { value: "email", label: "Emails", color: "hsl(var(--chart-2))", countKey: "email_count" as const },
  { value: "meeting", label: "Meetings", color: "hsl(var(--chart-3))", countKey: "meeting_count" as const },
  { value: "linkedin", label: "LinkedIn", color: "hsl(var(--chart-4))", countKey: "linkedin_count" as const },
];

type CountKey = "call_count" | "email_count" | "meeting_count" | "linkedin_count";

export default function ActivitiesPage() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
  const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);

  const [typeFilter, setTypeFilter] = useState("all");

  const {
    data: activitiesData,
    isLoading,
    error,
    refetch,
  } = useActivities({
    date_from: qStart.toISOString().split("T")[0],
    date_to: qEnd.toISOString().split("T")[0],
    limit: 5000,
  });

  const rows = activitiesData?.data || [];
  const totals = activitiesData?.totals;

  // Weekly trend chart data (stacked by type)
  const weeklyData = useMemo(() => {
    const weeks: Record<string, Record<string, number | string>> = {};

    rows.forEach((row) => {
      const date = new Date(row.activity_date);
      // Get start of week (Monday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date);
      weekStart.setDate(diff);
      const weekKey = weekStart.toISOString().split("T")[0];
      const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: label, call_count: 0, email_count: 0, meeting_count: 0, linkedin_count: 0 };
      }
      weeks[weekKey].call_count = (Number(weeks[weekKey].call_count) || 0) + (row.call_count || 0);
      weeks[weekKey].email_count = (Number(weeks[weekKey].email_count) || 0) + (row.email_count || 0);
      weeks[weekKey].meeting_count = (Number(weeks[weekKey].meeting_count) || 0) + (row.meeting_count || 0);
      weeks[weekKey].linkedin_count = (Number(weeks[weekKey].linkedin_count) || 0) + (row.linkedin_count || 0);
    });

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }, [rows]);

  // Activity by AE (Managers+ only)
  const aeActivityData = useMemo(() => {
    if (!isManager) return [];
    const aeMap: Record<
      string,
      { name: string; call: number; email: number; meeting: number; linkedin: number; total: number; lastDate: string }
    > = {};

    rows.forEach((row) => {
      const key = row.owner_sf_id;
      if (!aeMap[key]) {
        aeMap[key] = { name: row.full_name || row.ae_name, call: 0, email: 0, meeting: 0, linkedin: 0, total: 0, lastDate: "" };
      }
      aeMap[key].call += row.call_count || 0;
      aeMap[key].email += row.email_count || 0;
      aeMap[key].meeting += row.meeting_count || 0;
      aeMap[key].linkedin += row.linkedin_count || 0;
      aeMap[key].total += row.activity_count || 0;
      if (row.activity_date > aeMap[key].lastDate) {
        aeMap[key].lastDate = row.activity_date;
      }
    });

    return Object.values(aeMap).sort((a, b) => b.total - a.total);
  }, [rows, isManager]);

  const aeColumns: Column<Record<string, unknown>>[] = [
    { key: "name", header: "AE Name" },
    { key: "call", header: "Calls" },
    { key: "email", header: "Emails" },
    { key: "meeting", header: "Meetings" },
    { key: "linkedin", header: "LinkedIn" },
    { key: "total", header: "Total" },
    { key: "lastDate", header: "Last Activity" },
  ];

  // Filter chart data visually when a type filter is selected
  const chartTypes = typeFilter === "all"
    ? ACTIVITY_TYPES
    : ACTIVITY_TYPES.filter((t) => t.value === typeFilter);

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load activity data" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Activities</h1>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Activities QTD" value={totals?.activity_count ?? 0} format="number" />
        <KpiCard label="Calls" value={totals?.call_count ?? 0} format="number" />
        <KpiCard label="Emails" value={totals?.email_count ?? 0} format="number" />
        <KpiCard label="Meetings" value={totals?.meeting_count ?? 0} format="number" />
        <KpiCard label="LinkedIn" value={totals?.linkedin_count ?? 0} format="number" />
      </div>

      {/* Activity Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Activity Trend (Weekly)</CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyData.length === 0 ? (
            <EmptyState
              title="No activity data"
              description="No activities found for the current quarter"
              icon={Zap}
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {chartTypes.map((t) => (
                  <Bar
                    key={t.value}
                    dataKey={t.countKey}
                    name={t.label}
                    fill={t.color}
                    stackId="activities"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Activity by AE (Managers+ only) */}
      {isManager && aeActivityData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity by AE</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={aeActivityData as unknown as Record<string, unknown>[]}
              columns={aeColumns}
              pageSize={25}
            />
          </CardContent>
        </Card>
      )}

    </div>
  );
}
