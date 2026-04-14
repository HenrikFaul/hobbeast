-- Fix: app_runtime_config.provider check constraint is too narrow.
-- The migration 20260409083000 tried to insert provider='supabase' for the internal
-- edge URL record but the check only allowed ('aws','geoapify_tomtom','local_catalog').
-- This migration widens the constraint to also allow 'supabase', then inserts/updates
-- the record so the edge URL resolver works correctly.

alter table public.app_runtime_config
  drop constraint if exists app_runtime_config_provider_check;

alter table public.app_runtime_config
  add constraint app_runtime_config_provider_check
  check (provider in ('aws', 'geoapify_tomtom', 'local_catalog', 'supabase'));

insert into public.app_runtime_config (key, provider, options)
values (
  'internal_edge_function_base_url',
  'supabase',
  jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co')
)
on conflict (key) do update
  set provider = excluded.provider,
      options  = excluded.options;

-- Re-create helper functions in case the previous migration was rolled back
create or replace function public.resolve_internal_edge_function_base_url()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select nullif(trim(options ->> 'url'), '')
      from public.app_runtime_config
      where key = 'internal_edge_function_base_url'
      limit 1
    ),
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'project_url' limit 1),
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
  );
$$;

create or replace function public.resolve_internal_service_role_key()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'service_role_key' limit 1),
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
  );
$$;

-- Re-create enqueue function to use the helper resolvers
create or replace function public.enqueue_local_places_batch(p_reset boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_url text;
  resolved_service_key text;
  req_id bigint;
begin
  resolved_project_url := public.resolve_internal_edge_function_base_url();
  resolved_service_key := public.resolve_internal_service_role_key();

  if resolved_project_url is null or resolved_service_key is null then
    raise exception 'Missing internal edge base URL or service role key';
  end if;

  select net.http_post(
    url     := rtrim(resolved_project_url, '/') || '/functions/v1/sync-local-places',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || trim(resolved_service_key),
      'apikey',         trim(resolved_service_key)
    ),
    body    := jsonb_build_object(
      'action', 'enqueue',
      'reset',  p_reset
    )
  )
  into req_id;

  return req_id;
end;
$$;

revoke all on function public.resolve_internal_edge_function_base_url() from public;
revoke all on function public.resolve_internal_service_role_key() from public;
grant execute on function public.resolve_internal_edge_function_base_url() to authenticated;
grant execute on function public.resolve_internal_service_role_key() to authenticated;
grant execute on function public.enqueue_local_places_batch(boolean) to authenticated;

notify pgrst, 'reload schema';
