"use client";

import { PbmPilots } from "@/components/pbm/pbm-pilots";
import { AePilots } from "./ae-pilots";
import { DualViewPage } from "@/components/dashboard/dual-view-page";

export default function PilotsPage() {
  return <DualViewPage aeView={<AePilots />} pbmView={<PbmPilots />} />;
}
