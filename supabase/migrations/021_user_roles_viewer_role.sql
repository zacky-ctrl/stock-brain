-- Add read-only viewer role for reports-only access.

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'manager', 'stock_operator', 'accountant', 'viewer'));
