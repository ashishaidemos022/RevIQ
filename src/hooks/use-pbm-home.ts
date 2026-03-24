"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";

export interface PbmHomeData {
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  deals_closed_qtd: number;
  quota_attainment_qtd: number;
  quota_attainment_ytd: number;
  fiscal_year: number;
  fiscal_quarter: number;
}

export function usePbmHome() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  return useQuery<PbmHomeData>({
    queryKey: ["pbm-home", viewAsUser?.user_id ?? null],
    queryFn: () => apiFetch("/api/pbm/home"),
  });
}
