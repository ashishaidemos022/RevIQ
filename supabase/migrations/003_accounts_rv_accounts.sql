-- TD RevenueIQ — Extend Accounts + Create RV Accounts Table

-- ============================================================
-- Extend accounts table with Salesforce custom fields
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sales_region text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_arr numeric(18,2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_status text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sales_segment text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS segment_industry text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS td_industry text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS td_subindustry text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_success_manager_sf_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sdr_sf_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exec_sponsor_sf_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_sf_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vmo_support_sf_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS rv_account_sf_id text;

-- ============================================================
-- RV Accounts (Partner Accounts from managed package)
-- ============================================================
CREATE TABLE rv_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_rv_id      text UNIQUE NOT NULL,
  name                  text NOT NULL,
  sf_account_id         text,              -- rvpe__SFAccount__c — links to parent SF Account
  partner_subtype       text,              -- Reseller, Channel, Systems Integrator, AppConnect, etc.
  region                text,
  owner_sf_id           text,
  last_synced_at        timestamptz,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_rv_accounts_sf_account ON rv_accounts(sf_account_id);
