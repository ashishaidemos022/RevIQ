"use client";

import { useAuthStore } from "@/stores/auth-store";
import { PbmHome } from "@/components/pbm/pbm-home";
import { AeHome } from "./ae-home";
import { PBM_ROLES } from "@/lib/constants";

export default function HomePage() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const user = useAuthStore((s) => s.user);

  const effectiveRole = viewAsUser?.role ?? user?.role;
  if (effectiveRole && PBM_ROLES.includes(effectiveRole)) {
    return <PbmHome />;
  }

  return <AeHome />;
}
