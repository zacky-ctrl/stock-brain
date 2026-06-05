-- user_roles: maps authenticated user emails to application roles.
-- Keyed by email because the middleware checks auth.users.email from the JWT.
-- is_active allows revoking access without deleting the record (audit trail preserved).

CREATE TABLE IF NOT EXISTS user_roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_roles_email_unique UNIQUE (email)
);

-- Allow service role to read/write (anon and authenticated are blocked by RLS with no policies)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
