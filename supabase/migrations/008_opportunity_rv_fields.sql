-- Add RV Account fields to opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS rv_account_sf_id text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS rv_account_type text;

CREATE INDEX idx_opps_rv_account ON opportunities(rv_account_sf_id);
