-- Create usage_billing_summary table for Snowflake usage data
CREATE TABLE usage_billing_summary (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name                   text NOT NULL,
  sf_account_owner_id           text,
  sf_account_owner              text,
  sf_account_id                 text NOT NULL,
  sf_account_name               text,
  td_billing_account_id         text NOT NULL,
  td_billing_account_name       text,
  taxonomy_name                 text,
  macro_sku_name_old            text,
  macro_sku_name_new            text,
  wallet_name                   text NOT NULL,
  usage_type                    text,
  currency                      text,
  contract_exchange_rate        numeric(10,4),
  ns_exchange_rate              numeric(10,4),
  total_consumption_amount_cur  numeric(18,4),
  total_overage_amount_cur      numeric(18,4),
  total_charged_amount_cur      numeric(18,4),
  total_consumption_amount_usd  numeric(18,4),
  total_overage_amount_usd      numeric(18,4),
  total_charged_amount_ns_usd   numeric(18,4),
  total_charged_amount_sf_usd   numeric(18,4),
  synced_at                     timestamptz DEFAULT now(),
  UNIQUE(period_name, td_billing_account_id, wallet_name)
);

CREATE INDEX idx_usage_billing_period ON usage_billing_summary(period_name);
CREATE INDEX idx_usage_billing_sf_account ON usage_billing_summary(sf_account_id);
CREATE INDEX idx_usage_billing_td_account ON usage_billing_summary(td_billing_account_id);
CREATE INDEX idx_usage_billing_usage_type ON usage_billing_summary(usage_type);

-- Drop old usage_metrics table (was designed for Looker, no longer used)
DROP TABLE IF EXISTS usage_metrics;
