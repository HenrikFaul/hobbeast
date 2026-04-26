-- Fix: place_categories is jsonb in production but trigger assigned '{}'::text[]
-- This caused all events inserts to fail with "Cannot coerce the result to a single JSON object"
CREATE OR REPLACE FUNCTION public.sync_event_datetime_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if new.organizer_id is null and new.created_by is not null then
    new.organizer_id := new.created_by;
  end if;

  if new.place_categories is null then
    new.place_categories := '[]'::jsonb;
  end if;

  if new.start_time is null and new.event_date is not null and new.event_time is not null then
    new.start_time := (new.event_date::text || ' ' || new.event_time::text)::timestamp at time zone 'UTC';
  end if;

  return new;
end;
$$;

ALTER TABLE public.events
  ALTER COLUMN place_categories SET DEFAULT '[]'::jsonb;
