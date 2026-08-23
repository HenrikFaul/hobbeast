-- pg_cron verification stub.
--
-- Records scheduled jobs so migration replay and dump restore can be verified
-- without a background worker. Nothing is ever executed. Object names and
-- signatures match the hosted pg_cron surface that the production dump grants
-- privileges on, so a restore does not have to skip those ACL entries.

create schema if not exists cron;

create sequence cron.jobid_seq;
create sequence cron.runid_seq;

create table cron.job (
  jobid bigint primary key default nextval('cron.jobid_seq'),
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text
);

create unique index job_jobname_username_uniq on cron.job (jobname, username);

create table cron.job_run_details (
  jobid bigint,
  runid bigint primary key default nextval('cron.runid_seq'),
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);

create function cron.schedule(job_name text, schedule text, command text)
returns bigint
language plpgsql
as $fn$
declare
  new_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname, username) do update
    set schedule = excluded.schedule,
        command = excluded.command,
        active = true
  returning jobid into new_id;
  return new_id;
end;
$fn$;

create function cron.schedule(schedule text, command text)
returns bigint
language sql
as $fn$ select cron.schedule('job-' || md5(schedule || command), schedule, command); $fn$;

create function cron.schedule_in_database(
  job_name text,
  schedule text,
  command text,
  database text,
  username text default null,
  active boolean default true
) returns bigint
language plpgsql
as $fn$
declare
  new_id bigint;
begin
  insert into cron.job (jobname, schedule, command, database, username, active)
  values (
    job_name,
    schedule,
    command,
    coalesce(schedule_in_database.database, current_database()),
    coalesce(schedule_in_database.username, current_user),
    schedule_in_database.active
  )
  on conflict (jobname, username) do update
    set schedule = excluded.schedule,
        command = excluded.command,
        active = excluded.active
  returning jobid into new_id;
  return new_id;
end;
$fn$;

create function cron.alter_job(
  job_id bigint,
  schedule text default null,
  command text default null,
  database text default null,
  username text default null,
  active boolean default null
) returns void
language plpgsql
as $fn$
begin
  update cron.job
     set schedule = coalesce(alter_job.schedule, cron.job.schedule),
         command = coalesce(alter_job.command, cron.job.command),
         database = coalesce(alter_job.database, cron.job.database),
         username = coalesce(alter_job.username, cron.job.username),
         active = coalesce(alter_job.active, cron.job.active)
   where jobid = job_id;
end;
$fn$;

create function cron.unschedule(job_name text)
returns boolean
language plpgsql
as $fn$
begin
  delete from cron.job where jobname = job_name;
  return found;
end;
$fn$;

create function cron.unschedule(job_id bigint)
returns boolean
language plpgsql
as $fn$
begin
  delete from cron.job where jobid = job_id;
  return found;
end;
$fn$;

create function cron.job_cache_invalidate()
returns trigger
language plpgsql
as $fn$
begin
  return null;
end;
$fn$;
