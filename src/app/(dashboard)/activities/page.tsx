"use client";

import { useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useActivities } from "@/hooks/use-activities";
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
  { value: "call", label: "Calls", color: "hsl(var(--chart-1))" },
  { value: "email", label: "Emails", color: "hsl(var(--chart-2))" },
  { value: "meeting", label: "Meetings", color: "hsl(var(--chart-3))" },
  { value: "linkedin", label: "LinkedIn Activity", color: "hsl(var(--chart-4))" },
];

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
    ...(typeFilter !== "all" && { activity_type: typeFilter }),
    limit: 500,
  });

  const activities = activitiesData?.data || [];

  const kpis = useMemo(() => {
    const calls = activities.filter((a) => a.activity_type === "call").length;
    const emails = activities.filter((a) => a.activity_type === "email").length;
    const meetings = activities.filter((a) => a.activity_type === "meeting").length;
    const demos = activities.filter((a) => a.activity_type === "demo").length;
    const accountsTouched = new Set(activities.map((a) => a.account_id).filter(Boolean)).size;

    return {
      total: activities.length,
      calls,
      emails,
      meetings,
      demos,
      accountsTouched,
    };
  }, [activities]);

  // Weekly trend chart data (stacked by type)
  const weeklyData = useMemo(() => {
    const weeks: Record<string, Record<string, number | string>> = {};

    activities.forEach((a) => {
      const date = new Date(a.activity_date);
      // Get start of week (Monday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date);
      weekStart.setDate(diff);
      const weekKey = weekStart.toISOString().split("T")[0];
      const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: label, call: 0, email: 0, meeting: 0, demo: 0, other: 0 };
      }
      const type = a.activity_type || "other";
      weeks[weekKey][type] = (Number(weeks[weekKey][type]) || 0) + 1;
    });

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }, [activities]);

  // Activity by AE (Managers+ only)
  const aeActivityData = useMemo(() => {
    if (!isManager) return [];
    const aeMap: Record<
      string,
      { name: string; call: number; email: number; meeting: number; demo: number; total: number; lastDate: string }
    > = {};

    activities.forEach((a) => {
      const aeId = a.owner_user_id || "unknown";
      const aeName = a.users?.full_name || "Unknown";
      if (!aeMap[aeId]) {
        aeMap[aeId] = { name: aeName, call: 0, email: 0, meeting: 0, demo: 0, total: 0, lastDate: "" };
      }
      const type = a.activity_type;
      if (type === "call" || type === "email" || type === "meeting" || type === "demo") {
        aeMap[aeId][type]++;
      }
      aeMap[aeId].total++;
      if (a.activity_date > aeMap[aeId].lastDate) {
        aeMap[aeId].lastDate = a.activity_date;
      }
    });

    return Object.values(aeMap).sort((a, b) => b.total - a.total);
  }, [activities, isManager]);

  const aeColumns: Column<Record<string, unknown>>[] = [
    { key: "name", header: "AE Name" },
    { key: "call", header: "Calls" },
    { key: "email", header: "Emails" },
    { key: "meeting", header: "Meetings" },
    { key: "demo", header: "Demos" },
    { key: "total", header: "Total" },
    { key: "lastDate", header: "Last Activity" },
  ];

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Activities QTD" value={kpis.total} format="number" />
        <KpiCard label="Calls" value={kpis.calls} format="number" />
        <KpiCard label="Emails" value={kpis.emails} format="number" />
        <KpiCard label="Meetings" value={kpis.meetings} format="number" />
        <KpiCard label="Demos" value={kpis.demos} format="number" />
        <KpiCard label="Accounts Touched" value={kpis.accountsTouched} format="number" />
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
                {ACTIVITY_TYPES.filter((t) => t.value !== "other").map((t) => (
                  <Bar
                    key={t.value}
                    dataKey={t.value}
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
