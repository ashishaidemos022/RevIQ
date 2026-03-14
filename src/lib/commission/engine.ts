import { getSupabaseClient } from '@/lib/supabase/client';

interface CommissionRateRecord {
  user_id: string | null;
  fiscal_year: number;
  fiscal_quarter: number | null;
  deal_type: string | null;
  rate: number;
}

interface OpportunityForCommission {
  id: string;
  owner_user_id: string;
  acv: number;
  type: string | null;
  account_id: string | null;
}

interface UsageMetricInput {
  product_type: string;
  interaction_count: number;
}

/**
 * Resolve the commission rate for a specific AE, quarter, and deal type.
 * Precedence (most specific wins):
 *   1. AE + Quarter + Deal Type
 *   2. AE + Quarter
 *   3. AE + Year
 *   4. Global default (user_id IS NULL)
 */
export function resolveCommissionRate(
  rates: CommissionRateRecord[],
  userId: string,
  fiscalYear: number,
  fiscalQuarter: number,
  dealType: string | null
): number {
  // Sort by specificity: most specific first
  const candidates = rates.filter(
    (r) => r.fiscal_year === fiscalYear
  );

  // 1. AE + Quarter + Deal Type
  const exact = candidates.find(
    (r) =>
      r.user_id === userId &&
      r.fiscal_quarter === fiscalQuarter &&
      r.deal_type === dealType
  );
  if (exact) return exact.rate;

  // 2. AE + Quarter (any deal type)
  const aeQuarter = candidates.find(
    (r) =>
      r.user_id === userId &&
      r.fiscal_quarter === fiscalQuarter &&
      r.deal_type === null
  );
  if (aeQuarter) return aeQuarter.rate;

  // 3. AE + Year (any quarter, any deal type)
  const aeYear = candidates.find(
    (r) =>
      r.user_id === userId &&
      r.fiscal_quarter === null &&
      r.deal_type === null
  );
  if (aeYear) return aeYear.rate;

  // 4. Global default
  const global = candidates.find(
    (r) =>
      r.user_id === null &&
      r.fiscal_quarter === null &&
      r.deal_type === null
  );
  if (global) return global.rate;

  // Fallback: 0
  return 0;
}

/**
 * Calculate the usage multiplier for an account's products.
 *
 * multiplier = actual_interactions / target_interactions per product type
 * Weighted average across product types.
 * Floor: 0.0, Cap: configurable (default 1.0)
 */
export function calculateUsageMultiplier(
  metrics: UsageMetricInput[],
  targetThresholds: Record<string, number>, // product_type -> target count
  multiplierCap: number = 1.0
): number {
  if (metrics.length === 0) return 1.0; // default if no usage data

  let totalWeight = 0;
  let weightedMultiplier = 0;

  metrics.forEach((m) => {
    const target = targetThresholds[m.product_type] || 1000;
    const rawMultiplier = m.interaction_count / target;
    const capped = Math.min(Math.max(rawMultiplier, 0), multiplierCap);
    // Weight by interaction count (higher usage products have more weight)
    const weight = m.interaction_count;
    weightedMultiplier += capped * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 1.0;
  return weightedMultiplier / totalWeight;
}

/**
 * Calculate commission for a single opportunity.
 *
 * commission_amount = acv × commission_rate × usage_multiplier
 */
export function calculateCommission(
  acv: number,
  commissionRate: number,
  usageMultiplier: number
): {
  base_amount: number;
  commission_rate: number;
  usage_multiplier: number;
  commission_amount: number;
} {
  const commissionAmount = acv * commissionRate * usageMultiplier;
  return {
    base_amount: acv,
    commission_rate: commissionRate,
    usage_multiplier: usageMultiplier,
    commission_amount: Math.round(commissionAmount * 100) / 100,
  };
}

/**
 * Recalculate commissions for all non-finalized opportunities in a given period.
 */
export async function recalculateCommissions(
  fiscalYear: number,
  fiscalQuarter: number,
  userId?: string
): Promise<{ updated: number; errors: string[] }> {
  const db = getSupabaseClient();
  const errors: string[] = [];
  let updated = 0;

  // Get all commission rates for the fiscal year
  const { data: rates } = await db
    .from('commission_rates')
    .select('*')
    .eq('fiscal_year', fiscalYear);

  if (!rates) {
    return { updated: 0, errors: ['Failed to fetch commission rates'] };
  }

  // Get non-finalized commissions
  let commQuery = db
    .from('commissions')
    .select('*, opportunities(id, acv, type, account_id, owner_user_id)')
    .eq('fiscal_year', fiscalYear)
    .eq('fiscal_quarter', fiscalQuarter)
    .eq('is_finalized', false);

  if (userId) {
    commQuery = commQuery.eq('user_id', userId);
  }

  const { data: commissions } = await commQuery;

  if (!commissions || commissions.length === 0) {
    return { updated: 0, errors: [] };
  }

  for (const comm of commissions) {
    try {
      const opp = comm.opportunities as unknown as OpportunityForCommission | null;
      if (!opp) continue;

      const rate = resolveCommissionRate(
        rates as CommissionRateRecord[],
        comm.user_id,
        fiscalYear,
        fiscalQuarter,
        opp.type
      );

      // Get usage metrics for the opportunity's account
      let usageMultiplier = 1.0;
      if (opp.account_id) {
        const { data: metrics } = await db
          .from('usage_metrics')
          .select('product_type, interaction_count')
          .eq('account_id', opp.account_id)
          .order('metric_date', { ascending: false })
          .limit(10);

        if (metrics && metrics.length > 0) {
          // Deduplicate: take latest per product type
          const latest: Record<string, UsageMetricInput> = {};
          metrics.forEach((m: { product_type: string; interaction_count: number }) => {
            if (!latest[m.product_type]) latest[m.product_type] = m;
          });
          usageMultiplier = calculateUsageMultiplier(
            Object.values(latest),
            {} // Default thresholds — configurable in settings
          );
        }
      }

      const result = calculateCommission(opp.acv || 0, rate, usageMultiplier);

      const { error: updateError } = await db
        .from('commissions')
        .update({
          base_amount: result.base_amount,
          commission_rate: result.commission_rate,
          usage_multiplier: result.usage_multiplier,
          commission_amount: result.commission_amount,
          calculation_date: new Date().toISOString(),
        })
        .eq('id', comm.id);

      if (updateError) {
        errors.push(`Failed to update commission ${comm.id}: ${updateError.message}`);
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`Error processing commission ${comm.id}: ${String(err)}`);
    }
  }

  return { updated, errors };
}
