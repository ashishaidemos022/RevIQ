"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { PbmOpportunity } from "./use-pbm-opportunities";

export interface PbmPilotsKpis {
  booked_pilots: number;
  win_rate: number;
  conversion_rate: number;
  avg_deal_duration: number;
}

interface PbmPilotsResponse {
  data: (PbmOpportunity & { pilot_status: string; age: number | null })[];
  kpis: PbmPilotsKpis;
}

export function usePbmPilots() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  return useQuery<PbmPilotsResponse>({
    queryKey: ["pbm-pilots", viewAsUser?.user_id ?? null],
    queryFn: () => apiFetch("/api/pbm/pilots"),
  });
}
