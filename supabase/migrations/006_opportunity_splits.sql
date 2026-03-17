-- Opportunity Splits synced from Salesforce OpportunitySplit object
CREATE TABLE IF NOT EXISTS opportunity_splits (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_split_id       text UNIQUE NOT NULL,
  opportunity_id            uuid REFERENCES opportunities(id),
  salesforce_opportunity_id text NOT NULL,
  split_owner_user_id       uuid REFERENCES users(id),
  split_owner_sf_id         text,
  split_amount              numeric(18,2),
  split_percentage          numeric(8,4),
  split_type                text,
  sf_created_date           timestamptz,
  last_synced_at            timestamptz,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_opp_splits_opportunity_id ON opportunity_splits(opportunity_id);
CREATE INDEX idx_opp_splits_split_owner ON opportunity_splits(split_owner_user_id);
CREATE INDEX idx_opp_splits_sf_opp_id ON opportunity_splits(salesforce_opportunity_id);
