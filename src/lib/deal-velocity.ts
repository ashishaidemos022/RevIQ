import { SS0_SS2_STAGES, QUALIFIED_STAGES } from "./stage-groups";

export type AgingSeverity = "healthy" | "warning" | "critical";

export interface AgingThreshold {
  warning: number; // days
  critical: number; // days
}

export type AgingThresholdMap = Record<string, AgingThreshold>;

/** Per-stage aging thresholds — later stages have tighter thresholds */
export const DEFAULT_STAGE_THRESHOLDS: AgingThresholdMap = {
  // Early pipeline — more slack
  "Stage 0": { warning: 30, critical: 60 },
  "Stage 1-Business Discovery": { warning: 25, critical: 50 },
  "Stage 1-Renewal Placeholder": { warning: 25, critical: 50 },
  "Stage 2-Renewal Under Management": { warning: 25, critical: 50 },
  "Stage 2-Solution Discovery": { warning: 25, critical: 50 },
  // Qualified — should move faster
  "Stage 3-Evaluation": { warning: 21, critical: 45 },
  "Stage 3-Proposal": { warning: 21, critical: 45 },
  "Stage 4-Shortlist": { warning: 14, critical: 30 },
  "Stage 4-Verbal": { warning: 14, critical: 30 },
  // Late stage — tight deadlines
  "Stage 5-Vendor of Choice": { warning: 10, critical: 21 },
  "Stage 6-Commit": { warning: 7, critical: 14 },
};

const DEFAULT_FALLBACK: AgingThreshold = { warning: 21, critical: 45 };

/** All stage names that have configurable thresholds, in pipeline order */
export const ALL_THRESHOLD_STAGES = [
  ...SS0_SS2_STAGES,
  ...QUALIFIED_STAGES,
];

export function getAgingThreshold(
  stage: string,
  customThresholds?: AgingThresholdMap
): AgingThreshold {
  if (customThresholds?.[stage]) return customThresholds[stage];
  return DEFAULT_STAGE_THRESHOLDS[stage] || DEFAULT_FALLBACK;
}

export function getAgingSeverity(
  stage: string,
  daysInStage: number | null | undefined,
  customThresholds?: AgingThresholdMap
): AgingSeverity {
  if (daysInStage == null || daysInStage <= 0) return "healthy";
  const threshold = getAgingThreshold(stage, customThresholds);
  if (daysInStage >= threshold.critical) return "critical";
  if (daysInStage >= threshold.warning) return "warning";
  return "healthy";
}

export interface AgingDeal {
  id: string;
  name: string;
  accountName: string;
  ownerName: string;
  stage: string;
  acv: number;
  daysInStage: number;
  severity: AgingSeverity;
  threshold: AgingThreshold;
}

export interface AgingSummary {
  criticalCount: number;
  warningCount: number;
  criticalAcv: number;
  warningAcv: number;
  deals: AgingDeal[];
}

/** Analyze a set of opportunities for stage aging issues */
export function analyzeStageAging(
  opportunities: Array<{
    id: string;
    name: string;
    stage: string;
    acv?: number | null;
    days_in_current_stage?: number | null;
    accounts?: { name: string } | null;
    users?: { full_name: string } | null;
  }>,
  customThresholds?: AgingThresholdMap
): AgingSummary {
  const deals: AgingDeal[] = [];

  for (const opp of opportunities) {
    const days = opp.days_in_current_stage;
    if (days == null || days <= 0) continue;

    const severity = getAgingSeverity(opp.stage, days, customThresholds);
    if (severity === "healthy") continue;

    deals.push({
      id: opp.id,
      name: opp.name,
      accountName: opp.accounts?.name || "—",
      ownerName: opp.users?.full_name || "—",
      stage: opp.stage,
      acv: opp.acv || 0,
      daysInStage: days,
      severity,
      threshold: getAgingThreshold(opp.stage, customThresholds),
    });
  }

  // Sort: critical first, then by days descending
  deals.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.daysInStage - a.daysInStage;
  });

  return {
    criticalCount: deals.filter((d) => d.severity === "critical").length,
    warningCount: deals.filter((d) => d.severity === "warning").length,
    criticalAcv: deals
      .filter((d) => d.severity === "critical")
      .reduce((s, d) => s + d.acv, 0),
    warningAcv: deals
      .filter((d) => d.severity === "warning")
      .reduce((s, d) => s + d.acv, 0),
    deals,
  };
}

/** Get the average velocity (days per stage) for a set of completed (won) deals */
export function getStageGroupLabel(stage: string): string {
  if (SS0_SS2_STAGES.includes(stage)) return "Early (SS0–SS2)";
  if (QUALIFIED_STAGES.includes(stage)) return "Qualified (SS3+)";
  return "Other";
}
