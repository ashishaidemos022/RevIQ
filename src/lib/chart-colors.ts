/**
 * Comparison chart color palette.
 *
 * Hardcoded hex values are required because Recharts renders SVG directly
 * and CSS custom properties (hsl(var(--chart-x))) don't resolve in SVG
 * fill/stroke attributes. These colors match the Talkdesk theme:
 *
 * 1. Purple (#7c3aed)  — Talkdesk brand
 * 2. Teal   (#14b8a6)  — high contrast against purple
 * 3. Gold   (#eab308)  — Talkdesk accent
 * 4. Rose   (#f43f5e)  — warm contrast
 */
export const COMPARE_COLORS = [
  "#7c3aed",
  "#14b8a6",
  "#eab308",
  "#f43f5e",
] as const;

/** Softer fills for area/radar charts */
export const COMPARE_FILLS = [
  "rgba(124, 58, 237, 0.2)",
  "rgba(20, 184, 166, 0.2)",
  "rgba(234, 179, 8, 0.2)",
  "rgba(244, 63, 94, 0.2)",
] as const;
