/**
 * Valid deal subtypes for "Deals Closed" count.
 * Only opportunities with one of these sub_type values AND acv > 0
 * are counted toward the Deals Closed metric.
 */
export const COUNTABLE_DEAL_SUBTYPES = [
  'Renewal with expansion',
  'Renewal with downgrade',
  'Renewal only',
  'New Logo',
  'Expansion',
  'Cross sell',
] as const;
