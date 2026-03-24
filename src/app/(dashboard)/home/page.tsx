"use client";

import { PbmHome } from "@/components/pbm/pbm-home";
import { AeHome } from "./ae-home";
import { DualViewPage } from "@/components/dashboard/dual-view-page";

export default function HomePage() {
  return <DualViewPage aeView={<AeHome />} pbmView={<PbmHome />} />;
}
