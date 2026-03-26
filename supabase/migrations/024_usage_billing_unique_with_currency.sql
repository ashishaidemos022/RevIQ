-- Update unique constraint to include currency
-- (accounts can move regions, resulting in two entries per period with different currencies)
ALTER TABLE usage_billing_summary
  DROP CONSTRAINT usage_billing_summary_period_name_td_billing_account_id_wal_key;

ALTER TABLE usage_billing_summary
  ADD CONSTRAINT usage_billing_summary_unique_key
  UNIQUE (period_name, td_billing_account_id, wallet_name, currency);
