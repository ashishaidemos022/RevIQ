-- Drop legacy sf_opportunity_partners table
-- All 364 records are from a legacy SF org (00632 prefix) and match no current opportunities
-- Partner credit now comes from: opportunities.channel_owner_sf_id, rv_accounts, and sf_partners
DROP TABLE IF EXISTS sf_opportunity_partners;
