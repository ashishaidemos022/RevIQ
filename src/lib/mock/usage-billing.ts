import { UsageBillingSummary } from '@/types/database';

// ---------------------------------------------------------------------------
// Usage billing summaries — Orbis AI product lines:
//   • Workflow AI  (automation & routing product)
//   • CX Intelligence  (analytics & insights product)
// One record per account per product per month — Feb 2024 to Feb 2026 (25 months)
// Total billing grows from ~$300K/mo to ~$2.5M/mo with overage accelerating
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  { sfId: 'sf-acc-001', name: 'Acme Manufacturing Co',     ownerSfId: 'sf-usr-008', ownerName: 'Ashley Park' },
  { sfId: 'sf-acc-002', name: 'Vertex Healthcare Systems', ownerSfId: 'sf-usr-011', ownerName: 'Marcus Johnson' },
  { sfId: 'sf-acc-003', name: 'NovaTech Solutions',        ownerSfId: 'sf-usr-009', ownerName: 'Ryan Patel' },
  { sfId: 'sf-acc-004', name: 'Quantum Dynamics Inc',      ownerSfId: 'sf-usr-013', ownerName: 'Anna Schmidt' },
  { sfId: 'sf-acc-005', name: 'Aurora Retail Group',       ownerSfId: 'sf-usr-008', ownerName: 'Ashley Park' },
  { sfId: 'sf-acc-006', name: 'Pacific Shield Insurance',  ownerSfId: 'sf-usr-010', ownerName: 'Jennifer Liu' },
  { sfId: 'sf-acc-008', name: 'Redwood Financial Group',   ownerSfId: 'sf-usr-009', ownerName: 'Ryan Patel' },
  { sfId: 'sf-acc-009', name: 'Cascade Logistics Corp',    ownerSfId: 'sf-usr-012', ownerName: 'Kelly Chen' },
  { sfId: 'sf-acc-010', name: 'Zenith Telecommunications', ownerSfId: 'sf-usr-011', ownerName: 'Marcus Johnson' },
  { sfId: 'sf-acc-011', name: 'Alpine Medical Devices',    ownerSfId: 'sf-usr-013', ownerName: 'Anna Schmidt' },
];

const PRODUCTS = [
  { name: 'Workflow AI',      wallet: 'Workflow AI',      baseConsumption: 12000,  baseCharge: 1800 },
  { name: 'CX Intelligence',  wallet: 'CX Intelligence',  baseConsumption: 18000,  baseCharge: 2700 },
];

// 25 months: Feb 2024 to Feb 2026
const PERIODS: string[] = [];
for (let y = 2024, m = 2; PERIODS.length < 25; m++) {
  if (m > 12) { m = 1; y++; }
  PERIODS.push(`${y}-${String(m).padStart(2, '0')}`);
}

function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

let seq = 0;

// ─── Growth model ─────────────────────────────────────────────────────────
// The chart shows exponential-ish growth:
//   Feb '24: ~$300K total → Feb '26: ~$2.5M total
// That's roughly 8x over 24 months.
// Consumption grows steadily. Overage starts near zero and accelerates to ~50%.
//
// Per-account monthly targets (all accounts combined, both products):
//   Month 0 (Feb '24):  consumption ~$280K, overage ~$20K   = $300K
//   Month 12 (Feb '25): consumption ~$500K, overage ~$200K  = $700K
//   Month 24 (Feb '26): consumption ~$1.2M, overage ~$1.3M  = $2.5M
//
// Each account contributes roughly 1/10 of the total.

export const MOCK_USAGE_BILLING: UsageBillingSummary[] = ACCOUNTS.flatMap((account, ai) =>
  PRODUCTS.flatMap((product, pi) =>
    PERIODS.map((period, ti) => {
      seq++;
      const seed = ai * 1000 + pi * 100 + ti;
      const noise = 0.85 + seededRand(seed) * 0.30; // ±15% variation

      // Consumption grows ~5x over 25 months (exponential)
      // compound rate: (5.0)^(1/24) ≈ 1.069 per month
      const consumptionGrowth = Math.pow(1.075, ti);
      const consumption = Math.round(product.baseConsumption * consumptionGrowth * noise);

      // Overage: starts near 0%, grows to 50-60% of consumption by month 24
      // Uses a quadratic curve so it accelerates in the back half
      const overageFraction = ti / 24; // 0.0 to ~1.0
      const baseOverageRate = overageFraction * overageFraction * 0.70; // 0% → 70%
      // Per-account variation: some accounts run hot, some stay lean
      const accountHeat = [1.3, 0.9, 0.7, 1.4, 1.0, 0.6, 1.2, 0.8, 1.1, 0.75][ai];
      const overageNoise = 0.7 + seededRand(seed + 1) * 0.6;
      const overageRate = baseOverageRate * accountHeat * overageNoise;
      const overage = Math.round(consumption * overageRate);

      // Charged amount tracks consumption (contracted price)
      const chargeGrowth = Math.pow(1.075, ti);
      const charge = Math.round(product.baseCharge * chargeGrowth * noise);

      return {
        id: `demo-usg-${String(seq).padStart(4, '0')}`,
        period_name: period,
        sf_account_owner_id: account.ownerSfId,
        sf_account_owner: account.ownerName,
        sf_account_id: account.sfId,
        sf_account_name: account.name,
        td_billing_account_id: `orbis-billing-${account.sfId}`,
        td_billing_account_name: account.name,
        taxonomy_name: product.name,
        macro_sku_name_old: product.name,
        macro_sku_name_new: product.name,
        wallet_name: product.wallet,
        usage_type: 'interactions',
        currency: 'USD',
        contract_exchange_rate: 1.0,
        ns_exchange_rate: 1.0,
        total_consumption_amount_cur: consumption,
        total_overage_amount_cur: overage,
        total_charged_amount_cur: charge,
        total_consumption_amount_usd: consumption,
        total_overage_amount_usd: overage,
        total_charged_amount_ns_usd: charge,
        total_charged_amount_sf_usd: charge,
        synced_at: '2026-03-28T08:00:00Z',
      };
    })
  )
);
