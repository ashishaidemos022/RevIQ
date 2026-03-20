-- Remove Phase 3 partner stub tables and FK
-- These are unused — real partner data lives in sf_opportunity_partners and rv_accounts

-- Drop the FK on opportunities first
ALTER TABLE opportunities DROP COLUMN IF EXISTS partner_id;

-- Drop stub tables
DROP TABLE IF EXISTS opportunity_partners;
DROP TABLE IF EXISTS partners;
