CREATE TABLE IF NOT EXISTS app_users (
  auth_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin', 'owner')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email = LOWER(email)),
  CHECK (LENGTH(BTRIM(first_name)) BETWEEN 2 AND 80),
  CHECK (LENGTH(BTRIM(last_name)) BETWEEN 2 AND 80),
  CHECK (email ~ '^[^@]+@axamansard\.com$')
);

CREATE INDEX IF NOT EXISTS app_users_status_idx ON app_users (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS access_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('requested', 'approved', 'rejected', 'revoked', 'restored', 'role_changed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_audit_created_idx ON access_audit (created_at DESC);
