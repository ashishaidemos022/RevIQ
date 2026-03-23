-- Consolidate roles: ae → other, manager/avp/vp → leader
UPDATE users SET role = 'other' WHERE role = 'ae';
UPDATE users SET role = 'leader' WHERE role IN ('manager', 'avp', 'vp');
