-- Align user_roles with the application role names used by auth and navigation.
-- Also expose pending signed-up users for the admin access page.

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

UPDATE user_roles
SET role = 'accountant'
WHERE role = 'viewer';

UPDATE user_roles
SET email = lower(email)
WHERE email <> lower(email);

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'manager', 'stock_operator', 'accountant'));

CREATE OR REPLACE FUNCTION public.get_pending_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    au.id,
    lower(au.email)::TEXT AS email,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.user_roles ur
    ON ur.email = lower(au.email)
   AND ur.is_active = true
  WHERE au.email IS NOT NULL
    AND ur.id IS NULL
  ORDER BY au.created_at DESC;
$$;
