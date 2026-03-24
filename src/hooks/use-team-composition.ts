"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { FULL_ACCESS_ROLES, PBM_ROLES, AE_ROLES } from "@/lib/constants";

interface TeamComposition {
  hasAeReports: boolean;
  hasPbmReports: boolean;
}

/**
 * Determines what view(s) the current user should see:
 * - "ae" — AE view only
 * - "pbm" — PBM view only
 * - "both" — dual tabs (AE + PBM)
 * - "none" — no data pages (e.g., `other` role with no override)
 *
 * For IC roles, this is determined locally (no API call).
 * For leaders and full-access roles, calls /api/team-composition.
 */
export function useTeamComposition() {
  const user = useAuthStore((s) => s.user);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const effectiveRole = viewAsUser?.role ?? user?.role;

  // IC roles — no API call needed
  const isAeIc = effectiveRole && AE_ROLES.includes(effectiveRole);
  const isPbmIc = effectiveRole && PBM_ROLES.includes(effectiveRole);
  const isOther = effectiveRole === "other";
  const isFullAccess = effectiveRole && FULL_ACCESS_ROLES.includes(effectiveRole);
  const needsApiCall = effectiveRole === "leader" || isFullAccess;

  const { data, isLoading } = useQuery({
    queryKey: ["team-composition", viewAsUser?.user_id ?? user?.user_id],
    queryFn: () => apiFetch<{ data: TeamComposition }>("/api/team-composition"),
    enabled: !!needsApiCall,
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });

  if (!effectiveRole) {
    return { view: "ae" as const, isLoading: true };
  }

  // IC roles — determined locally
  if (isAeIc) return { view: "ae" as const, isLoading: false };
  if (isPbmIc) return { view: "pbm" as const, isLoading: false };
  if (isOther && !needsApiCall) return { view: "none" as const, isLoading: false };

  // Leader / full-access — determined by API
  if (isLoading) return { view: "ae" as const, isLoading: true };

  const comp = data?.data;
  if (comp?.hasAeReports && comp?.hasPbmReports) return { view: "both" as const, isLoading: false };
  if (comp?.hasPbmReports) return { view: "pbm" as const, isLoading: false };
  if (comp?.hasAeReports) return { view: "ae" as const, isLoading: false };

  // Fallback
  return { view: "ae" as const, isLoading: false };
}
