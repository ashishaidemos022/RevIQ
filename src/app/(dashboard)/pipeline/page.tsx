"use client";

import { PbmPipeline } from "@/components/pbm/pbm-pipeline";
import { AePipeline } from "./ae-pipeline";
import { DualViewPage } from "@/components/dashboard/dual-view-page";

export default function PipelinePage() {
  return <DualViewPage aeView={<AePipeline />} pbmView={<PbmPipeline />} />;
}
