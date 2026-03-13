-- TD RevenueIQ — Initial Schema Migration
-- All tables for v1 + Phase 2/3 stubs

-- ============================================================
-- Fiscal Configuration
-- ============================================================
CREATE TABLE fiscal_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fy_start_month  integer DEFAULT 2,
  fy_start_day    integer DEFAULT 1,
  updated_by      uuid,
  updated_at      timestamptz
);

-- ============================================================
-- Phase 3 Stub: Partners
-- ============================================================
CREATE TABLE partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  partner_tier    text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  okta_id             text UNIQUE NOT NULL,
  email               text UNIQUE NOT NULL,
  full_name           text NOT NULL,
  role                text NOT NULL CHECK (role IN ('ae','manager','avp','vp','cro','c_level','revops_ro','revops_rw','enterprise_ro')),
  salesforce_user_id  text,
  region              text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================
-- User Preferences
-- ============================================================
CREATE TABLE user_preferences (
  user_id     uuid PRIMARY KEY REFERENCES users(id),
  theme       text DEFAULT 'light' CHECK (theme IN ('light','dark')),
  updated_at  timestamptz DEFAULT now()
);

-- ============================================================
-- User Hierarchy
-- ============================================================
CREATE TABLE user_hierarchy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  manager_id      uuid NOT NULL REFERENCES users(id),
  effective_from  date NOT NULL,
  effective_to    date
);

CREATE INDEX idx_user_hierarchy_user_id ON user_hierarchy(user_id);
CREATE INDEX idx_user_hierarchy_manager_id ON user_hierarchy(manager_id);
CREATE INDEX idx_user_hierarchy_active ON user_hierarchy(user_id, manager_id) WHERE effective_to IS NULL;

-- ============================================================
-- Permission Overrides
-- ============================================================
CREATE TABLE permission_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  granted_by          uuid NOT NULL REFERENCES users(id),
  effective_role      text NOT NULL CHECK (effective_role IN ('manager','avp','vp','cro','c_level')),
  allow_writes        boolean DEFAULT false,
  notes               text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES users(id)
);

CREATE INDEX idx_permission_overrides_user ON permission_overrides(user_id) WHERE is_active = true;

-- ============================================================
-- Accounts
-- ============================================================
CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_account_id text UNIQUE NOT NULL,
  name                  text NOT NULL,
  industry              text,
  region                text,
  owner_user_id         uuid REFERENCES users(id),
  last_synced_at        timestamptz,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);

-- ============================================================
-- Phase 2 Stub: Quota Scopes
-- ============================================================
CREATE TABLE quota_scopes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      text NOT NULL,
  scope_name      text NOT NULL,
  parent_scope_id uuid REFERENCES quota_scopes(id),
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- Quotas
-- ============================================================
CREATE TABLE quotas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  fiscal_year     integer NOT NULL,
  fiscal_quarter  integer,
  quota_amount    numeric(18,2) NOT NULL,
  quota_type      text NOT NULL CHECK (quota_type IN ('revenue','pilots','pipeline','activities')),
  entered_by      uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  -- Phase 2 stubs
  quota_scope_type  text,
  quota_scope_id    uuid REFERENCES quota_scopes(id)
);

CREATE INDEX idx_quotas_user_fy ON quotas(user_id, fiscal_year);

-- ============================================================
-- Opportunities
-- ============================================================
CREATE TABLE opportunities (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_opportunity_id text UNIQUE NOT NULL,
  account_id                uuid REFERENCES accounts(id),
  owner_user_id             uuid REFERENCES users(id),
  name                      text NOT NULL,
  stage                     text NOT NULL,
  amount                    numeric(18,2),
  arr                       numeric(18,2),
  close_date                date,
  is_closed_won             boolean DEFAULT false,
  is_closed_lost            boolean DEFAULT false,
  is_paid_pilot             boolean DEFAULT false,
  pilot_type                text,
  paid_pilot_start_date     date,
  paid_pilot_end_date       date,
  forecast_category         text,
  probability               integer CHECK (probability >= 0 AND probability <= 100),
  type                      text,
  last_stage_changed_at     timestamptz,
  -- Phase 3 stub
  partner_id                uuid REFERENCES partners(id),
  last_synced_at            timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_opportunities_owner ON opportunities(owner_user_id);
CREATE INDEX idx_opportunities_close_date ON opportunities(close_date);
CREATE INDEX idx_opportunities_closed_won ON opportunities(owner_user_id, close_date) WHERE is_closed_won = true;
CREATE INDEX idx_opportunities_paid_pilot ON opportunities(owner_user_id) WHERE is_paid_pilot = true;
CREATE INDEX idx_opportunities_open ON opportunities(owner_user_id, stage) WHERE is_closed_won = false AND is_closed_lost = false;
CREATE INDEX idx_opportunities_account ON opportunities(account_id);

-- ============================================================
-- Phase 3 Stub: Opportunity Partners
-- ============================================================
CREATE TABLE opportunity_partners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id      uuid REFERENCES opportunities(id),
  partner_id          uuid REFERENCES partners(id),
  attribution_type    text,
  attribution_weight  numeric(5,2),
  created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- Phase 2 Stub: Opportunity Contributors
-- ============================================================
CREATE TABLE opportunity_contributors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id      uuid REFERENCES opportunities(id),
  contributor_id      uuid REFERENCES users(id),
  contribution_type   text,
  created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- Activities
-- ============================================================
CREATE TABLE activities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_activity_id text UNIQUE NOT NULL,
  opportunity_id         uuid REFERENCES opportunities(id),
  account_id             uuid REFERENCES accounts(id),
  owner_user_id          uuid REFERENCES users(id),
  activity_type          text NOT NULL CHECK (activity_type IN ('call','email','meeting','demo','other')),
  activity_date          date NOT NULL,
  subject                text,
  description            text,
  last_synced_at         timestamptz,
  created_at             timestamptz DEFAULT now()
);

CREATE INDEX idx_activities_owner ON activities(owner_user_id);
CREATE INDEX idx_activities_date ON activities(activity_date);
CREATE INDEX idx_activities_owner_date ON activities(owner_user_id, activity_date);
CREATE INDEX idx_activities_account ON activities(account_id);

-- ============================================================
-- Usage Metrics (Looker)
-- ============================================================
CREATE TABLE usage_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id),
  opportunity_id  uuid REFERENCES opportunities(id),
  metric_date     date NOT NULL,
  product_type    text NOT NULL,
  interaction_count integer NOT NULL DEFAULT 0,
  looker_query_id text,
  fetched_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_usage_metrics_account ON usage_metrics(account_id);
CREATE INDEX idx_usage_metrics_account_product ON usage_metrics(account_id, product_type, metric_date);

-- ============================================================
-- Commission Rates
-- ============================================================
CREATE TABLE commission_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id),
  fiscal_year     integer NOT NULL,
  fiscal_quarter  integer,
  deal_type       text,
  rate            numeric(6,4) NOT NULL,
  entered_by      uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_commission_rates_user ON commission_rates(user_id, fiscal_year);

-- ============================================================
-- Commissions
-- ============================================================
CREATE TABLE commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  opportunity_id      uuid NOT NULL REFERENCES opportunities(id),
  fiscal_year         integer NOT NULL,
  fiscal_quarter      integer NOT NULL,
  base_amount         numeric(18,2),
  usage_multiplier    numeric(6,4),
  commission_rate     numeric(6,4),
  commission_amount   numeric(18,2),
  calculation_date    timestamptz,
  is_finalized        boolean DEFAULT false,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_commissions_user ON commissions(user_id, fiscal_year, fiscal_quarter);
CREATE INDEX idx_commissions_opportunity ON commissions(opportunity_id);

-- ============================================================
-- Sync Log
-- ============================================================
CREATE TABLE sync_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type       text NOT NULL CHECK (sync_type IN ('salesforce','looker','scim')),
  triggered_by    uuid REFERENCES users(id),
  target_user_id  uuid REFERENCES users(id),
  started_at      timestamptz,
  completed_at    timestamptz,
  status          text CHECK (status IN ('running','success','partial','failed','warning')),
  records_synced  integer,
  error_message   text,
  raw_payload     jsonb
);

CREATE INDEX idx_sync_log_type ON sync_log(sync_type, started_at DESC);

-- Add FK from fiscal_config.updated_by to users
ALTER TABLE fiscal_config ADD CONSTRAINT fk_fiscal_config_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
