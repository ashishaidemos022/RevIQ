"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Commission } from "@/types";

interface CommissionsParams {
  fiscal_year?: number;
  fiscal_quarter?: number;
  user_id?: string;
  is_finalized?: boolean;
}

interface CommissionsResponse {
  data: Commission[];
}

export function useCommissions(params: CommissionsParams = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return useQuery<CommissionsResponse>({
    queryKey: ["commissions", params],
    queryFn: () => apiFetch(`/api/commissions?${searchParams.toString()}`),
  });
}
