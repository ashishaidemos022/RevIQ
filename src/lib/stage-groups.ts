/** Stages excluded from open pipeline entirely (closed/dead/won) */
export const EXCLUDED_STAGES = [
  'Closed Lost',
  'Dead-Duplicate',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
  'Stage 7-Closed Won',
  'Stage 8-Closed Won: Finance',
];

/** Early pipeline stages (SS0–SS2) */
export const SS0_SS2_STAGES = [
  'Stage 0',
  'Stage 1-Business Discovery',
  'Stage 1-Renewal Placeholder',
  'Stage 2-Renewal Under Management',
  'Stage 2-Solution Discovery',
];

/** Qualified pipeline stages (SS3+) */
export const QUALIFIED_STAGES = [
  'Stage 3-Evaluation',
  'Stage 3-Proposal',
  'Stage 4-Shortlist',
  'Stage 4-Verbal',
  'Stage 5-Vendor of Choice',
  'Stage 6-Commit',
];

export function getStageGroup(stage: string): string | null {
  if (EXCLUDED_STAGES.includes(stage)) return null;
  if (SS0_SS2_STAGES.includes(stage)) return 'SS0-SS2';
  if (QUALIFIED_STAGES.includes(stage)) return 'Qualified Pipeline';
  return null;
}
