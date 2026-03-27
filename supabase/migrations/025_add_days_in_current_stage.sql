-- Add days_in_current_stage column from Salesforce formula field
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS days_in_current_stage integer;
