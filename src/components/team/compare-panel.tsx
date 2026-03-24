"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";
import { CompareKpiGrid } from "./compare-kpi-grid";
import { CompareAcvChart } from "./compare-acv-chart";
import { CompareActivityChart } from "./compare-activity-chart";
import { CompareRadarChart } from "./compare-radar-chart";

interface AeData {
  id: string;
  full_name: string;
  role: string;
  region: string | null;
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  annual_quota: number;
  attainment: number;
  active_pilots: number;
  activities_qtd: number;
  commission_qtd: number;
}

interface CompareApiEntity {
  id: string;
  name: string;
  teamSize?: number;
  quarters: Array<{
    label: string;
    acvClosed: number;
    dealsClosed: number;
    activities: number;
    activePilots: number;
    commissionEarned: number;
  }>;
}

interface CompareResponse {
  data: {
    entities: CompareApiEntity[];
  };
}

interface ComparePanelProps {
  selectedAes: AeData[];
  onBack: () => void;
  mode?: "individual" | "team";
}

export function ComparePanel({ selectedAes, onBack, mode = "individual" }: ComparePanelProps) {
  const [metricMode, setMetricMode] = useState<"totals" | "perRep">("totals");
  const isTeamMode = mode === "team";

  const userIds = selectedAes.map((ae) => ae.id).join(",");

  const { data: compareData, isLoading, error, refetch } = useQuery({
    queryKey: ["team-compare", userIds, mode],
    queryFn: () =>
      apiFetch<CompareResponse>(`/api/team/compare?userIds=${userIds}&mode=${mode}`),
  });

  const entities = compareData?.data?.entities ?? [];

  // Build KPI entities from already-fetched AE data (no extra API call needed)
  const kpiEntities = selectedAes.map((ae) => ({
    id: ae.id,
    name: ae.full_name,
    teamSize: entities.find((e) => e.id === ae.id)?.teamSize,
    metrics: {
      acvClosedQTD: ae.acv_closed_qtd,
      acvClosedYTD: ae.acv_closed_ytd,
      attainment: ae.attainment,
      activePilots: ae.active_pilots,
      activitiesQTD: ae.activities_qtd,
      commissionQTD: ae.commission_qtd,
    },
  }));

  // Build radar entities from the same AE data
  const radarEntities = selectedAes.map((ae) => ({
    id: ae.id,
    name: ae.full_name,
    acvClosedQTD: ae.acv_closed_qtd,
    attainment: ae.attainment,
    activePilots: ae.active_pilots,
    activitiesQTD: ae.activities_qtd,
    commissionQTD: ae.commission_qtd,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Roster
          </Button>
          <h2 className="text-lg font-semibold">
            Comparing {selectedAes.length} {isTeamMode ? "teams" : "members"}
          </h2>
        </div>
        {isTeamMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMetricMode(metricMode === "totals" ? "perRep" : "totals")}
          >
            {metricMode === "totals" ? (
              <ToggleLeft className="mr-1 h-4 w-4" />
            ) : (
              <ToggleRight className="mr-1 h-4 w-4" />
            )}
            {metricMode === "totals" ? "Totals" : "Per-Rep Avg"}
          </Button>
        )}
      </div>

      {/* KPI Grid — uses already-loaded team data */}
      <CompareKpiGrid entities={kpiEntities} mode={metricMode} />

      {/* Charts — need rolling quarter data from API */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <ErrorState message="Failed to load comparison data" onRetry={refetch} />
      ) : entities.length > 0 ? (
        <div className="space-y-6">
          {/* Radar Chart */}
          <CompareRadarChart entities={radarEntities} />

          {/* Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CompareAcvChart entities={entities} />
            <CompareActivityChart entities={entities} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
