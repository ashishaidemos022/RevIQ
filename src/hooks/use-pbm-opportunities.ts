"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";

interface PbmOpportunitiesParams {
  status?: "open" | "closed_won" | "closed_lost" | "all";
  is_paid_pilot?: boolean;
  sort_by?: "acv" | "close_date";
  sort_asc?: string;
  close_date_lte?: string;
  limit?: number;
  offset?: number;
}

export interface PbmOpportunity {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  reporting_acv: number | null;
  close_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  paid_pilot_start_date: string | null;
  paid_pilot_end_date: string | null;
  probability: number | null;
  forecast_category: string | null;
  type: string | null;
  mgmt_forecast_category: string | null;
  cxa_committed_arr: number | null;
  days_in_current_stage: number | null;
  last_stage_changed_at: string | null;
  accounts?: { id: string; name: string; industry: string; region: string };
  users?: { id: string; full_name: string; email: string };
  credit_path: string | null;
  partner_name: string | null;
  credited_pbm_name: string | null;
  credited_pbm_id: string | null;
}

interface PbmOpportunitiesResponse {
  data: PbmOpportunity[];
  total: number;
}

export function usePbmOpportunities(params: PbmOpportunitiesParams = {}) {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return useQuery<PbmOpportunitiesResponse>({
    queryKey: ["pbm-opportunities", params, viewAsUser?.user_id ?? null],
    queryFn: () => apiFetch(`/api/pbm/opportunities?${searchParams.toString()}`),
  });
}
