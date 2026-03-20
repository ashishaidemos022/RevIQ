"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface PbmHomeData {
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  deals_closed_qtd: number;
  commission_earned_qtd: number;
  commission_projected_qtd: number;
  quota_attainment: number;
  fiscal_year: number;
  fiscal_quarter: number;
}

export function usePbmHome() {
  return useQuery<PbmHomeData>({
    queryKey: ["pbm-home"],
    queryFn: () => apiFetch("/api/pbm/home"),
  });
}
