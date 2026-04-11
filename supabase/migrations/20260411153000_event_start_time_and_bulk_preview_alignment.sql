begin;

alter table public.events
  add column if not exists start_time timestamp with time zone;

alter table public.events
  add column if not exists end_time timestamp with time zone;

alter table public.events
  add column if not exists organizer_id uuid;

alter table public.events
  alter column place_categories set default '{}'::text[];

update public.events
set place_categories = '{}'::text[]
where place_categories is null;

update public.events
set organizer_id = created_by
where organizer_id is null
  and created_by is not null;

update public.events
set start_time = (event_date::text || ' ' || event_time::text)::timestamp at time zone 'UTC'
where start_time is null
  and event_date is not null
  and event_time is not null;

create or replace function public.sync_event_datetime_compat()
returns trigger
language plpgsql
as $$
begin
  if new.organizer_id is null and new.created_by is not null then
    new.organizer_id := new.created_by;
  end if;

  if new.place_categories is null then
    new.place_categories := '{}'::text[];
  end if;

  if new.start_time is null and new.event_date is not null and new.event_time is not null then
    new.start_time := (new.event_date::text || ' ' || new.event_time::text)::timestamp at time zone 'UTC';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_event_datetime_compat on public.events;

create trigger trg_sync_event_datetime_compat
before insert or update on public.events
for each row
execute function public.sync_event_datetime_compat();

commit;
