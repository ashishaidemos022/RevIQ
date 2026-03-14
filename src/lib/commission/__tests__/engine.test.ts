import { describe, it, expect } from 'vitest';
import {
  resolveCommissionRate,
  calculateUsageMultiplier,
  calculateCommission,
} from '../engine';

describe('resolveCommissionRate', () => {
  const rates = [
    { user_id: null, fiscal_year: 2027, fiscal_quarter: null, deal_type: null, rate: 0.08 }, // global default
    { user_id: 'ae-1', fiscal_year: 2027, fiscal_quarter: null, deal_type: null, rate: 0.10 }, // AE year
    { user_id: 'ae-1', fiscal_year: 2027, fiscal_quarter: 1, deal_type: null, rate: 0.12 }, // AE Q1
    { user_id: 'ae-1', fiscal_year: 2027, fiscal_quarter: 1, deal_type: 'new_business', rate: 0.15 }, // AE Q1 new_business
  ];

  it('returns exact match (AE + Quarter + Deal Type)', () => {
    expect(resolveCommissionRate(rates, 'ae-1', 2027, 1, 'new_business')).toBe(0.15);
  });

  it('falls back to AE + Quarter when deal type does not match', () => {
    expect(resolveCommissionRate(rates, 'ae-1', 2027, 1, 'renewal')).toBe(0.12);
  });

  it('falls back to AE + Year when quarter does not match', () => {
    expect(resolveCommissionRate(rates, 'ae-1', 2027, 3, null)).toBe(0.10);
  });

  it('falls back to global default for unknown AE', () => {
    expect(resolveCommissionRate(rates, 'ae-999', 2027, 1, 'new_business')).toBe(0.08);
  });

  it('returns 0 when no rates match', () => {
    expect(resolveCommissionRate([], 'ae-1', 2027, 1, null)).toBe(0);
  });

  it('returns AE + Quarter when deal type is null', () => {
    expect(resolveCommissionRate(rates, 'ae-1', 2027, 1, null)).toBe(0.12);
  });
});

describe('calculateUsageMultiplier', () => {
  it('returns 1.0 when no metrics provided', () => {
    expect(calculateUsageMultiplier([], {})).toBe(1.0);
  });

  it('calculates multiplier for single product', () => {
    const metrics = [{ product_type: 'Navigator', interaction_count: 500 }];
    const targets = { Navigator: 1000 };
    expect(calculateUsageMultiplier(metrics, targets)).toBe(0.5);
  });

  it('caps multiplier at configured cap', () => {
    const metrics = [{ product_type: 'Navigator', interaction_count: 2000 }];
    const targets = { Navigator: 1000 };
    expect(calculateUsageMultiplier(metrics, targets, 1.0)).toBe(1.0);
  });

  it('allows multiplier above 1.0 with higher cap', () => {
    const metrics = [{ product_type: 'Navigator', interaction_count: 1500 }];
    const targets = { Navigator: 1000 };
    expect(calculateUsageMultiplier(metrics, targets, 2.0)).toBe(1.5);
  });

  it('returns default 1.0 when total weight is zero (zero interactions)', () => {
    // When all interactions are 0, totalWeight is 0, so default 1.0 is returned
    // This matches the spec: "If no Looker data exists: usage_multiplier defaults to 1.0"
    const metrics = [{ product_type: 'Navigator', interaction_count: 0 }];
    const targets = { Navigator: 1000 };
    expect(calculateUsageMultiplier(metrics, targets)).toBe(1.0);
  });

  it('calculates weighted average for multiple products', () => {
    const metrics = [
      { product_type: 'Navigator', interaction_count: 1000 }, // 1000/1000 = 1.0
      { product_type: 'Autopilot', interaction_count: 500 },  // 500/1000 = 0.5
    ];
    const targets = { Navigator: 1000, Autopilot: 1000 };
    // Weighted: (1.0 * 1000 + 0.5 * 500) / (1000 + 500) = 1250/1500 = 0.833...
    const result = calculateUsageMultiplier(metrics, targets);
    expect(result).toBeCloseTo(0.8333, 3);
  });

  it('uses default target of 1000 when not specified', () => {
    const metrics = [{ product_type: 'Unknown', interaction_count: 500 }];
    expect(calculateUsageMultiplier(metrics, {})).toBe(0.5);
  });
});

describe('calculateCommission', () => {
  it('calculates basic commission', () => {
    const result = calculateCommission(100000, 0.08, 1.0);
    expect(result.commission_amount).toBe(8000);
    expect(result.base_amount).toBe(100000);
    expect(result.commission_rate).toBe(0.08);
    expect(result.usage_multiplier).toBe(1.0);
  });

  it('applies usage multiplier', () => {
    const result = calculateCommission(100000, 0.10, 0.5);
    expect(result.commission_amount).toBe(5000);
  });

  it('returns 0 for zero ACV', () => {
    const result = calculateCommission(0, 0.10, 1.0);
    expect(result.commission_amount).toBe(0);
  });

  it('returns 0 for zero rate', () => {
    const result = calculateCommission(100000, 0, 1.0);
    expect(result.commission_amount).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    const result = calculateCommission(33333, 0.08, 0.75);
    // 33333 * 0.08 * 0.75 = 1999.98
    expect(result.commission_amount).toBe(1999.98);
  });
});
