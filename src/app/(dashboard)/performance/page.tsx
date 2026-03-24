"use client";

import { PbmPerformance } from "@/components/pbm/pbm-performance";
import { DualViewPage } from "@/components/dashboard/dual-view-page";
import { AePerformance } from "./ae-performance";

export default function PerformancePage() {
  return <DualViewPage aeView={<AePerformance />} pbmView={<PbmPerformance />} />;
}
