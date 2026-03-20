"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PbmOpportunity } from "./use-pbm-opportunities";

export interface PbmPilotsKpis {
  active: number;
  total_acv: number;
  conversion_rate: number;
  avg_duration: number;
  expiring_30d: number;
}

interface PbmPilotsResponse {
  data: (PbmOpportunity & { pilot_status: string })[];
  kpis: PbmPilotsKpis;
}

export function usePbmPilots() {
  return useQuery<PbmPilotsResponse>({
    queryKey: ["pbm-pilots"],
    queryFn: () => apiFetch("/api/pbm/pilots"),
  });
}
