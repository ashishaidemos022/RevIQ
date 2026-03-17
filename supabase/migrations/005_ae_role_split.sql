-- Add commercial_ae and enterprise_ae roles to users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ae','commercial_ae','enterprise_ae','manager','avp','vp','cro','c_level','revops_ro','revops_rw','enterprise_ro'));
