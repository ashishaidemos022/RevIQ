import { Quota } from '@/types/database';

// ---------------------------------------------------------------------------
// FY2027 quotas (annual + Q1) for all AEs and leaders
// FY2027 = Feb 1, 2026 – Jan 31, 2027
// ---------------------------------------------------------------------------

const ADMIN_ID = 'demo-usr-003'; // James Rivera (RevOps) entered all quotas

let seq = 0;
function q(
  userId: string,
  fiscalYear: number,
  fiscalQuarter: number | null,
  amount: number,
  type: 'revenue' | 'pilots' | 'pipeline' | 'activities',
): Quota {
  seq++;
  return {
    id: `demo-qta-${String(seq).padStart(3, '0')}`,
    user_id: userId,
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    quota_amount: amount,
    quota_type: type,
    entered_by: ADMIN_ID,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
    quota_scope_type: null,
    quota_scope_id: null,
  };
}

// Annual revenue quotas (FY2027)
// CRO and leaders carry the rollup of their org tree
const ANNUAL_QUOTAS: [string, number][] = [
  ['demo-usr-001', 11_100_000], // Sara Chen (CRO) — sum of all AE quotas
  ['demo-usr-004',  4_200_000], // Mike Torres (West leader) — Ashley + Ryan + Jennifer
  ['demo-usr-005',  2_450_000], // Sophie Okonkwo (East leader) — Marcus + Kelly
  ['demo-usr-006',  2_600_000], // David Kim (EMEA leader) — Anna + Carlos
  ['demo-usr-007',  1_850_000], // Priya Nair (APAC leader) — Tom + Lisa
  ['demo-usr-008',  1_800_000], // Ashley Park
  ['demo-usr-009',  1_500_000], // Ryan Patel
  ['demo-usr-010',    900_000], // Jennifer Liu
  ['demo-usr-011',  1_600_000], // Marcus Johnson
  ['demo-usr-012',    850_000], // Kelly Chen
  ['demo-usr-013',  1_400_000], // Anna Schmidt
  ['demo-usr-014',  1_200_000], // Carlos Mendez
  ['demo-usr-015',  1_100_000], // Tom Nguyen
  ['demo-usr-016',    750_000], // Lisa Wang
];

// Q1 FY2027 quarterly quotas (roughly 25% of annual)
const Q1_QUOTAS: [string, number][] = [
  ['demo-usr-001', 2_775_000], // Sara Chen (CRO)
  ['demo-usr-004', 1_050_000], // Mike Torres (West)
  ['demo-usr-005',   612_500], // Sophie Okonkwo (East)
  ['demo-usr-006',   650_000], // David Kim (EMEA)
  ['demo-usr-007',   462_500], // Priya Nair (APAC)
  ['demo-usr-008',   450_000],
  ['demo-usr-009',   375_000],
  ['demo-usr-010',   225_000],
  ['demo-usr-011',   400_000],
  ['demo-usr-012',   212_500],
  ['demo-usr-013',   350_000],
  ['demo-usr-014',   300_000],
  ['demo-usr-015',   275_000],
  ['demo-usr-016',   187_500],
];

// Q2 FY2027 quarterly quotas
const Q2_QUOTAS: [string, number][] = [
  ['demo-usr-001', 2_775_000],
  ['demo-usr-004', 1_050_000],
  ['demo-usr-005',   612_500],
  ['demo-usr-006',   650_000],
  ['demo-usr-007',   462_500],
  ['demo-usr-008',   450_000],
  ['demo-usr-009',   375_000],
  ['demo-usr-010',   225_000],
  ['demo-usr-011',   400_000],
  ['demo-usr-012',   212_500],
  ['demo-usr-013',   350_000],
  ['demo-usr-014',   300_000],
  ['demo-usr-015',   275_000],
  ['demo-usr-016',   187_500],
];

// Pilot quotas (count of paid pilots, annual)
const PILOT_QUOTAS: [string, number][] = [
  ['demo-usr-008', 6],
  ['demo-usr-009', 5],
  ['demo-usr-010', 3],
  ['demo-usr-011', 5],
  ['demo-usr-012', 3],
  ['demo-usr-013', 5],
  ['demo-usr-014', 4],
  ['demo-usr-015', 4],
  ['demo-usr-016', 3],
];

export const MOCK_QUOTAS: Quota[] = [
  ...ANNUAL_QUOTAS.map(([uid, amt]) => q(uid, 2027, null,  amt, 'revenue')),
  ...Q1_QUOTAS.map(([uid, amt])     => q(uid, 2027, 1,     amt, 'revenue')),
  ...Q2_QUOTAS.map(([uid, amt])     => q(uid, 2027, 2,     amt, 'revenue')),
  ...PILOT_QUOTAS.map(([uid, cnt])  => q(uid, 2027, null,  cnt, 'pilots')),
];
