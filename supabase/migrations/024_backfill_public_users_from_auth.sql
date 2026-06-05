-- Backfill public.users from Supabase Auth so audit actor UUIDs can
-- consistently resolve to email addresses.

INSERT INTO public.users (id, name, email, role, is_active, created_at, updated_at)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  lower(au.email),
  'operator',
  true,
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  updated_at = now();
