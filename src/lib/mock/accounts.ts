import { Account } from '@/types/database';

// ---------------------------------------------------------------------------
// 15 fictional enterprise accounts for the Orbis AI demo
// ---------------------------------------------------------------------------

function acc(
  n: number,
  sfId: string,
  name: string,
  industry: string,
  region: string,
  ownerUserId: string,
  arr: number,
  status: string,
  segment: string,
): Account {
  const id = `demo-acc-${String(n).padStart(3, '0')}`;
  return {
    id,
    salesforce_account_id: sfId,
    name,
    industry,
    region,
    owner_user_id: ownerUserId,
    sales_region: region,
    account_arr: arr,
    customer_status: status,
    sales_segment: segment,
    segment_industry: industry,
    td_industry: industry,
    td_subindustry: null,
    customer_success_manager_sf_id: null,
    sdr_sf_id: null,
    exec_sponsor_sf_id: null,
    parent_account_sf_id: null,
    vmo_support_sf_id: null,
    rv_account_sf_id: null,
    last_synced_at: '2026-03-27T06:00:00Z',
    created_at: '2024-06-01T00:00:00Z',
  };
}

export const MOCK_ACCOUNTS: Account[] = [
  acc(1,  'sf-acc-001', 'Acme Manufacturing Co',      'Manufacturing',       'AMER', 'demo-usr-008', 420000, 'Customer',  'Enterprise'),
  acc(2,  'sf-acc-002', 'Vertex Healthcare Systems',  'Healthcare',          'AMER', 'demo-usr-011', 380000, 'Customer',  'Enterprise'),
  acc(3,  'sf-acc-003', 'NovaTech Solutions',         'Technology',          'AMER', 'demo-usr-009', 610000, 'Customer',  'Enterprise'),
  acc(4,  'sf-acc-004', 'Quantum Dynamics Inc',       'Financial Services',  'EMEA', 'demo-usr-013', 890000, 'Customer',  'Enterprise'),
  acc(5,  'sf-acc-005', 'Aurora Retail Group',        'Retail',              'AMER', 'demo-usr-008', 295000, 'Customer',  'Commercial'),
  acc(6,  'sf-acc-006', 'Pacific Shield Insurance',   'Insurance',           'AMER', 'demo-usr-010', 180000, 'Customer',  'Commercial'),
  acc(7,  'sf-acc-007', 'Summit Energy Partners',     'Energy',              'EMEA', 'demo-usr-014', 540000, 'Prospect',  'Enterprise'),
  acc(8,  'sf-acc-008', 'Redwood Financial Group',    'Financial Services',  'AMER', 'demo-usr-009', 720000, 'Customer',  'Enterprise'),
  acc(9,  'sf-acc-009', 'Cascade Logistics Corp',     'Logistics',           'AMER', 'demo-usr-012', 265000, 'Customer',  'Commercial'),
  acc(10, 'sf-acc-010', 'Zenith Telecommunications',  'Telecom',             'AMER', 'demo-usr-011', 480000, 'Customer',  'Enterprise'),
  acc(11, 'sf-acc-011', 'Alpine Medical Devices',     'Healthcare',          'EMEA', 'demo-usr-013', 310000, 'Customer',  'Commercial'),
  acc(12, 'sf-acc-012', 'Coastal Bank & Trust',       'Financial Services',  'AMER', 'demo-usr-012', 595000, 'Prospect',  'Enterprise'),
  acc(13, 'sf-acc-013', 'Ironbridge Manufacturing',   'Manufacturing',       'APAC',  'demo-usr-015', 220000, 'Customer',  'Commercial'),
  acc(14, 'sf-acc-014', 'DataStream Analytics',       'Technology',          'APAC',  'demo-usr-016', 175000, 'Prospect',  'Commercial'),
  acc(15, 'sf-acc-015', 'OceanView Hospitality',      'Hospitality',         'AMER', 'demo-usr-010', 145000, 'Prospect',  'Commercial'),
];
