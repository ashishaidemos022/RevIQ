-- Salesforce OpportunityPartner sync table
CREATE TABLE sf_opportunity_partners (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_partner_id       text UNIQUE NOT NULL,
  salesforce_opportunity_id   text NOT NULL,
  opportunity_id              uuid REFERENCES opportunities(id),
  partner_account_sf_id       text,
  partner_account_name        text,
  role                        text,
  is_primary                  boolean DEFAULT false,
  sf_created_date             timestamptz,
  last_synced_at              timestamptz,
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_sf_opp_partners_opp_id ON sf_opportunity_partners(salesforce_opportunity_id);
CREATE INDEX idx_sf_opp_partners_account ON sf_opportunity_partners(partner_account_sf_id);
