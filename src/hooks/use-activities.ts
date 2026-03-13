"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Activity } from "@/types";

interface ActivitiesParams {
  activity_type?: string;
  date_from?: string;
  date_to?: string;
  owner_user_id?: string;
  limit?: number;
  offset?: number;
}

interface ActivitiesResponse {
  data: (Activity & {
    accounts?: { id: string; name: string };
    opportunities?: { id: string; name: string };
    users?: { id: string; full_name: string };
  })[];
  total: number;
}

export function useActivities(params: ActivitiesParams = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  return useQuery<ActivitiesResponse>({
    queryKey: ["activities", params],
    queryFn: () => apiFetch(`/api/activities?${searchParams.toString()}`),
  });
}
