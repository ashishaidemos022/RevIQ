import { Commission, CommissionRate } from '@/types/database';
import { MOCK_OPPORTUNITIES } from './opportunities';

// ---------------------------------------------------------------------------
// Commission rates — default 7%, override for top performers
// ---------------------------------------------------------------------------

const ADMIN_ID = 'demo-usr-003';

export const MOCK_COMMISSION_RATES: CommissionRate[] = [
  // Global default rate — 7%
  {
    id: 'demo-crt-001',
    user_id: null,
    fiscal_year: 2027,
    fiscal_quarter: null,
    deal_type: null,
    rate: 0.07,
    entered_by: ADMIN_ID,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
  },
  // Ryan Patel — 8% for new business (top performer bonus)
  {
    id: 'demo-crt-002',
    user_id: 'demo-usr-009',
    fiscal_year: 2027,
    fiscal_quarter: null,
    deal_type: 'new_business',
    rate: 0.08,
    entered_by: ADMIN_ID,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
  },
  // Anna Schmidt — 8% for new business (EMEA new logo push)
  {
    id: 'demo-crt-003',
    user_id: 'demo-usr-013',
    fiscal_year: 2027,
    fiscal_quarter: null,
    deal_type: 'new_business',
    rate: 0.08,
    entered_by: ADMIN_ID,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Commissions for closed-won opportunities (finalized for Q4/Q3, draft for Q1)
// ---------------------------------------------------------------------------

function commissionRate(userId: string, dealType: string | null): number {
  // Check specific rates first
  if (userId === 'demo-usr-009' && dealType === 'new_business') return 0.08;
  if (userId === 'demo-usr-013' && dealType === 'new_business') return 0.08;
  return 0.07; // global default
}

let seq = 0;
const closedWonOpps = MOCK_OPPORTUNITIES.filter(o => o.is_closed_won);

export const MOCK_COMMISSIONS: Commission[] = closedWonOpps.map(opp => {
  seq++;
  const acv = opp.acv ?? 0;
  const rate = commissionRate(opp.owner_user_id ?? '', opp.type);
  const usageMultiplier = 1.0; // simplified for demo
  const commissionAmount = Math.round(acv * rate * usageMultiplier);

  // Q1 FY2027 = Feb–Apr 2026. Mark Q3/Q4 prior-year as finalized
  const closeDate = opp.close_date ?? '';
  const isQ1FY2027 = closeDate >= '2026-02-01' && closeDate <= '2026-04-30';
  const isFinalized = !isQ1FY2027;

  // Determine fiscal year and quarter
  const date = new Date(closeDate);
  const month = date.getMonth() + 1; // 1-based
  const year = date.getFullYear();
  let fiscalYear: number;
  let fiscalQuarter: number;

  if (month === 1) {
    fiscalYear = year;
    fiscalQuarter = 4;
  } else if (month >= 2 && month <= 4) {
    fiscalYear = year + 1;
    fiscalQuarter = 1;
  } else if (month >= 5 && month <= 7) {
    fiscalYear = year + 1;
    fiscalQuarter = 2;
  } else if (month >= 8 && month <= 10) {
    fiscalYear = year + 1;
    fiscalQuarter = 3;
  } else {
    fiscalYear = year + 1;
    fiscalQuarter = 4;
  }

  return {
    id: `demo-com-${String(seq).padStart(3, '0')}`,
    user_id: opp.owner_user_id ?? '',
    opportunity_id: opp.id,
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    base_amount: acv,
    usage_multiplier: usageMultiplier,
    commission_rate: rate,
    commission_amount: commissionAmount,
    calculation_date: '2026-03-27T06:00:00Z',
    is_finalized: isFinalized,
    notes: null,
    created_at: '2026-03-27T06:00:00Z',
  };
});
