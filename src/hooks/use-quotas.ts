"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Quota } from "@/types";

interface QuotasParams {
  fiscal_year?: number;
  user_id?: string;
  quota_type?: string;
}

interface QuotasResponse {
  data: Quota[];
}

export function useQuotas(params: QuotasParams = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return useQuery<QuotasResponse>({
    queryKey: ["quotas", params],
    queryFn: () => apiFetch(`/api/quotas?${searchParams.toString()}`),
  });
}
