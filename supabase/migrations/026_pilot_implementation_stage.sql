-- Add pilot implementation stage tracking.
-- Values: not_started | discovery | configuration | uat | production
-- This tracks the PS implementation lifecycle, separate from the SF sales stage.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pilot_implementation_stage text;
