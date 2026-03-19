-- Add channel_owner_sf_id to opportunities (Channel_Manager__c from Salesforce)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS channel_owner_sf_id text;
