-- Local verification bootstrap: Supabase platform roles.
--
-- The hosted Supabase platform provisions these roles before any project
-- migration runs. A vanilla PostgreSQL cluster has none of them, so a dump
-- restore or migration replay would fail on every GRANT/OWNER statement.
--
-- This file is used ONLY by scripts/verify-database.mjs against a disposable
-- local cluster. It is never applied to a hosted project.

do $$
declare
  role_name text;
begin
  foreach role_name in array array[
    'anon',
    'authenticated',
    'service_role',
    'authenticator',
    'dashboard_user',
    'pgbouncer',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_realtime_admin',
    'supabase_functions_admin',
    'supabase_read_only_user',
    'supabase_replication_admin',
    'pgsodium_keyholder',
    'pgsodium_keyiduser',
    'pgsodium_keymaker'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin noinherit', role_name);
    end if;
  end loop;
end $$;

-- Platform-owned roles must be able to own the objects the dump restores.
alter role supabase_admin with superuser createrole createdb replication bypassrls;
alter role supabase_auth_admin with createrole;
alter role supabase_storage_admin with createrole;
alter role supabase_realtime_admin with createrole;
alter role authenticator with login noinherit;

grant anon to authenticator;
grant authenticated to authenticator;
grant service_role to authenticator;
