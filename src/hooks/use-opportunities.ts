"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Opportunity } from "@/types";

interface OpportunitiesParams {
  status?: "open" | "closed_won" | "closed_lost" | "all";
  is_paid_pilot?: boolean;
  fiscal_year?: number;
  fiscal_quarter?: number;
  stage?: string;
  type?: string;
  owner_user_id?: string;
  close_date_lte?: string;
  sort_by?: string;
  sort_asc?: string;
  limit?: number;
  offset?: number;
}

interface OpportunitiesResponse {
  data: (Opportunity & {
    accounts?: { id: string; name: string; industry: string; region: string };
    users?: { id: string; full_name: string; email: string };
  })[];
  total: number;
}

export function useOpportunities(params: OpportunitiesParams = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return useQuery<OpportunitiesResponse>({
    queryKey: ["opportunities", params],
    queryFn: () => apiFetch(`/api/opportunities?${searchParams.toString()}`),
  });
}
