-- Add Channel Owner and Engagement fields to sf_opportunity_partners
ALTER TABLE sf_opportunity_partners
  ADD COLUMN IF NOT EXISTS channel_owner_sf_id text,
  ADD COLUMN IF NOT EXISTS engagement text;

CREATE INDEX IF NOT EXISTS idx_sf_opp_partners_channel_owner ON sf_opportunity_partners(channel_owner_sf_id);
