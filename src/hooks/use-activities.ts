"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface ActivitiesParams {
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface ActivitySummaryRow {
  id: string;
  owner_sf_id: string;
  ae_name: string;
  activity_date: string;
  activity_count: number;
  call_count: number;
  email_count: number;
  linkedin_count: number;
  meeting_count: number;
  synced_at: string;
  // Enriched from users table
  user_id: string | null;
  full_name: string;
  region: string | null;
}

export interface ActivityTotals {
  activity_count: number;
  call_count: number;
  email_count: number;
  linkedin_count: number;
  meeting_count: number;
}

interface ActivitiesResponse {
  data: ActivitySummaryRow[];
  totals: ActivityTotals;
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
