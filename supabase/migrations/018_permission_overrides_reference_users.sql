ALTER TABLE permission_overrides ADD COLUMN IF NOT EXISTS reference_user_ids uuid[] DEFAULT '{}';
ALTER TABLE permission_overrides ALTER COLUMN effective_role DROP NOT NULL;
ALTER TABLE permission_overrides DROP CONSTRAINT IF EXISTS permission_overrides_effective_role_check;
