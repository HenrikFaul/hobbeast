-- Local verification bootstrap: minimal Supabase platform surface.
--
-- Used only by `scripts/verify-database.mjs --mode=fresh`. In restore mode the
-- production dump carries the real auth/storage schemas, so this file must
-- stay idempotent and skip anything that already exists.
--
-- Only the objects the repository migrations actually reference are created:
--   auth.users, auth.uid(), auth.role(), auth.jwt()
--   storage.buckets, storage.objects, storage.foldername()
--   the supabase_realtime publication
--   extensions schema + pgcrypto/uuid-ossp/pg_trgm (real) and
--   pg_net/pg_cron/supabase_vault (verification stubs)

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- GoTrue-owned table; the repository migrations only reference id, email and
-- raw_user_meta_data, but the common GoTrue columns are included so future
-- migrations that read them keep replaying.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean NOT NULL DEFAULT false
);

ALTER TABLE auth.users OWNER TO supabase_auth_admin;
GRANT ALL ON TABLE auth.users TO postgres;

-- The standard hosted implementations read the request claims that RLS
-- fixtures set with set_config('request.jwt.claim.sub', ...).
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- The FK integrity queries against auth.users execute as the table's owner
-- (supabase_auth_admin), so the owner needs schema USAGE too.
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;
GRANT SELECT ON TABLE auth.users TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON TABLE storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON TABLE storage.objects TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

-- Hosted Supabase grants the API roles blanket privileges on everything created
-- in `public` (RLS is the row boundary, not table grants) via default
-- privileges. The repository migrations rely on that: they REVOKE selectively
-- (column allowlists, RPC-only tables) instead of GRANTing. Reproduce it here,
-- otherwise a fresh-chain replay ends with no grants at all and every fixture
-- fails on table privilege instead of exercising RLS.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
