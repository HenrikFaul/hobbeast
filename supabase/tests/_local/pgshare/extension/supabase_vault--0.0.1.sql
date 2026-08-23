-- supabase_vault verification stub.
--
-- Provides the vault.secrets / vault.decrypted_secrets shape that migrations
-- read when they build Edge Function callback URLs. Values are NOT encrypted.
-- This extension is only ever installed into a disposable local cluster and
-- must never hold a real credential.
--
-- The `vault` schema is created by PostgreSQL from the control file's
-- `schema = 'vault'` setting; the script must not re-create it.

create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create view vault.decrypted_secrets as
  select id,
         name,
         description,
         secret,
         secret as decrypted_secret,
         key_id,
         nonce,
         created_at,
         updated_at
  from vault.secrets;

create function vault._crypto_aead_det_decrypt(
  message bytea,
  additional bytea,
  key_id bigint,
  context bytea default 'pgsodium'::bytea,
  nonce bytea default null
) returns bytea
language sql
immutable
as $fn$ select message; $fn$;

create function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default '',
  new_key_id uuid default null
) returns uuid
language plpgsql
as $fn$
declare
  new_id uuid;
begin
  insert into vault.secrets (secret, name, description, key_id)
  values (new_secret, new_name, coalesce(new_description, ''), new_key_id)
  returning id into new_id;
  return new_id;
end;
$fn$;

create function vault.update_secret(
  secret_id uuid,
  new_secret text default null,
  new_name text default null,
  new_description text default null,
  new_key_id uuid default null
) returns void
language plpgsql
as $fn$
begin
  update vault.secrets
     set secret = coalesce(new_secret, secret),
         name = coalesce(new_name, name),
         description = coalesce(new_description, description),
         key_id = coalesce(new_key_id, key_id),
         updated_at = now()
   where id = secret_id;
end;
$fn$;
