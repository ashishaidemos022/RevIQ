-- Drop old constraint first
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Consolidate roles: ae → other, manager/avp/vp → leader
UPDATE users SET role = 'other' WHERE role = 'ae';
UPDATE users SET role = 'leader' WHERE role IN ('manager', 'avp', 'vp');

-- Add new constraint with updated role values
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['other', 'commercial_ae', 'enterprise_ae', 'pbm', 'leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro']));
