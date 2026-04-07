create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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
begin
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
            'Authorization', 'Bearer ' || '%s'
          ),
          body := jsonb_build_object('action', 'sync', 'reset', %L)
        ) as request_id;
      $job$,
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1),
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      p_reset
    )
  ) into job_id;

  return format('Scheduled daily sync job id: %s', job_id);
end;
$$;

create or replace function public.unschedule_daily_local_places_sync()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('sync-local-places-daily-hu');
  return 'Unscheduled sync-local-places-daily-hu';
end;
$$;

revoke all on function public.schedule_daily_local_places_sync(text, boolean) from public;
revoke all on function public.unschedule_daily_local_places_sync() from public;
grant execute on function public.schedule_daily_local_places_sync(text, boolean) to authenticated;
grant execute on function public.unschedule_daily_local_places_sync() to authenticated;
