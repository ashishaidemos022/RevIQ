-- TD RevenueIQ — Seed Data
-- Comprehensive seed for all dashboards, filters, leaderboards, and commission calculations.
-- Uses fixed UUIDs for referential integrity.
-- FY2027 = Feb 2026 – Jan 2027. Today is March 12, 2026 (Q1 FY2027).

-- ============================================================
-- Fiscal Config
-- ============================================================
INSERT INTO fiscal_config (id, fy_start_month, fy_start_day) VALUES
  ('00000000-0000-0000-0000-000000000001', 2, 1);

-- ============================================================
-- Users: 1 Dev Admin + 1 CRO + 2 VPs + 4 Managers + 12 AEs + 1 RevOps RO + 1 Enterprise RO
-- ============================================================
INSERT INTO users (id, okta_id, email, full_name, role, salesforce_user_id, region) VALUES
  -- Dev admin
  ('a0000000-0000-0000-0000-000000000001', 'dev-admin', 'admin@td.com', 'Dev Admin', 'revops_rw', NULL, NULL),
  -- CRO
  ('a0000000-0000-0000-0000-000000000010', 'okta-cro-001', 'sarah.chen@td.com', 'Sarah Chen', 'cro', 'SF-CRO-001', NULL),
  -- VP West
  ('a0000000-0000-0000-0000-000000000020', 'okta-vp-001', 'mike.johnson@td.com', 'Mike Johnson', 'vp', 'SF-VP-001', 'West'),
  -- VP East
  ('a0000000-0000-0000-0000-000000000021', 'okta-vp-002', 'lisa.wang@td.com', 'Lisa Wang', 'vp', 'SF-VP-002', 'East'),
  -- Manager West-1
  ('a0000000-0000-0000-0000-000000000030', 'okta-mgr-001', 'james.taylor@td.com', 'James Taylor', 'manager', 'SF-MGR-001', 'West'),
  -- Manager West-2
  ('a0000000-0000-0000-0000-000000000031', 'okta-mgr-002', 'emily.davis@td.com', 'Emily Davis', 'manager', 'SF-MGR-002', 'West'),
  -- Manager East-1
  ('a0000000-0000-0000-0000-000000000032', 'okta-mgr-003', 'robert.kim@td.com', 'Robert Kim', 'manager', 'SF-MGR-003', 'East'),
  -- Manager East-2
  ('a0000000-0000-0000-0000-000000000033', 'okta-mgr-004', 'amanda.garcia@td.com', 'Amanda Garcia', 'manager', 'SF-MGR-004', 'East'),
  -- AEs under James Taylor (West-1)
  ('a0000000-0000-0000-0000-000000000100', 'okta-ae-001', 'alex.martinez@td.com', 'Alex Martinez', 'ae', 'SF-AE-001', 'West'),
  ('a0000000-0000-0000-0000-000000000101', 'okta-ae-002', 'jordan.smith@td.com', 'Jordan Smith', 'ae', 'SF-AE-002', 'West'),
  ('a0000000-0000-0000-0000-000000000102', 'okta-ae-003', 'casey.brown@td.com', 'Casey Brown', 'ae', 'SF-AE-003', 'West'),
  -- AEs under Emily Davis (West-2)
  ('a0000000-0000-0000-0000-000000000103', 'okta-ae-004', 'taylor.wilson@td.com', 'Taylor Wilson', 'ae', 'SF-AE-004', 'West'),
  ('a0000000-0000-0000-0000-000000000104', 'okta-ae-005', 'morgan.lee@td.com', 'Morgan Lee', 'ae', 'SF-AE-005', 'West'),
  ('a0000000-0000-0000-0000-000000000105', 'okta-ae-006', 'riley.thomas@td.com', 'Riley Thomas', 'ae', 'SF-AE-006', 'West'),
  -- AEs under Robert Kim (East-1)
  ('a0000000-0000-0000-0000-000000000106', 'okta-ae-007', 'drew.anderson@td.com', 'Drew Anderson', 'ae', 'SF-AE-007', 'East'),
  ('a0000000-0000-0000-0000-000000000107', 'okta-ae-008', 'sam.jackson@td.com', 'Sam Jackson', 'ae', 'SF-AE-008', 'East'),
  ('a0000000-0000-0000-0000-000000000108', 'okta-ae-009', 'chris.white@td.com', 'Chris White', 'ae', 'SF-AE-009', 'East'),
  -- AEs under Amanda Garcia (East-2)
  ('a0000000-0000-0000-0000-000000000109', 'okta-ae-010', 'pat.harris@td.com', 'Pat Harris', 'ae', 'SF-AE-010', 'East'),
  ('a0000000-0000-0000-0000-000000000110', 'okta-ae-011', 'jamie.clark@td.com', 'Jamie Clark', 'ae', 'SF-AE-011', 'East'),
  ('a0000000-0000-0000-0000-000000000111', 'okta-ae-012', 'quinn.lewis@td.com', 'Quinn Lewis', 'ae', 'SF-AE-012', 'East'),
  -- RevOps Read-Only
  ('a0000000-0000-0000-0000-000000000200', 'okta-revops-001', 'revops.viewer@td.com', 'RevOps Viewer', 'revops_ro', NULL, NULL),
  -- Enterprise RO
  ('a0000000-0000-0000-0000-000000000201', 'okta-ent-001', 'enterprise.viewer@td.com', 'Enterprise Viewer', 'enterprise_ro', NULL, NULL);

-- ============================================================
-- User Hierarchy (active records — effective_to IS NULL)
-- ============================================================
INSERT INTO user_hierarchy (id, user_id, manager_id, effective_from, effective_to) VALUES
  -- VPs report to CRO
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000010', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000010', '2026-02-01', NULL),
  -- Managers report to VPs
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000021', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000021', '2026-02-01', NULL),
  -- AEs under James Taylor
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000030', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000030', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000030', '2026-02-01', NULL),
  -- AEs under Emily Davis
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000031', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000031', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000031', '2026-02-01', NULL),
  -- AEs under Robert Kim
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000000032', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 'a0000000-0000-0000-0000-000000000032', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 'a0000000-0000-0000-0000-000000000032', '2026-02-01', NULL),
  -- AEs under Amanda Garcia
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000109', 'a0000000-0000-0000-0000-000000000033', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000033', '2026-02-01', NULL),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000111', 'a0000000-0000-0000-0000-000000000033', '2026-02-01', NULL);

-- ============================================================
-- Accounts (30 across regions)
-- ============================================================
INSERT INTO accounts (id, salesforce_account_id, name, industry, region, owner_user_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'SF-ACC-001', 'Acme Corp', 'Technology', 'West', 'a0000000-0000-0000-0000-000000000100'),
  ('b0000000-0000-0000-0000-000000000002', 'SF-ACC-002', 'GlobalTech Inc', 'Technology', 'West', 'a0000000-0000-0000-0000-000000000100'),
  ('b0000000-0000-0000-0000-000000000003', 'SF-ACC-003', 'Summit Financial', 'Financial Services', 'West', 'a0000000-0000-0000-0000-000000000101'),
  ('b0000000-0000-0000-0000-000000000004', 'SF-ACC-004', 'Pacific Health', 'Healthcare', 'West', 'a0000000-0000-0000-0000-000000000101'),
  ('b0000000-0000-0000-0000-000000000005', 'SF-ACC-005', 'Redwood Manufacturing', 'Manufacturing', 'West', 'a0000000-0000-0000-0000-000000000102'),
  ('b0000000-0000-0000-0000-000000000006', 'SF-ACC-006', 'Sierra Logistics', 'Logistics', 'West', 'a0000000-0000-0000-0000-000000000102'),
  ('b0000000-0000-0000-0000-000000000007', 'SF-ACC-007', 'Bay Area Analytics', 'Technology', 'West', 'a0000000-0000-0000-0000-000000000103'),
  ('b0000000-0000-0000-0000-000000000008', 'SF-ACC-008', 'Cascade Energy', 'Energy', 'West', 'a0000000-0000-0000-0000-000000000103'),
  ('b0000000-0000-0000-0000-000000000009', 'SF-ACC-009', 'Olympic Retail', 'Retail', 'West', 'a0000000-0000-0000-0000-000000000104'),
  ('b0000000-0000-0000-0000-000000000010', 'SF-ACC-010', 'Pinnacle Software', 'Technology', 'West', 'a0000000-0000-0000-0000-000000000104'),
  ('b0000000-0000-0000-0000-000000000011', 'SF-ACC-011', 'Frontier Media', 'Media', 'West', 'a0000000-0000-0000-0000-000000000105'),
  ('b0000000-0000-0000-0000-000000000012', 'SF-ACC-012', 'Evergreen Solutions', 'Consulting', 'West', 'a0000000-0000-0000-0000-000000000105'),
  ('b0000000-0000-0000-0000-000000000013', 'SF-ACC-013', 'Atlas Industries', 'Manufacturing', 'East', 'a0000000-0000-0000-0000-000000000106'),
  ('b0000000-0000-0000-0000-000000000014', 'SF-ACC-014', 'Beacon Healthcare', 'Healthcare', 'East', 'a0000000-0000-0000-0000-000000000106'),
  ('b0000000-0000-0000-0000-000000000015', 'SF-ACC-015', 'Capital Group', 'Financial Services', 'East', 'a0000000-0000-0000-0000-000000000107'),
  ('b0000000-0000-0000-0000-000000000016', 'SF-ACC-016', 'Diamond Tech', 'Technology', 'East', 'a0000000-0000-0000-0000-000000000107'),
  ('b0000000-0000-0000-0000-000000000017', 'SF-ACC-017', 'Empire State Corp', 'Consulting', 'East', 'a0000000-0000-0000-0000-000000000108'),
  ('b0000000-0000-0000-0000-000000000018', 'SF-ACC-018', 'First National Bank', 'Financial Services', 'East', 'a0000000-0000-0000-0000-000000000108'),
  ('b0000000-0000-0000-0000-000000000019', 'SF-ACC-019', 'Grand Central Media', 'Media', 'East', 'a0000000-0000-0000-0000-000000000109'),
  ('b0000000-0000-0000-0000-000000000020', 'SF-ACC-020', 'Harbor Shipping', 'Logistics', 'East', 'a0000000-0000-0000-0000-000000000109'),
  ('b0000000-0000-0000-0000-000000000021', 'SF-ACC-021', 'Iron Bridge Energy', 'Energy', 'East', 'a0000000-0000-0000-0000-000000000110'),
  ('b0000000-0000-0000-0000-000000000022', 'SF-ACC-022', 'Jetstream Airlines', 'Transportation', 'East', 'a0000000-0000-0000-0000-000000000110'),
  ('b0000000-0000-0000-0000-000000000023', 'SF-ACC-023', 'Keystone Insurance', 'Insurance', 'East', 'a0000000-0000-0000-0000-000000000111'),
  ('b0000000-0000-0000-0000-000000000024', 'SF-ACC-024', 'Liberty Education', 'Education', 'East', 'a0000000-0000-0000-0000-000000000111'),
  ('b0000000-0000-0000-0000-000000000025', 'SF-ACC-025', 'Metro Telecom', 'Telecommunications', 'West', 'a0000000-0000-0000-0000-000000000100'),
  ('b0000000-0000-0000-0000-000000000026', 'SF-ACC-026', 'Nordic Pharma', 'Healthcare', 'East', 'a0000000-0000-0000-0000-000000000106'),
  ('b0000000-0000-0000-0000-000000000027', 'SF-ACC-027', 'Omega Defense', 'Government', 'West', 'a0000000-0000-0000-0000-000000000103'),
  ('b0000000-0000-0000-0000-000000000028', 'SF-ACC-028', 'Pioneer Agri', 'Agriculture', 'East', 'a0000000-0000-0000-0000-000000000109'),
  ('b0000000-0000-0000-0000-000000000029', 'SF-ACC-029', 'Quantum Research', 'Technology', 'West', 'a0000000-0000-0000-0000-000000000101'),
  ('b0000000-0000-0000-0000-000000000030', 'SF-ACC-030', 'Riverside Hospital', 'Healthcare', 'East', 'a0000000-0000-0000-0000-000000000108');

-- ============================================================
-- Quotas (FY2027: all 4 quarters for each AE, revenue type + annual)
-- ============================================================
-- Annual revenue quota for each AE (total for FY2027)
INSERT INTO quotas (id, user_id, fiscal_year, fiscal_quarter, quota_amount, quota_type, entered_by) VALUES
  -- Alex Martinez: $500K annual, split across quarters
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, NULL, 500000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, 1, 125000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, 2, 125000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, 3, 125000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, 4, 125000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, NULL, 1500000.00, 'pipeline', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, NULL, 4, 'pilots', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, NULL, 200, 'activities', 'a0000000-0000-0000-0000-000000000020'),
  -- Jordan Smith: $450K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, NULL, 450000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, 1, 112500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, 2, 112500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, 3, 112500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, 4, 112500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, NULL, 1350000.00, 'pipeline', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, NULL, 3, 'pilots', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 2027, NULL, 180, 'activities', 'a0000000-0000-0000-0000-000000000020'),
  -- Casey Brown: $480K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000102', 2027, NULL, 480000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000102', 2027, 1, 120000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  -- Taylor Wilson: $520K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 2027, NULL, 520000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 2027, 1, 130000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  -- Morgan Lee: $470K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000104', 2027, NULL, 470000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000104', 2027, 1, 117500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  -- Riley Thomas: $490K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000105', 2027, NULL, 490000.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000105', 2027, 1, 122500.00, 'revenue', 'a0000000-0000-0000-0000-000000000020'),
  -- Drew Anderson: $530K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000106', 2027, NULL, 530000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000106', 2027, 1, 132500.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  -- Sam Jackson: $460K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 2027, NULL, 460000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 2027, 1, 115000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  -- Chris White: $510K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 2027, NULL, 510000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 2027, 1, 127500.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  -- Pat Harris: $440K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000109', 2027, NULL, 440000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000109', 2027, 1, 110000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  -- Jamie Clark: $500K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 2027, NULL, 500000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 2027, 1, 125000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  -- Quinn Lewis: $475K
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000111', 2027, NULL, 475000.00, 'revenue', 'a0000000-0000-0000-0000-000000000021'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000111', 2027, 1, 118750.00, 'revenue', 'a0000000-0000-0000-0000-000000000021');

-- ============================================================
-- Opportunities (80 — mix of stages, types, paid pilots)
-- Close dates spread across Q4 FY2026 (Nov-Jan) and Q1 FY2027 (Feb-Apr)
-- ============================================================
INSERT INTO opportunities (id, salesforce_opportunity_id, account_id, owner_user_id, name, stage, amount, arr, close_date, is_closed_won, is_closed_lost, is_paid_pilot, pilot_type, paid_pilot_start_date, paid_pilot_end_date, forecast_category, probability, type) VALUES
  -- Alex Martinez deals
  ('c0000000-0000-0000-0000-000000000001', 'SF-OPP-001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 'Acme Corp - Navigator Enterprise', 'Closed Won', 120000, 120000, '2026-02-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000002', 'SF-OPP-002', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000100', 'GlobalTech - Autopilot Suite', 'Negotiation', 85000, 85000, '2026-03-28', false, false, false, NULL, NULL, NULL, 'commit', 80, 'new_business'),
  ('c0000000-0000-0000-0000-000000000003', 'SF-OPP-003', 'b0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000100', 'Metro Telecom - Paid Pilot', 'Qualification', 45000, 45000, '2026-04-15', false, false, true, 'Paid Pilot', '2026-02-01', '2026-04-01', 'pipeline', 40, 'new_business'),
  ('c0000000-0000-0000-0000-000000000004', 'SF-OPP-004', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 'Acme Corp - Expansion Q1', 'Proposal', 35000, 35000, '2026-04-20', false, false, false, NULL, NULL, NULL, 'best_case', 60, 'expansion'),
  -- Jordan Smith deals
  ('c0000000-0000-0000-0000-000000000005', 'SF-OPP-005', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000101', 'Summit Financial - Platform Deal', 'Closed Won', 95000, 95000, '2026-02-28', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000006', 'SF-OPP-006', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000101', 'Pacific Health - Navigator', 'Discovery', 150000, 150000, '2026-05-30', false, false, false, NULL, NULL, NULL, 'pipeline', 20, 'new_business'),
  ('c0000000-0000-0000-0000-000000000007', 'SF-OPP-007', 'b0000000-0000-0000-0000-000000000029', 'a0000000-0000-0000-0000-000000000101', 'Quantum Research - Paid Pilot', 'Qualification', 60000, 60000, '2026-04-30', false, false, true, 'Paid Pilot', '2026-03-01', '2026-05-01', 'pipeline', 35, 'new_business'),
  ('c0000000-0000-0000-0000-000000000008', 'SF-OPP-008', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000101', 'Summit Financial - Renewal', 'Closed Won', 95000, 95000, '2026-03-01', true, false, false, NULL, NULL, NULL, 'commit', 100, 'renewal'),
  -- Casey Brown deals
  ('c0000000-0000-0000-0000-000000000009', 'SF-OPP-009', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000102', 'Redwood Manufacturing - Full Suite', 'Closed Won', 75000, 75000, '2026-03-05', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000010', 'SF-OPP-010', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000102', 'Sierra Logistics - Autopilot', 'Proposal', 110000, 110000, '2026-04-10', false, false, false, NULL, NULL, NULL, 'best_case', 65, 'new_business'),
  ('c0000000-0000-0000-0000-000000000011', 'SF-OPP-011', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000102', 'Redwood - Paid Pilot Expansion', 'Qualification', 40000, 40000, '2026-04-25', false, false, true, 'Paid Pilot', '2026-02-15', '2026-04-15', 'pipeline', 30, 'expansion'),
  -- Taylor Wilson deals
  ('c0000000-0000-0000-0000-000000000012', 'SF-OPP-012', 'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000103', 'Bay Area Analytics - Enterprise', 'Closed Won', 200000, 200000, '2026-02-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000013', 'SF-OPP-013', 'b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000103', 'Cascade Energy - Navigator', 'Negotiation', 130000, 130000, '2026-03-30', false, false, false, NULL, NULL, NULL, 'commit', 75, 'new_business'),
  ('c0000000-0000-0000-0000-000000000014', 'SF-OPP-014', 'b0000000-0000-0000-0000-000000000027', 'a0000000-0000-0000-0000-000000000103', 'Omega Defense - Paid Pilot', 'Closed Won', 80000, 80000, '2026-03-10', true, false, true, 'Paid Pilot', '2025-12-01', '2026-02-28', 'commit', 100, 'new_business'),
  -- Morgan Lee deals
  ('c0000000-0000-0000-0000-000000000015', 'SF-OPP-015', 'b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000104', 'Olympic Retail - Full Platform', 'Closed Won', 65000, 65000, '2026-02-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000016', 'SF-OPP-016', 'b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000104', 'Pinnacle Software - Autopilot', 'Discovery', 90000, 90000, '2026-06-15', false, false, false, NULL, NULL, NULL, 'pipeline', 15, 'new_business'),
  ('c0000000-0000-0000-0000-000000000017', 'SF-OPP-017', 'b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000104', 'Olympic Retail - Expansion', 'Proposal', 25000, 25000, '2026-04-05', false, false, false, NULL, NULL, NULL, 'best_case', 55, 'expansion'),
  -- Riley Thomas deals
  ('c0000000-0000-0000-0000-000000000018', 'SF-OPP-018', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000105', 'Frontier Media - Navigator', 'Closed Won', 55000, 55000, '2026-03-08', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000019', 'SF-OPP-019', 'b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000105', 'Evergreen Solutions - Enterprise', 'Negotiation', 175000, 175000, '2026-04-20', false, false, false, NULL, NULL, NULL, 'commit', 70, 'new_business'),
  ('c0000000-0000-0000-0000-000000000020', 'SF-OPP-020', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000105', 'Frontier Media - Paid Pilot', 'Qualification', 30000, 30000, '2026-05-01', false, false, true, 'Paid Pilot', '2026-03-01', '2026-04-30', 'pipeline', 25, 'new_business'),
  -- Drew Anderson deals
  ('c0000000-0000-0000-0000-000000000021', 'SF-OPP-021', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000106', 'Atlas Industries - Full Suite', 'Closed Won', 180000, 180000, '2026-02-25', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000022', 'SF-OPP-022', 'b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000106', 'Beacon Healthcare - Navigator', 'Proposal', 95000, 95000, '2026-04-15', false, false, false, NULL, NULL, NULL, 'best_case', 50, 'new_business'),
  ('c0000000-0000-0000-0000-000000000023', 'SF-OPP-023', 'b0000000-0000-0000-0000-000000000026', 'a0000000-0000-0000-0000-000000000106', 'Nordic Pharma - Paid Pilot', 'Qualification', 70000, 70000, '2026-05-15', false, false, true, 'Paid Pilot', '2026-03-15', '2026-05-15', 'pipeline', 30, 'new_business'),
  -- Sam Jackson deals
  ('c0000000-0000-0000-0000-000000000024', 'SF-OPP-024', 'b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000107', 'Capital Group - Enterprise', 'Closed Won', 140000, 140000, '2026-03-01', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000025', 'SF-OPP-025', 'b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000107', 'Diamond Tech - Autopilot', 'Negotiation', 60000, 60000, '2026-03-25', false, false, false, NULL, NULL, NULL, 'commit', 85, 'new_business'),
  ('c0000000-0000-0000-0000-000000000026', 'SF-OPP-026', 'b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000107', 'Capital Group - Expansion', 'Closed Won', 45000, 45000, '2026-03-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  -- Chris White deals
  ('c0000000-0000-0000-0000-000000000027', 'SF-OPP-027', 'b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000108', 'Empire State Corp - Platform', 'Closed Won', 88000, 88000, '2026-02-18', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000028', 'SF-OPP-028', 'b0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000108', 'First National Bank - Navigator', 'Proposal', 200000, 200000, '2026-04-30', false, false, false, NULL, NULL, NULL, 'best_case', 45, 'new_business'),
  ('c0000000-0000-0000-0000-000000000029', 'SF-OPP-029', 'b0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000108', 'Riverside Hospital - Paid Pilot', 'Closed Won', 50000, 50000, '2026-03-05', true, false, true, 'Paid Pilot', '2025-11-01', '2026-02-01', 'commit', 100, 'new_business'),
  -- Pat Harris deals
  ('c0000000-0000-0000-0000-000000000030', 'SF-OPP-030', 'b0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000109', 'Grand Central Media - Suite', 'Closed Won', 72000, 72000, '2026-03-12', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000031', 'SF-OPP-031', 'b0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000109', 'Harbor Shipping - Autopilot', 'Discovery', 115000, 115000, '2026-06-01', false, false, false, NULL, NULL, NULL, 'pipeline', 20, 'new_business'),
  ('c0000000-0000-0000-0000-000000000032', 'SF-OPP-032', 'b0000000-0000-0000-0000-000000000028', 'a0000000-0000-0000-0000-000000000109', 'Pioneer Agri - Paid Pilot', 'Qualification', 35000, 35000, '2026-04-10', false, false, true, 'Paid Pilot', '2026-02-15', '2026-04-10', 'pipeline', 30, 'new_business'),
  -- Jamie Clark deals
  ('c0000000-0000-0000-0000-000000000033', 'SF-OPP-033', 'b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000110', 'Iron Bridge Energy - Enterprise', 'Closed Won', 160000, 160000, '2026-02-14', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000034', 'SF-OPP-034', 'b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000110', 'Jetstream Airlines - Navigator', 'Negotiation', 98000, 98000, '2026-04-01', false, false, false, NULL, NULL, NULL, 'commit', 78, 'new_business'),
  ('c0000000-0000-0000-0000-000000000035', 'SF-OPP-035', 'b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000110', 'Iron Bridge - Renewal', 'Closed Won', 160000, 160000, '2026-03-01', true, false, false, NULL, NULL, NULL, 'commit', 100, 'renewal'),
  -- Quinn Lewis deals
  ('c0000000-0000-0000-0000-000000000036', 'SF-OPP-036', 'b0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000111', 'Keystone Insurance - Full Suite', 'Closed Won', 105000, 105000, '2026-03-02', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000037', 'SF-OPP-037', 'b0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000111', 'Liberty Education - Platform', 'Proposal', 78000, 78000, '2026-04-20', false, false, false, NULL, NULL, NULL, 'best_case', 55, 'new_business'),
  ('c0000000-0000-0000-0000-000000000038', 'SF-OPP-038', 'b0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000111', 'Keystone - Paid Pilot Phase 2', 'Qualification', 55000, 55000, '2026-05-10', false, false, true, 'Paid Pilot', '2026-03-10', '2026-05-10', 'pipeline', 25, 'expansion'),
  -- Q4 FY2026 closed-won deals (Nov 2025 - Jan 2026 close dates) for historical data
  ('c0000000-0000-0000-0000-000000000039', 'SF-OPP-039', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 'Acme Corp - Q4 Deal', 'Closed Won', 90000, 90000, '2025-12-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000040', 'SF-OPP-040', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000101', 'Summit Financial - Q4', 'Closed Won', 80000, 80000, '2025-11-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  ('c0000000-0000-0000-0000-000000000041', 'SF-OPP-041', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000102', 'Redwood - Q4 Navigator', 'Closed Won', 65000, 65000, '2026-01-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000042', 'SF-OPP-042', 'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000103', 'Bay Area Analytics - Q4', 'Closed Won', 145000, 145000, '2025-12-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000043', 'SF-OPP-043', 'b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000104', 'Olympic Retail - Q4', 'Closed Won', 55000, 55000, '2025-11-30', true, false, false, NULL, NULL, NULL, 'commit', 100, 'renewal'),
  ('c0000000-0000-0000-0000-000000000044', 'SF-OPP-044', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000105', 'Frontier Media - Q4', 'Closed Won', 42000, 42000, '2026-01-05', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000045', 'SF-OPP-045', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000106', 'Atlas Industries - Q4', 'Closed Won', 125000, 125000, '2025-12-01', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000046', 'SF-OPP-046', 'b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000107', 'Capital Group - Q4', 'Closed Won', 95000, 95000, '2025-12-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000047', 'SF-OPP-047', 'b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000108', 'Empire State - Q4', 'Closed Won', 70000, 70000, '2026-01-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  ('c0000000-0000-0000-0000-000000000048', 'SF-OPP-048', 'b0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000109', 'Grand Central - Q4', 'Closed Won', 58000, 58000, '2025-11-28', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000049', 'SF-OPP-049', 'b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000110', 'Iron Bridge - Q4', 'Closed Won', 110000, 110000, '2025-12-18', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000050', 'SF-OPP-050', 'b0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000111', 'Keystone Insurance - Q4', 'Closed Won', 88000, 88000, '2026-01-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  -- Closed-lost deals
  ('c0000000-0000-0000-0000-000000000051', 'SF-OPP-051', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000100', 'GlobalTech - Lost Deal', 'Closed Lost', 75000, 75000, '2026-02-20', false, true, false, NULL, NULL, NULL, 'omitted', 0, 'new_business'),
  ('c0000000-0000-0000-0000-000000000052', 'SF-OPP-052', 'b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000107', 'Diamond Tech - Lost', 'Closed Lost', 55000, 55000, '2026-03-01', false, true, false, NULL, NULL, NULL, 'omitted', 0, 'new_business'),
  ('c0000000-0000-0000-0000-000000000053', 'SF-OPP-053', 'b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000110', 'Jetstream - Lost Pilot', 'Closed Lost', 40000, 40000, '2026-02-28', false, true, true, 'Paid Pilot', '2025-10-01', '2026-01-31', 'omitted', 0, 'new_business'),
  -- Additional open pipeline deals
  ('c0000000-0000-0000-0000-000000000054', 'SF-OPP-054', 'b0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000100', 'Metro Telecom - Expansion', 'Discovery', 200000, 200000, '2026-07-01', false, false, false, NULL, NULL, NULL, 'pipeline', 10, 'expansion'),
  ('c0000000-0000-0000-0000-000000000055', 'SF-OPP-055', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000101', 'Pacific Health - Autopilot', 'Qualification', 120000, 120000, '2026-05-15', false, false, false, NULL, NULL, NULL, 'pipeline', 25, 'new_business'),
  ('c0000000-0000-0000-0000-000000000056', 'SF-OPP-056', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000102', 'Sierra Logistics - Renewal', 'Negotiation', 110000, 110000, '2026-04-01', false, false, false, NULL, NULL, NULL, 'commit', 90, 'renewal'),
  ('c0000000-0000-0000-0000-000000000057', 'SF-OPP-057', 'b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000103', 'Cascade Energy - Full Suite', 'Proposal', 250000, 250000, '2026-05-30', false, false, false, NULL, NULL, NULL, 'best_case', 40, 'new_business'),
  ('c0000000-0000-0000-0000-000000000058', 'SF-OPP-058', 'b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000104', 'Pinnacle Software - Enterprise', 'Discovery', 180000, 180000, '2026-06-30', false, false, false, NULL, NULL, NULL, 'pipeline', 15, 'new_business'),
  ('c0000000-0000-0000-0000-000000000059', 'SF-OPP-059', 'b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000105', 'Evergreen - Expansion', 'Qualification', 65000, 65000, '2026-05-01', false, false, false, NULL, NULL, NULL, 'pipeline', 30, 'expansion'),
  ('c0000000-0000-0000-0000-000000000060', 'SF-OPP-060', 'b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000106', 'Beacon Healthcare - Renewal', 'Proposal', 95000, 95000, '2026-04-15', false, false, false, NULL, NULL, NULL, 'best_case', 55, 'renewal'),
  ('c0000000-0000-0000-0000-000000000061', 'SF-OPP-061', 'b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000107', 'Diamond Tech - Navigator', 'Qualification', 75000, 75000, '2026-05-20', false, false, false, NULL, NULL, NULL, 'pipeline', 20, 'new_business'),
  ('c0000000-0000-0000-0000-000000000062', 'SF-OPP-062', 'b0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000108', 'First National - Expansion', 'Discovery', 150000, 150000, '2026-06-15', false, false, false, NULL, NULL, NULL, 'pipeline', 10, 'expansion'),
  ('c0000000-0000-0000-0000-000000000063', 'SF-OPP-063', 'b0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000109', 'Harbor Shipping - Renewal', 'Negotiation', 115000, 115000, '2026-04-10', false, false, false, NULL, NULL, NULL, 'commit', 80, 'renewal'),
  ('c0000000-0000-0000-0000-000000000064', 'SF-OPP-064', 'b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000110', 'Jetstream - Renewal', 'Proposal', 85000, 85000, '2026-04-15', false, false, false, NULL, NULL, NULL, 'best_case', 60, 'renewal'),
  ('c0000000-0000-0000-0000-000000000065', 'SF-OPP-065', 'b0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000111', 'Liberty Education - Navigator', 'Discovery', 92000, 92000, '2026-06-01', false, false, false, NULL, NULL, NULL, 'pipeline', 20, 'new_business'),
  -- More paid pilots (expired / expiring soon)
  ('c0000000-0000-0000-0000-000000000066', 'SF-OPP-066', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000101', 'Pacific Health - Paid Pilot', 'Qualification', 55000, 55000, '2026-04-15', false, false, true, 'Paid Pilot', '2026-01-15', '2026-03-15', 'pipeline', 35, 'new_business'),
  ('c0000000-0000-0000-0000-000000000067', 'SF-OPP-067', 'b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000104', 'Pinnacle - Paid Pilot', 'Qualification', 48000, 48000, '2026-05-01', false, false, true, 'Paid Pilot', '2026-02-01', '2026-04-01', 'pipeline', 30, 'new_business'),
  -- Additional Q3 FY2026 historical deals (Aug-Oct 2025)
  ('c0000000-0000-0000-0000-000000000068', 'SF-OPP-068', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 'Acme Corp - Q3 Deal', 'Closed Won', 78000, 78000, '2025-09-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000069', 'SF-OPP-069', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000101', 'Summit Financial - Q3', 'Closed Won', 62000, 62000, '2025-08-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000070', 'SF-OPP-070', 'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000103', 'Bay Area - Q3', 'Closed Won', 135000, 135000, '2025-10-01', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  ('c0000000-0000-0000-0000-000000000071', 'SF-OPP-071', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000106', 'Atlas Industries - Q3', 'Closed Won', 98000, 98000, '2025-09-25', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000072', 'SF-OPP-072', 'b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000108', 'Empire State - Q3', 'Closed Won', 82000, 82000, '2025-10-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000073', 'SF-OPP-073', 'b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000110', 'Iron Bridge - Q3', 'Closed Won', 95000, 95000, '2025-08-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'renewal'),
  -- Q2 FY2026 historical deals (May-Jul 2025)
  ('c0000000-0000-0000-0000-000000000074', 'SF-OPP-074', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 'Acme Corp - Q2 Deal', 'Closed Won', 68000, 68000, '2025-06-10', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  ('c0000000-0000-0000-0000-000000000075', 'SF-OPP-075', 'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000103', 'Bay Area - Q2', 'Closed Won', 115000, 115000, '2025-05-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000076', 'SF-OPP-076', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000106', 'Atlas Industries - Q2', 'Closed Won', 72000, 72000, '2025-07-05', true, false, false, NULL, NULL, NULL, 'commit', 100, 'expansion'),
  ('c0000000-0000-0000-0000-000000000077', 'SF-OPP-077', 'b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000107', 'Capital Group - Q2', 'Closed Won', 82000, 82000, '2025-06-15', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000078', 'SF-OPP-078', 'b0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000109', 'Grand Central - Q2', 'Closed Won', 45000, 45000, '2025-05-28', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000079', 'SF-OPP-079', 'b0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000111', 'Keystone - Q2', 'Closed Won', 56000, 56000, '2025-07-20', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business'),
  ('c0000000-0000-0000-0000-000000000080', 'SF-OPP-080', 'b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000104', 'Olympic Retail - Q2', 'Closed Won', 48000, 48000, '2025-06-25', true, false, false, NULL, NULL, NULL, 'commit', 100, 'new_business');

-- ============================================================
-- Activities (200 across AEs, spread over Q4 FY2026 and Q1 FY2027)
-- ============================================================
-- Generate activities using a pattern: 200 activities across 12 AEs
DO $$
DECLARE
  ae_ids uuid[] := ARRAY[
    'a0000000-0000-0000-0000-000000000100','a0000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000102',
    'a0000000-0000-0000-0000-000000000103','a0000000-0000-0000-0000-000000000104','a0000000-0000-0000-0000-000000000105',
    'a0000000-0000-0000-0000-000000000106','a0000000-0000-0000-0000-000000000107','a0000000-0000-0000-0000-000000000108',
    'a0000000-0000-0000-0000-000000000109','a0000000-0000-0000-0000-000000000110','a0000000-0000-0000-0000-000000000111'
  ];
  acct_ids uuid[] := ARRAY[
    'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000011',
    'b0000000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000017',
    'b0000000-0000-0000-0000-000000000019','b0000000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000023'
  ];
  types text[] := ARRAY['call','email','meeting','demo','call','email','meeting','call','email','call'];
  subjects text[] := ARRAY['Discovery call','Follow-up email','Product demo','Quarterly review','Pricing discussion','Technical deep-dive','Contract review','Intro meeting','Check-in call','Feature walkthrough'];
  i integer;
  ae_idx integer;
  base_date date;
BEGIN
  FOR i IN 1..200 LOOP
    ae_idx := ((i - 1) % 12) + 1;
    base_date := '2025-11-01'::date + ((i * 3) % 130);
    INSERT INTO activities (id, salesforce_activity_id, account_id, owner_user_id, activity_type, activity_date, subject) VALUES (
      gen_random_uuid(),
      'SF-ACT-' || lpad(i::text, 3, '0'),
      acct_ids[ae_idx],
      ae_ids[ae_idx],
      types[((i - 1) % 10) + 1],
      base_date,
      subjects[((i - 1) % 10) + 1] || ' #' || i
    );
  END LOOP;
END $$;

-- ============================================================
-- Usage Billing Summary — populated via Snowflake sync, not seed data
-- ============================================================

-- ============================================================
-- Commission Rates
-- ============================================================
-- Global default rate
INSERT INTO commission_rates (id, user_id, fiscal_year, fiscal_quarter, deal_type, rate, entered_by) VALUES
  (gen_random_uuid(), NULL, 2027, NULL, NULL, 0.0800, 'a0000000-0000-0000-0000-000000000010'),
  -- Higher rate for new business
  (gen_random_uuid(), NULL, 2027, NULL, 'new_business', 0.1000, 'a0000000-0000-0000-0000-000000000010'),
  -- AE-specific overrides
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 2027, NULL, NULL, 0.0900, 'a0000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 2027, 1, NULL, 0.1100, 'a0000000-0000-0000-0000-000000000010'),
  -- Q4 FY2026 rates
  (gen_random_uuid(), NULL, 2026, NULL, NULL, 0.0800, 'a0000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), NULL, 2026, NULL, 'new_business', 0.1000, 'a0000000-0000-0000-0000-000000000010');

-- ============================================================
-- Commissions (computed for closed-won deals)
-- ============================================================
INSERT INTO commissions (id, user_id, opportunity_id, fiscal_year, fiscal_quarter, base_amount, usage_multiplier, commission_rate, commission_amount, calculation_date, is_finalized) VALUES
  -- Q1 FY2027 commissions (unfinalized)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000001', 2027, 1, 120000, 1.0, 0.0900, 10800.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000005', 2027, 1, 95000, 1.0, 0.1000, 9500.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000008', 2027, 1, 95000, 1.0, 0.0800, 7600.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000009', 2027, 1, 75000, 1.0, 0.1000, 7500.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000012', 2027, 1, 200000, 1.0, 0.1100, 22000.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000014', 2027, 1, 80000, 1.0, 0.1100, 8800.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000104', 'c0000000-0000-0000-0000-000000000015', 2027, 1, 65000, 1.0, 0.1000, 6500.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000105', 'c0000000-0000-0000-0000-000000000018', 2027, 1, 55000, 1.0, 0.1000, 5500.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000106', 'c0000000-0000-0000-0000-000000000021', 2027, 1, 180000, 1.0, 0.1000, 18000.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 'c0000000-0000-0000-0000-000000000024', 2027, 1, 140000, 1.0, 0.1000, 14000.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 'c0000000-0000-0000-0000-000000000026', 2027, 1, 45000, 1.0, 0.0800, 3600.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 'c0000000-0000-0000-0000-000000000027', 2027, 1, 88000, 1.0, 0.1000, 8800.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 'c0000000-0000-0000-0000-000000000029', 2027, 1, 50000, 1.0, 0.1000, 5000.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000109', 'c0000000-0000-0000-0000-000000000030', 2027, 1, 72000, 1.0, 0.1000, 7200.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 'c0000000-0000-0000-0000-000000000033', 2027, 1, 160000, 1.0, 0.1000, 16000.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 'c0000000-0000-0000-0000-000000000035', 2027, 1, 160000, 1.0, 0.0800, 12800.00, now(), false),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000111', 'c0000000-0000-0000-0000-000000000036', 2027, 1, 105000, 1.0, 0.1000, 10500.00, now(), false),
  -- Q4 FY2026 commissions (finalized)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000039', 2026, 4, 90000, 1.0, 0.1000, 9000.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000040', 2026, 4, 80000, 1.0, 0.0800, 6400.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000041', 2026, 4, 65000, 1.0, 0.1000, 6500.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000042', 2026, 4, 145000, 1.0, 0.1000, 14500.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000104', 'c0000000-0000-0000-0000-000000000043', 2026, 4, 55000, 1.0, 0.0800, 4400.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000105', 'c0000000-0000-0000-0000-000000000044', 2026, 4, 42000, 1.0, 0.1000, 4200.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000106', 'c0000000-0000-0000-0000-000000000045', 2026, 4, 125000, 1.0, 0.1000, 12500.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000107', 'c0000000-0000-0000-0000-000000000046', 2026, 4, 95000, 1.0, 0.1000, 9500.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000108', 'c0000000-0000-0000-0000-000000000047', 2026, 4, 70000, 1.0, 0.0800, 5600.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000109', 'c0000000-0000-0000-0000-000000000048', 2026, 4, 58000, 1.0, 0.1000, 5800.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000110', 'c0000000-0000-0000-0000-000000000049', 2026, 4, 110000, 1.0, 0.1000, 11000.00, '2026-02-01', true),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000111', 'c0000000-0000-0000-0000-000000000050', 2026, 4, 88000, 1.0, 0.1000, 8800.00, '2026-02-01', true);

-- ============================================================
-- Sync Log (recent entries)
-- ============================================================
INSERT INTO sync_log (id, sync_type, triggered_by, started_at, completed_at, status, records_synced) VALUES
  (gen_random_uuid(), 'salesforce', 'a0000000-0000-0000-0000-000000000010', '2026-03-11 14:00:00+00', '2026-03-11 14:02:30+00', 'success', 310),
  (gen_random_uuid(), 'looker', 'a0000000-0000-0000-0000-000000000010', '2026-03-11 14:03:00+00', '2026-03-11 14:04:15+00', 'success', 180),
  (gen_random_uuid(), 'salesforce', 'a0000000-0000-0000-0000-000000000020', '2026-03-10 09:00:00+00', '2026-03-10 09:03:00+00', 'success', 305),
  (gen_random_uuid(), 'scim', NULL, '2026-03-09 08:00:00+00', '2026-03-09 08:00:05+00', 'success', 1);
