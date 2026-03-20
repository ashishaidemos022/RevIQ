-- Salesforce Partner__c custom object sync table
-- Stores partner records linked to opportunities, including Channel Owner for PBM credit
CREATE TABLE sf_partners (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_partner_id     text UNIQUE NOT NULL,
  name                      text,
  salesforce_opportunity_id text,
  opportunity_id            uuid REFERENCES opportunities(id),
  channel_owner_sf_id       text,
  rv_account_sf_id          text,
  engagement                text,
  is_primary                boolean DEFAULT false,
  partner_account_type      text,
  master_agent              text,
  partner_program           text,
  source_split              numeric(5,2),
  influencer_split          numeric(5,2),
  fulfillment_split         numeric(5,2),
  opportunity_close_date    date,
  opportunity_total_acv     numeric(18,2),
  rv_partner_type           text,
  last_synced_at            timestamptz,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_sf_partners_opp_id ON sf_partners(salesforce_opportunity_id);
CREATE INDEX idx_sf_partners_channel_owner ON sf_partners(channel_owner_sf_id);
CREATE INDEX idx_sf_partners_rv_account ON sf_partners(rv_account_sf_id);
