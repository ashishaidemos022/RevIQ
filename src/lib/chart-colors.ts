/**
 * Comparison chart color palette.
 * Uses CSS custom properties from the theme (--chart-1 through --chart-4).
 * Max 4 entities can be compared simultaneously.
 */
export const COMPARE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-2))",
] as const;

/** Softer fills for area/radar charts (20% opacity) */
export const COMPARE_FILLS = [
  "hsl(var(--chart-1) / 0.2)",
  "hsl(var(--chart-3) / 0.2)",
  "hsl(var(--chart-4) / 0.2)",
  "hsl(var(--chart-2) / 0.2)",
] as const;
