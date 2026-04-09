-- Route local-places sync/search to the dsymdijzydaehntlmfzl Supabase project.
-- This stores the internal edge-function base URL in runtime config and makes
-- scheduler/enqueue helpers prefer that value before falling back to Vault.

insert into public.app_runtime_config (key, provider, options)
values (
  'internal_edge_function_base_url',
  'supabase',
  jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co')
)
on conflict (key) do update
set provider = excluded.provider,
    options = excluded.options;

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
    url := rtrim(resolved_project_url, '/') || '/functions/v1/sync-local-places',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(resolved_service_key),
      'apikey', trim(resolved_service_key)
    ),
    body := jsonb_build_object(
      'action', 'sync',
      'reset', p_reset
    )
  )
  into req_id;

  return req_id;
end;
$$;

create or replace function public.schedule_daily_local_places_sync(
  p_cron text default '30 2 * * *',
  p_reset boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  job_id bigint;
  resolved_project_url text;
  resolved_service_key text;
begin
  resolved_project_url := public.resolve_internal_edge_function_base_url();
  resolved_service_key := public.resolve_internal_service_role_key();

  if resolved_project_url is null or resolved_service_key is null then
    return 'Missing internal edge base URL or service role key';
  end if;

  perform cron.unschedule('sync-local-places-daily-hu');

  select cron.schedule(
    'sync-local-places-daily-hu',
    p_cron,
    format(
      $job$
      select
        net.http_post(
          url := '%s/functions/v1/sync-local-places',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || '%s',
            'apikey', '%s'
          ),
          body := jsonb_build_object('action', 'sync', 'reset', %L)
        ) as request_id;
      $job$,
      resolved_project_url,
      resolved_service_key,
      resolved_service_key,
      p_reset
    )
  ) into job_id;

  return format('Scheduled daily sync job id: %s', job_id);
end;
$$;

revoke all on function public.resolve_internal_edge_function_base_url() from public;
revoke all on function public.resolve_internal_service_role_key() from public;
grant execute on function public.resolve_internal_edge_function_base_url() to authenticated;
grant execute on function public.resolve_internal_service_role_key() to authenticated;

grant execute on function public.enqueue_local_places_batch(boolean) to authenticated;
grant execute on function public.schedule_daily_local_places_sync(text, boolean) to authenticated;

notify pgrst, 'reload schema';
