-- Hobbeast local places scheduler + UI-configurable batch settings
-- Makes local catalog sync configurable from the admin UI and adds enqueue/scheduler RPCs.

insert into public.app_runtime_config (key, provider, options)
values (
  'local_places_sync',
  'local_catalog',
  jsonb_build_object(
    'enabled', false,
    'interval_minutes', 15,
    'task_batch_size', 2,
    'provider_concurrency', 2,
    'radius_meters', 16000,
    'geo_limit', 60,
    'tomtom_limit', 50
  )
)
on conflict (key) do nothing;

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
  resolved_project_url := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
  );

  resolved_service_key := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
  );

  if resolved_project_url is null or resolved_service_key is null then
    raise exception 'Missing project_url/SUPABASE_URL or service_role_key/SUPABASE_SERVICE_ROLE_KEY in Vault';
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

create or replace function public.schedule_local_places_interval(p_minutes integer default 15)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_minutes integer;
  job_id bigint;
begin
  safe_minutes := greatest(1, least(coalesce(p_minutes, 15), 60));

  begin
    perform cron.unschedule('local-places-batch-sync');
  exception when others then
    null;
  end;

  select cron.schedule(
    'local-places-batch-sync',
    format('*/%s * * * *', safe_minutes),
    $job$
      select public.enqueue_local_places_batch(false);
    $job$
  )
  into job_id;

  update public.app_runtime_config
  set options = coalesce(options, '{}'::jsonb)
    || jsonb_build_object('enabled', true, 'interval_minutes', safe_minutes)
  where key = 'local_places_sync';

  return format('Scheduled local-places-batch-sync every %s minute(s). job_id=%s', safe_minutes, job_id);
end;
$$;

create or replace function public.unschedule_local_places_interval()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform cron.unschedule('local-places-batch-sync');
  exception when others then
    null;
  end;

  update public.app_runtime_config
  set options = coalesce(options, '{}'::jsonb)
    || jsonb_build_object('enabled', false)
  where key = 'local_places_sync';

  return 'Unscheduled local-places-batch-sync';
end;
$$;

grant execute on function public.enqueue_local_places_batch(boolean) to authenticated;
grant execute on function public.schedule_local_places_interval(integer) to authenticated;
grant execute on function public.unschedule_local_places_interval() to authenticated;

notify pgrst, 'reload schema';
