"use client";

import { ReactNode } from "react";
import { useTeamComposition } from "@/hooks/use-team-composition";
import { DashboardSkeleton } from "./loading-skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface DualViewPageProps {
  aeView: ReactNode;
  pbmView: ReactNode;
}

/**
 * Renders AE view, PBM view, or dual tabs based on the user's team composition.
 * Used by Home, Pipeline, and Performance pages.
 */
export function DualViewPage({ aeView, pbmView }: DualViewPageProps) {
  const { view, isLoading } = useTeamComposition();

  if (isLoading) return <DashboardSkeleton />;

  if (view === "ae" || view === "none") return <>{aeView}</>;
  if (view === "pbm") return <>{pbmView}</>;

  // "both" — show dual tabs
  return (
    <Tabs defaultValue="ae">
      <TabsList className="mb-4">
        <TabsTrigger value="ae">AE View</TabsTrigger>
        <TabsTrigger value="pbm">PBM View</TabsTrigger>
      </TabsList>
      <TabsContent value="ae">{aeView}</TabsContent>
      <TabsContent value="pbm">{pbmView}</TabsContent>
    </Tabs>
  );
}
