"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
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
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  return useQuery<PbmPilotsResponse>({
    queryKey: ["pbm-pilots", viewAsUser?.user_id ?? null],
    queryFn: () => apiFetch("/api/pbm/pilots"),
  });
}
