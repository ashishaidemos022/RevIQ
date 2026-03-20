"use client";

import { useAuthStore } from "@/stores/auth-store";
import { PbmPipeline } from "@/components/pbm/pbm-pipeline";
import { AePipeline } from "./ae-pipeline";
import { PBM_ROLES } from "@/lib/constants";

export default function PipelinePage() {
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const user = useAuthStore((s) => s.user);

  const effectiveRole = viewAsUser?.role ?? user?.role;
  if (effectiveRole && PBM_ROLES.includes(effectiveRole)) {
    return <PbmPipeline />;
  }

  return <AePipeline />;
}
