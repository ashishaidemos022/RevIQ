import { Opportunity, OpportunitySplit } from '@/types/database';
import { MOCK_ACCOUNTS } from './accounts';
import { MOCK_USERS } from './users';

// ---------------------------------------------------------------------------
// 35 opportunities spread across AEs — FY2027 (starts Feb 1, 2026)
// Today: March 28, 2026 — Q1 FY2027 in progress
// ---------------------------------------------------------------------------

function opp(
  n: number,
  sfId: string,
  accountId: string,
  ownerUserId: string,
  name: string,
  stage: string,
  acv: number,
  closeDate: string,
  type: 'new_business' | 'renewal' | 'expansion',
  subType: string,
  isClosedWon: boolean,
  isClosedLost: boolean,
  isPaidPilot: boolean,
  opts: Partial<Opportunity> = {},
): Opportunity {
  const id = `demo-opp-${String(n).padStart(3, '0')}`;
  return {
    id,
    salesforce_opportunity_id: sfId,
    account_id: accountId,
    owner_user_id: ownerUserId,
    name,
    stage,
    amount: acv,
    acv,
    ai_acv: isPaidPilot ? Math.round(acv * 0.4) : null,
    close_date: closeDate,
    is_closed_won: isClosedWon,
    is_closed_lost: isClosedLost,
    is_paid_pilot: isPaidPilot,
    pilot_type: isPaidPilot ? 'Paid Pilot' : null,
    paid_pilot_start_date: null,
    paid_pilot_end_date: null,
    forecast_category: isClosedWon ? null : isClosedLost ? null : 'pipeline',
    probability: isClosedWon ? 100 : isClosedLost ? 0 : null,
    type,
    sub_type: subType,
    last_stage_changed_at: '2026-03-01T00:00:00Z',
    last_synced_at: '2026-03-27T06:00:00Z',
    created_at: '2025-09-01T00:00:00Z',
    updated_at: '2026-03-27T06:00:00Z',
    reporting_acv: acv,
    pilot_status: null,
    parent_pilot_opportunity_sf_id: null,
    account_temperature: null,
    tcv: acv * 3,
    csm_sf_id: null,
    record_type_name: 'New Business',
    primary_quote_status: isClosedWon ? 'Accepted' : 'Draft',
    opportunity_source: 'Direct',
    created_by_sf_id: null,
    estimated_monthly_paygo: null,
    estimated_acv_paygo: null,
    cxa_committed_arr: null,
    sales_led_renewal: type === 'renewal' ? true : null,
    ae_forecast_category: isClosedWon ? 'Closed Won' : 'Commit',
    mgmt_forecast_category: isClosedWon ? 'Closed Won' : 'Commit',
    next_steps: null,
    manager_notes: null,
    rv_account_sf_id: null,
    rv_account_type: null,
    channel_owner_sf_id: null,
    days_in_current_stage: Math.floor(Math.random() * 45) + 5,
    pilot_implementation_stage: null,
    sf_created_date: '2025-10-01T00:00:00Z',
    ...opts,
  };
}

// ── Closed Won — Q1 FY2027 (Feb–Mar 2026) ────────────────────────────────

const CW_Q1: Opportunity[] = [
  // Existing deals — now with partner attribution (rv_account_sf_id = partner name, rv_account_type = sourced/influenced/fulfillment)
  opp(1,  'sf-opp-001', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — Enterprise Platform',    'Stage 7-Closed Won', 180000, '2026-02-15', 'new_business', 'New Logo',                 true,  false, false, { channel_owner_sf_id: 'sf-usr-017', rv_account_sf_id: 'Pinnacle Digital Partners', rv_account_type: 'Sourced' }),
  opp(2,  'sf-opp-002', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — CX Suite Renewal',        'Stage 7-Closed Won', 95000,  '2026-02-20', 'renewal',      'Renewal with expansion',   true,  false, false, { rv_account_sf_id: 'CloudBridge Consulting', rv_account_type: 'Influenced' }),
  opp(3,  'sf-opp-003', 'demo-acc-003', 'demo-usr-009', 'NovaTech Solutions — AI Accelerator',         'Stage 7-Closed Won', 220000, '2026-03-05', 'new_business', 'New Logo',                 true,  false, false, { channel_owner_sf_id: 'sf-usr-018', rv_account_sf_id: 'Vanguard Tech Solutions', rv_account_type: 'Sourced' }),
  opp(4,  'sf-opp-004', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — Data Intelligence Suite',  'Stage 7-Closed Won', 165000, '2026-03-12', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Nexus Partner Group', rv_account_type: 'Sourced' }),
  opp(5,  'sf-opp-005', 'demo-acc-006', 'demo-usr-010', 'Pacific Shield — Contact Center Pro',         'Stage 7-Closed Won', 78000,  '2026-03-18', 'renewal',      'Renewal only',             true,  false, false, { rv_account_sf_id: 'Meridian Systems Group', rv_account_type: 'Fulfillment' }),
  opp(6,  'sf-opp-006', 'demo-acc-009', 'demo-usr-012', 'Cascade Logistics — Operations Hub',          'Stage 7-Closed Won', 112000, '2026-03-20', 'expansion',    'Expansion',                true,  false, false, { channel_owner_sf_id: 'sf-usr-017', rv_account_sf_id: 'TechForward Alliance', rv_account_type: 'Influenced' }),
  opp(7,  'sf-opp-007', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — Enterprise License',      'Stage 7-Closed Won', 195000, '2026-03-25', 'new_business', 'Cross sell',               true,  false, false, { rv_account_sf_id: 'Apex Solutions LLC', rv_account_type: 'Sourced' }),
  opp(8,  'sf-opp-008', 'demo-acc-011', 'demo-usr-013', 'Alpine Medical — Compliance Suite',           'Stage 7-Closed Won', 88000,  '2026-03-27', 'new_business', 'New Logo',                 true,  false, false, { channel_owner_sf_id: 'sf-usr-018', rv_account_sf_id: 'Summit Channel Partners', rv_account_type: 'Fulfillment' }),
  // Additional partner-linked Q1 deals for broader partner coverage
  opp(58, 'sf-opp-058', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — Support Renewal',        'Stage 7-Closed Won', 62000,  '2026-02-25', 'renewal',      'Renewal only',             true,  false, false, { rv_account_sf_id: 'EuroTech Distributors', rv_account_type: 'Fulfillment' }),
  opp(59, 'sf-opp-059', 'demo-acc-003', 'demo-usr-009', 'NovaTech — Cloud Migration',                  'Stage 7-Closed Won', 135000, '2026-03-08', 'expansion',    'Expansion',                true,  false, false, { rv_account_sf_id: 'PacificWave IT', rv_account_type: 'Sourced' }),
  opp(60, 'sf-opp-060', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — Analytics Add-on',           'Stage 7-Closed Won', 48000,  '2026-03-15', 'expansion',    'Expansion',                true,  false, false, { rv_account_sf_id: 'Horizon Integrators', rv_account_type: 'Influenced' }),
  opp(61, 'sf-opp-061', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Loyalty Platform',            'Stage 7-Closed Won', 92000,  '2026-02-28', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'RedRock Services', rv_account_type: 'Fulfillment' }),
  opp(62, 'sf-opp-062', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — Security Module',          'Stage 7-Closed Won', 74000,  '2026-03-22', 'expansion',    'Expansion',                true,  false, false, { rv_account_sf_id: 'Nordic Solutions AB', rv_account_type: 'Influenced' }),
  opp(63, 'sf-opp-063', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — Digital Onboarding',           'Stage 7-Closed Won', 156000, '2026-03-10', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Atlas Consulting Group', rv_account_type: 'Sourced' }),
  opp(64, 'sf-opp-064', 'demo-acc-009', 'demo-usr-012', 'Cascade — Route Intelligence',               'Stage 7-Closed Won', 43000,  '2026-02-18', 'expansion',    'Expansion',                true,  false, false, { rv_account_sf_id: 'Catalyst Channel Inc', rv_account_type: 'Influenced' }),
  opp(65, 'sf-opp-065', 'demo-acc-013', 'demo-usr-015', 'Ironbridge — Predictive Quality',             'Stage 7-Closed Won', 118000, '2026-03-28', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'SilverLine Partners', rv_account_type: 'Sourced' }),
  opp(66, 'sf-opp-066', 'demo-acc-014', 'demo-usr-016', 'DataStream — Real-Time Dashboards',           'Stage 7-Closed Won', 67000,  '2026-03-20', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Orion Digital Services', rv_account_type: 'Fulfillment' }),
  opp(67, 'sf-opp-067', 'demo-acc-015', 'demo-usr-010', 'OceanView — Revenue Management',              'Stage 7-Closed Won', 85000,  '2026-03-25', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'CrestView Technology', rv_account_type: 'Sourced' }),
  opp(68, 'sf-opp-068', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Asset Tracking',              'Stage 7-Closed Won', 97000,  '2026-02-22', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'GlobalEdge Solutions', rv_account_type: 'Influenced' }),
  opp(69, 'sf-opp-069', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — Telehealth Expansion',    'Stage 7-Closed Won', 142000, '2026-03-30', 'expansion',    'Expansion',                true,  false, false, { rv_account_sf_id: 'BlueStar Technologies', rv_account_type: 'Sourced' }),
  // GSI-linked closed-won deals — Q1 FY2027
  opp(70, 'sf-opp-070', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — Global CX Transformation',  'Stage 7-Closed Won', 450000, '2026-02-20', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Accenture',  rv_account_type: 'Sourced' }),
  opp(71, 'sf-opp-071', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — Digital Patient Journey',    'Stage 7-Closed Won', 380000, '2026-03-05', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Deloitte',   rv_account_type: 'Sourced' }),
  opp(72, 'sf-opp-072', 'demo-acc-003', 'demo-usr-009', 'NovaTech — Enterprise Automation Suite',         'Stage 7-Closed Won', 290000, '2026-03-12', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Infosys',    rv_account_type: 'Influenced' }),
  opp(73, 'sf-opp-073', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — AI Ops Platform',             'Stage 7-Closed Won', 325000, '2026-03-18', 'expansion',    'Expansion',   true, false, false, { rv_account_sf_id: 'Cognizant',  rv_account_type: 'Sourced' }),
  opp(74, 'sf-opp-074', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Omnichannel Intelligence',       'Stage 7-Closed Won', 210000, '2026-02-28', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Wipro',      rv_account_type: 'Influenced' }),
  opp(75, 'sf-opp-075', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — Risk & Compliance Hub',      'Stage 7-Closed Won', 275000, '2026-03-22', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'TCS',        rv_account_type: 'Fulfillment' }),
  opp(76, 'sf-opp-076', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — Core Banking Modernization',      'Stage 7-Closed Won', 340000, '2026-03-28', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'HCL',        rv_account_type: 'Sourced' }),
  // Additional GSI deals for depth
  opp(77, 'sf-opp-077', 'demo-acc-009', 'demo-usr-012', 'Cascade Logistics — Supply Chain AI',            'Stage 7-Closed Won', 185000, '2026-03-15', 'expansion',    'Expansion',   true, false, false, { rv_account_sf_id: 'Accenture',  rv_account_type: 'Influenced' }),
  opp(78, 'sf-opp-078', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Grid Analytics',                 'Stage 7-Closed Won', 155000, '2026-03-10', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Deloitte',   rv_account_type: 'Fulfillment' }),
  opp(79, 'sf-opp-079', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — Network Optimization',          'Stage 7-Closed Won', 198000, '2026-02-25', 'expansion',    'Expansion',   true, false, false, { rv_account_sf_id: 'Cognizant',  rv_account_type: 'Influenced' }),
  opp(80, 'sf-opp-080', 'demo-acc-011', 'demo-usr-013', 'Alpine Medical — Clinical Workflow Platform',    'Stage 7-Closed Won', 265000, '2026-03-20', 'new_business', 'New Logo',    true, false, false, { rv_account_sf_id: 'Infosys',    rv_account_type: 'Sourced' }),
];

// ── Closed Won — Q4 FY2026 (Nov 2025 – Jan 2026) — for YTD ──────────────

const CW_Q4_PRIOR: Opportunity[] = [
  opp(9,  'sf-opp-009', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Platform License',            'Stage 7-Closed Won', 145000, '2025-11-15', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Pinnacle Digital Partners', rv_account_type: 'Sourced' }),
  opp(10, 'sf-opp-010', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — CX Cloud',                   'Stage 7-Closed Won', 98000,  '2025-12-08', 'renewal',      'Renewal with expansion',   true,  false, false, { rv_account_sf_id: 'Meridian Systems Group', rv_account_type: 'Influenced' }),
  opp(11, 'sf-opp-011', 'demo-acc-014', 'demo-usr-016', 'DataStream Analytics — AI Suite',             'Stage 7-Closed Won', 67000,  '2025-12-20', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'PacificWave IT', rv_account_type: 'Sourced' }),
  opp(12, 'sf-opp-012', 'demo-acc-015', 'demo-usr-010', 'OceanView Hospitality — Guest Experience Pro','Stage 7-Closed Won', 58000,  '2026-01-10', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Vanguard Tech Solutions', rv_account_type: 'Fulfillment' }),
];

// ── Closed Won — Q3 FY2026 (Aug–Oct 2025) — historical ───────────────────

const CW_Q3_PRIOR: Opportunity[] = [
  opp(13, 'sf-opp-013', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — Banking Intelligence Suite',   'Stage 7-Closed Won', 135000, '2025-09-15', 'renewal',      'Renewal with expansion',   true,  false, false, { rv_account_sf_id: 'CloudBridge Consulting', rv_account_type: 'Influenced' }),
  opp(14, 'sf-opp-014', 'demo-acc-013', 'demo-usr-015', 'Ironbridge Manufacturing — Smart Ops',        'Stage 7-Closed Won', 89000,  '2025-10-05', 'new_business', 'New Logo',                 true,  false, false, { rv_account_sf_id: 'Horizon Integrators', rv_account_type: 'Sourced' }),
];

// ── Closed Lost ───────────────────────────────────────────────────────────

const CLOSED_LOST: Opportunity[] = [
  opp(15, 'sf-opp-015', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Operations Platform',         'Closed Lost',        130000, '2025-10-30', 'new_business', 'New Logo',                 false, true,  false),
  opp(16, 'sf-opp-016', 'demo-acc-013', 'demo-usr-015', 'Ironbridge — CX Pro',                         'Closed Lost',        45000,  '2026-02-28', 'new_business', 'New Logo',                 false, true,  false),
];

// ── Open Pipeline ─────────────────────────────────────────────────────────

const OPEN_PIPELINE: Opportunity[] = [
  // ── Apr 2026 (Q1 FY2027) ───────────────────────────────────────────────
  opp(17, 'sf-opp-017', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — CX Pro Renewal',         'Stage 3-Evaluation',           92000,  '2026-04-30', 'renewal',      'Renewal only',          false, false, false, { forecast_category: 'pipeline', probability: 40, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-017' }),
  opp(18, 'sf-opp-018', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — AI Assistant',             'Stage 4-Shortlist',            185000, '2026-04-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'best_case', probability: 60, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Apex Solutions LLC' }),
  opp(19, 'sf-opp-019', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Platform Expansion',           'Stage 5-Vendor of Choice',     120000, '2026-04-25', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'commit',    probability: 80, mgmt_forecast_category: 'Forecast' }),
  opp(22, 'sf-opp-022', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — Seats Expansion',             'Stage 6-Commit',               88000,  '2026-04-10', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'commit',    probability: 90, mgmt_forecast_category: 'Forecast', channel_owner_sf_id: 'sf-usr-018' }),
  opp(29, 'sf-opp-029', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — Annual Renewal',           'Stage 5-Vendor of Choice',     185000, '2026-04-15', 'renewal',      'Renewal with expansion',false, false, false, { forecast_category: 'commit',    probability: 85, mgmt_forecast_category: 'Forecast' }),
  // ── May 2026 (Q2 FY2027) ──────────────────────────────────────────────
  opp(20, 'sf-opp-020', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — AI Accelerator Phase 2',   'Stage 4-Verbal',               240000, '2026-05-31', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'commit',    probability: 75, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Nexus Partner Group' }),
  opp(21, 'sf-opp-021', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Enterprise Hub',               'Stage 3-Evaluation',           175000, '2026-05-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 35, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-018' }),
  opp(26, 'sf-opp-026', 'demo-acc-014', 'demo-usr-016', 'DataStream Analytics — Enterprise',            'Stage 3-Evaluation',           88000,  '2026-05-20', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 40, mgmt_forecast_category: 'Upside' }),
  // ── Jun 2026 (Q2 FY2027) ──────────────────────────────────────────────
  opp(23, 'sf-opp-023', 'demo-acc-003', 'demo-usr-009', 'NovaTech Solutions — Workflow Upgrade',        'Stage 4-Shortlist',            155000, '2026-06-20', 'expansion',    'Cross sell',            false, false, false, { forecast_category: 'best_case', probability: 60, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'BlueStar Technologies' }),
  opp(25, 'sf-opp-025', 'demo-acc-013', 'demo-usr-015', 'Ironbridge — Intelligent Platform',            'Stage 2-Solution Discovery',   122000, '2026-06-30', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 20, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-017' }),
  // ── Jul 2026 (Q2 FY2027) ──────────────────────────────────────────────
  opp(24, 'sf-opp-024', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — AI Automation Suite',          'Stage 3-Proposal',             198000, '2026-07-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 45, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-017' }),
  opp(27, 'sf-opp-027', 'demo-acc-006', 'demo-usr-010', 'Pacific Shield — Coverage Expansion',          'Stage 4-Verbal',               65000,  '2026-07-28', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'commit',    probability: 75, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Apex Solutions LLC' }),
  // ── Aug 2026 (Q3 FY2027) ──────────────────────────────────────────────
  opp(28, 'sf-opp-028', 'demo-acc-015', 'demo-usr-010', 'OceanView — AI Revenue Platform',              'Stage 1-Business Discovery',   95000,  '2026-08-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 10, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-018' }),
  opp(45, 'sf-opp-045', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — Smart Factory Suite',     'Stage 3-Evaluation',           210000, '2026-08-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'best_case', probability: 50, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Nexus Partner Group' }),
  // ── Sep 2026 (Q3 FY2027) ──────────────────────────────────────────────
  opp(30, 'sf-opp-030', 'demo-acc-009', 'demo-usr-012', 'Cascade Logistics — Smart Routing Hub',        'Stage 3-Evaluation',           142000, '2026-09-15', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'pipeline', probability: 40, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-017' }),
  opp(46, 'sf-opp-046', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — Patient Analytics',        'Stage 3-Proposal',             165000, '2026-09-30', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'best_case', probability: 55, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Apex Solutions LLC' }),
  // ── Oct 2026 (Q3 FY2027) ──────────────────────────────────────────────
  opp(47, 'sf-opp-047', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — Compliance Cloud',          'Stage 2-Solution Discovery',   175000, '2026-10-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 30, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-018' }),
  opp(48, 'sf-opp-048', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — Risk Engine Pro',          'Stage 3-Evaluation',           130000, '2026-10-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 35, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'BlueStar Technologies' }),
  // ── Nov 2026 (Q4 FY2027) ──────────────────────────────────────────────
  opp(49, 'sf-opp-049', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Omnichannel AI',               'Stage 2-Solution Discovery',   225000, '2026-11-30', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 25, mgmt_forecast_category: 'Upside', rv_account_sf_id: 'Nexus Partner Group' }),
  opp(50, 'sf-opp-050', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — Network Intelligence',        'Stage 3-Proposal',             148000, '2026-11-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 40, mgmt_forecast_category: 'Forecast', channel_owner_sf_id: 'sf-usr-017' }),
  // ── Dec 2026 (Q4 FY2027) ──────────────────────────────────────────────
  opp(51, 'sf-opp-051', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — Fraud Detection Suite',         'Stage 2-Solution Discovery',   190000, '2026-12-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 20, mgmt_forecast_category: 'Upside', channel_owner_sf_id: 'sf-usr-018' }),
  opp(52, 'sf-opp-052', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Carbon Analytics',             'Stage 3-Evaluation',           115000, '2026-12-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 30, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Apex Solutions LLC' }),
  // ── Jan 2027 (Q4 FY2027) ──────────────────────────────────────────────
  opp(53, 'sf-opp-053', 'demo-acc-003', 'demo-usr-009', 'NovaTech Solutions — Predictive Maintenance',  'Stage 1-Business Discovery',   280000, '2027-01-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 15, mgmt_forecast_category: 'Upside', rv_account_sf_id: 'BlueStar Technologies' }),
  opp(54, 'sf-opp-054', 'demo-acc-011', 'demo-usr-013', 'Alpine Medical — AI Diagnostics Platform',     'Stage 2-Solution Discovery',   160000, '2027-01-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline', probability: 25, mgmt_forecast_category: 'Forecast', channel_owner_sf_id: 'sf-usr-018' }),
  // GSI-linked pipeline deals
  opp(81, 'sf-opp-081', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — Global Contact Center',    'Stage 4-Verbal',               520000, '2026-05-30', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'commit',    probability: 75, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Accenture' }),
  opp(82, 'sf-opp-082', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — Cloud Migration',            'Stage 3-Proposal',             380000, '2026-06-15', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'best_case', probability: 55, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'Deloitte' }),
  opp(83, 'sf-opp-083', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — Digital Lending Platform',   'Stage 3-Evaluation',           290000, '2026-07-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline',  probability: 40, mgmt_forecast_category: 'Upside',   rv_account_sf_id: 'TCS' }),
  opp(84, 'sf-opp-084', 'demo-acc-012', 'demo-usr-012', 'Coastal Bank — Wealth Management AI',            'Stage 4-Shortlist',            410000, '2026-06-30', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'commit',    probability: 70, mgmt_forecast_category: 'Forecast', rv_account_sf_id: 'HCL' }),
  opp(85, 'sf-opp-085', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Store Analytics Platform',       'Stage 3-Proposal',             245000, '2026-08-15', 'expansion',    'Expansion',             false, false, false, { forecast_category: 'pipeline',  probability: 35, mgmt_forecast_category: 'Upside',   rv_account_sf_id: 'Wipro' }),
  opp(86, 'sf-opp-086', 'demo-acc-003', 'demo-usr-009', 'NovaTech — Intelligent Automation',              'Stage 3-Evaluation',           335000, '2026-09-30', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline',  probability: 30, mgmt_forecast_category: 'Upside',   rv_account_sf_id: 'Infosys' }),
  opp(87, 'sf-opp-087', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — 5G Analytics Suite',            'Stage 2-Solution Discovery',   310000, '2026-10-31', 'new_business', 'New Logo',              false, false, false, { forecast_category: 'pipeline',  probability: 20, mgmt_forecast_category: 'Upside',   rv_account_sf_id: 'Cognizant' }),
];

// ── Paid Pilots ───────────────────────────────────────────────────────────

const PAID_PILOTS: Opportunity[] = [
  // ── Active pilots — spread across Feb, Mar, Apr (Q1) and Q2 ─────────────
  // sf_created_date spread from Apr'25 to Apr'26 for "Added to Pipeline" chart
  // Ashley Park (008) — AMER — close in Feb — UAT (nearly done, been running since Nov)
  opp(31, 'sf-opp-031', 'demo-acc-001', 'demo-usr-008', 'Acme Manufacturing — AI Workflow Pilot',       'Stage 4-Shortlist',    45000,  '2026-02-28', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2025-11-15', paid_pilot_end_date: '2026-02-28', forecast_category: 'pipeline', probability: 55, channel_owner_sf_id: 'sf-usr-017', sf_created_date: '2025-08-14T00:00:00Z', pilot_implementation_stage: 'uat' }),
  // Ryan Patel (009) — AMER — close in Mar — Configuration (started Dec, in config since Feb)
  opp(34, 'sf-opp-034', 'demo-acc-003', 'demo-usr-009', 'NovaTech Solutions — Intelligence Pilot',       'Stage 4-Verbal',      50000,  '2026-03-15', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2025-12-01', paid_pilot_end_date: '2026-03-31', forecast_category: 'best_case', probability: 65, rv_account_sf_id: 'BlueStar Technologies', sf_created_date: '2025-09-18T00:00:00Z', pilot_implementation_stage: 'configuration' }),
  // Jennifer Liu (010) — AMER — close in Mar — Discovery (started Jan, still in discovery)
  opp(36, 'sf-opp-036', 'demo-acc-006', 'demo-usr-010', 'Pacific Shield — Claims AI Pilot',              'Stage 3-Evaluation',  32000,  '2026-03-31', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-01-15', paid_pilot_end_date: '2026-04-15', forecast_category: 'pipeline', probability: 40, channel_owner_sf_id: 'sf-usr-017', sf_created_date: '2025-10-15T00:00:00Z', pilot_implementation_stage: 'discovery' }),
  // Marcus Johnson (011) — AMER — close in Apr — Discovery (started Jan, still early)
  opp(33, 'sf-opp-033', 'demo-acc-010', 'demo-usr-011', 'Zenith Telecom — CX AI Pilot',                  'Stage 3-Evaluation',  35000,  '2026-04-10', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-01-15', paid_pilot_end_date: '2026-04-15', forecast_category: 'pipeline', probability: 40, rv_account_sf_id: 'Nexus Partner Group', sf_created_date: '2025-11-20T00:00:00Z', pilot_implementation_stage: 'discovery' }),
  // Kelly Chen (012) — AMER — close in Feb — UAT (started Nov, nearly through)
  opp(37, 'sf-opp-037', 'demo-acc-009', 'demo-usr-012', 'Cascade Logistics — Route Optimization Pilot', 'Stage 4-Shortlist',    28000,  '2026-02-20', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2025-11-01', paid_pilot_end_date: '2026-02-28', forecast_category: 'pipeline', probability: 50, channel_owner_sf_id: 'sf-usr-017', sf_created_date: '2025-06-05T00:00:00Z', pilot_implementation_stage: 'uat' }),
  // Anna Schmidt (013) — EMEA — close in May — Configuration (started Feb, in config since Mar)
  opp(32, 'sf-opp-032', 'demo-acc-004', 'demo-usr-013', 'Quantum Dynamics — Analytics Intelligence Pilot','Stage 3-Proposal',  60000,  '2026-05-31', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-02-15', paid_pilot_end_date: '2026-05-31', forecast_category: 'pipeline', probability: 45, rv_account_sf_id: 'Apex Solutions LLC', sf_created_date: '2025-10-20T00:00:00Z', pilot_implementation_stage: 'configuration' }),
  // Carlos Mendez (014) — EMEA — close in Jun — Not Started (just kicked off Mar 1)
  opp(38, 'sf-opp-038', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Smart Grid Pilot',              'Stage 3-Evaluation',  55000,  '2026-06-30', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-03-01', paid_pilot_end_date: '2026-06-30', forecast_category: 'pipeline', probability: 35, channel_owner_sf_id: 'sf-usr-018', sf_created_date: '2026-01-15T00:00:00Z', pilot_implementation_stage: 'not_started' }),
  // Tom Nguyen (015) — APAC — close in Apr — UAT (started Feb, moving fast)
  opp(39, 'sf-opp-039', 'demo-acc-013', 'demo-usr-015', 'Ironbridge Manufacturing — Quality AI Pilot',   'Stage 4-Verbal',      42000,  '2026-04-20', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-02-01', paid_pilot_end_date: '2026-04-30', forecast_category: 'best_case', probability: 60, rv_account_sf_id: 'Nexus Partner Group', sf_created_date: '2026-04-02T00:00:00Z', pilot_implementation_stage: 'uat' }),
  // Lisa Wang (016) — APAC — close in May — Not Started (just started mid-Mar)
  opp(40, 'sf-opp-040', 'demo-acc-014', 'demo-usr-016', 'DataStream Analytics — Prediction Engine Pilot','Stage 3-Proposal',    38000,  '2026-05-30', 'new_business', 'New Logo', false, false, true,
    { paid_pilot_start_date: '2026-03-15', paid_pilot_end_date: '2026-06-15', forecast_category: 'pipeline', probability: 40, channel_owner_sf_id: 'sf-usr-018', sf_created_date: '2025-05-18T00:00:00Z', pilot_implementation_stage: 'not_started' }),

  // ── Converted (closed-won) pilots — for win rate and conversion KPIs ───
  // Ashley Park (008) — converted pilot in Q1 — reached production
  opp(41, 'sf-opp-041', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — Personalization Engine Pilot',  'Stage 7-Closed Won',  40000,  '2026-02-28', 'new_business', 'New Logo', true, false, true,
    { paid_pilot_start_date: '2025-11-01', paid_pilot_end_date: '2026-02-28', channel_owner_sf_id: 'sf-usr-017', sf_created_date: '2025-04-15T00:00:00Z', pilot_implementation_stage: 'production' }),
  // Marcus Johnson (011) — converted pilot in Q1 — reached production
  opp(42, 'sf-opp-042', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — Patient Flow Pilot',       'Stage 7-Closed Won',  48000,  '2026-03-10', 'new_business', 'New Logo', true, false, true,
    { paid_pilot_start_date: '2025-12-01', paid_pilot_end_date: '2026-03-10', rv_account_sf_id: 'Apex Solutions LLC', sf_created_date: '2025-12-08T00:00:00Z', pilot_implementation_stage: 'production' }),
  // Anna Schmidt (013) — converted pilot in Q1 — reached production
  opp(43, 'sf-opp-043', 'demo-acc-011', 'demo-usr-013', 'Alpine Medical — Compliance Automation Pilot',  'Stage 7-Closed Won',  52000,  '2026-03-15', 'new_business', 'New Logo', true, false, true,
    { paid_pilot_start_date: '2025-12-15', paid_pilot_end_date: '2026-03-15', channel_owner_sf_id: 'sf-usr-018', sf_created_date: '2026-02-12T00:00:00Z', pilot_implementation_stage: 'production' }),

  // ── Lost pilots — for win rate calculation ─────────────────────────────
  // Carlos Mendez (014) — lost pilot in Q1
  opp(44, 'sf-opp-044', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Demand Forecasting Pilot',     'Closed Lost',          35000,  '2026-02-15', 'new_business', 'New Logo', false, true, true,
    { paid_pilot_start_date: '2025-10-01', paid_pilot_end_date: '2026-02-15', sf_created_date: '2025-07-14T00:00:00Z' }),
  // Ryan Patel (009) — lost pilot in Q1
  opp(55, 'sf-opp-055', 'demo-acc-008', 'demo-usr-009', 'Redwood Financial — AI Lending Pilot',         'Closed Lost',          30000,  '2026-03-20', 'new_business', 'New Logo', false, true, true,
    { paid_pilot_start_date: '2025-11-15', paid_pilot_end_date: '2026-03-20', channel_owner_sf_id: 'sf-usr-017', sf_created_date: '2026-03-01T00:00:00Z' }),
];

// ── Pilot Conversion child opportunities ─────────────────────────────────
// These are won deals that reference a parent pilot, used for conversion rate calculation
const PILOT_CONVERSIONS: Opportunity[] = [
  // Child of Aurora Retail pilot (sf-opp-041) → converted to full deal
  opp(56, 'sf-opp-056', 'demo-acc-005', 'demo-usr-008', 'Aurora Retail — AI Personalization Platform',  'Stage 7-Closed Won',  180000, '2026-03-25', 'new_business', 'New Logo', true, false, false,
    { parent_pilot_opportunity_sf_id: 'sf-opp-041' }),
  // Child of Vertex Healthcare pilot (sf-opp-042) → converted to full deal
  opp(57, 'sf-opp-057', 'demo-acc-002', 'demo-usr-011', 'Vertex Healthcare — Patient Flow Enterprise',  'Stage 7-Closed Won',  220000, '2026-04-10', 'new_business', 'New Logo', true, false, false,
    { parent_pilot_opportunity_sf_id: 'sf-opp-042' }),
];

// ── Early Pipeline (SS0–SS2) ──────────────────────────────────────────────

const EARLY_PIPELINE: Opportunity[] = [
  opp(35, 'sf-opp-035', 'demo-acc-007', 'demo-usr-014', 'Summit Energy — Digital Transformation',       'Stage 1-Renewal Placeholder', 200000, '2026-09-30', 'new_business', 'New Logo', false, false, false,
    { forecast_category: 'omitted', probability: 5, mgmt_forecast_category: 'Upside' }),
];

export const MOCK_OPPORTUNITIES: Opportunity[] = [
  ...CW_Q1,
  ...CW_Q4_PRIOR,
  ...CW_Q3_PRIOR,
  ...CLOSED_LOST,
  ...OPEN_PIPELINE,
  ...PAID_PILOTS,
  ...PILOT_CONVERSIONS,
  ...EARLY_PIPELINE,
];

// ---------------------------------------------------------------------------
// Opportunity splits — every opp gets 100% to the AE owner
// The mock data includes a nested `opportunities` object for join queries
// ---------------------------------------------------------------------------

export interface MockSplitRow extends OpportunitySplit {
  /** Pre-joined opportunity data for queries using opportunities!inner(...) */
  opportunities: {
    acv: number | null;
    ai_acv: number | null;
    sub_type: string | null;
    is_closed_won: boolean;
    is_closed_lost: boolean;
    is_paid_pilot: boolean;
    close_date: string | null;
    stage: string;
    account_id: string | null;
    owner_user_id: string | null;
    name: string;
    forecast_category: string | null;
    mgmt_forecast_category: string | null;
    probability: number | null;
    type: string | null;
    paid_pilot_start_date: string | null;
    paid_pilot_end_date: string | null;
    amount: number | null;
    reporting_acv: number | null;
  };
}

// Lookup maps for embedding nested account/user data in splits
const _accMap = new Map(MOCK_ACCOUNTS.map(a => [a.id, a]));
const _usrMap = new Map(MOCK_USERS.map(u => [u.id, u]));

export const MOCK_OPPORTUNITY_SPLITS: MockSplitRow[] = MOCK_OPPORTUNITIES.map((o, i) => {
  const acc = o.account_id ? _accMap.get(o.account_id) : null;
  const usr = o.owner_user_id ? _usrMap.get(o.owner_user_id) : null;
  return {
    id: `demo-spl-${String(i + 1).padStart(3, '0')}`,
    salesforce_split_id: `sf-spl-${String(i + 1).padStart(3, '0')}`,
    opportunity_id: o.id,
    salesforce_opportunity_id: o.salesforce_opportunity_id,
    split_owner_user_id: o.owner_user_id,
    split_owner_sf_id: o.owner_user_id ? `sf-usr-${o.owner_user_id.slice(-3)}` : null,
    split_amount: o.acv,
    split_percentage: 100,
    split_type: 'Revenue (ACV)',
    sf_created_date: o.sf_created_date,
    last_synced_at: '2026-03-27T06:00:00Z',
    created_at: '2025-10-01T00:00:00Z',
    // Pre-joined opportunity fields for PostgREST-style join mocking
    opportunities: {
      id: o.id,
      acv: o.acv,
      ai_acv: o.ai_acv,
      sub_type: o.sub_type,
      is_closed_won: o.is_closed_won,
      is_closed_lost: o.is_closed_lost,
      is_paid_pilot: o.is_paid_pilot,
      close_date: o.close_date,
      stage: o.stage,
      account_id: o.account_id,
      owner_user_id: o.owner_user_id,
      name: o.name,
      salesforce_opportunity_id: o.salesforce_opportunity_id,
      forecast_category: o.forecast_category,
      mgmt_forecast_category: o.mgmt_forecast_category,
      probability: o.probability,
      type: o.type,
      paid_pilot_start_date: o.paid_pilot_start_date,
      paid_pilot_end_date: o.paid_pilot_end_date,
      amount: o.amount,
      reporting_acv: o.reporting_acv,
      last_stage_changed_at: o.last_stage_changed_at,
      cxa_committed_arr: o.cxa_committed_arr,
      days_in_current_stage: o.days_in_current_stage,
      sf_created_date: o.sf_created_date,
      // Nested joins for accounts(id, name) and users!fk(id, full_name, email)
      accounts: acc ? { id: acc.id, name: acc.name, industry: acc.industry, region: acc.region } : null,
      users: usr ? { id: usr.id, full_name: usr.full_name, email: usr.email } : null,
    },
  };
});
