/**
 * Shared helpers for querying opportunities through the opportunity_splits table.
 *
 * DATA SOURCE RULE: All AE pipeline/revenue/deal queries MUST go through
 * opportunity_splits to correctly attribute deals to split owners and avoid
 * double-counting when multiple AEs split a single deal.
 *
 * Formula: attributed_value = opportunity_value * split_percentage / 100
 */

/** Only use Revenue splits — these sum to exactly 100% per opportunity. */
export const REVENUE_SPLIT_TYPE = 'Revenue';

/** Compute split-adjusted value. split_percentage is stored as whole number (e.g. 50 = 50%). */
export function splitAcv(value: number | string | null, splitPct: number | string | null): number {
  const v = typeof value === 'string' ? parseFloat(value) : (value || 0);
  const p = typeof splitPct === 'string' ? parseFloat(splitPct) : (splitPct || 0);
  return v * p / 100;
}

/**
 * Flattens a PostgREST split+opportunity join result into a flat record.
 * Input shape: { split_owner_user_id, split_percentage, opportunities: { ...fields } }
 * Output shape: { split_owner_user_id, split_pct, ...fields }
 */
export function flattenSplitRow<T extends Record<string, unknown>>(
  row: { split_owner_user_id: string; split_percentage: number | string; opportunities: T }
): T & { split_owner_user_id: string; split_pct: number } {
  const pct = typeof row.split_percentage === 'string' ? parseFloat(row.split_percentage) : (row.split_percentage || 0);
  return {
    ...row.opportunities,
    split_owner_user_id: row.split_owner_user_id,
    split_pct: pct,
  };
}

/**
 * Flattens an array of split+opportunity join results.
 */
export function flattenSplitRows<T extends Record<string, unknown>>(
  rows: Array<{ split_owner_user_id: string; split_percentage: number | string; opportunities: T }>
): Array<T & { split_owner_user_id: string; split_pct: number }> {
  return rows.map(flattenSplitRow);
}
