"use client";

import { useAuthStore } from "@/stores/auth-store";
import { PbmPilots } from "@/components/pbm/pbm-pilots";
import { AePilots } from "./ae-pilots";
import { PBM_ROLES } from "@/lib/constants";

export default function PilotsPage() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const user = useAuthStore((s) => s.user);

  const effectiveRole = viewAsUser?.role ?? user?.role;
  if (effectiveRole && PBM_ROLES.includes(effectiveRole)) {
    return <PbmPilots />;
  }

  return <AePilots />;
}
