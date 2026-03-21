create table if not exists public.external_events (
  id uuid primary key default gen_random_uuid(),
  external_source text not null check (external_source in ('ticketmaster', 'universe', 'tickettailor', 'seatgeek')),
  external_id text not null,
  external_url text,
  title text not null,
  category text,
  subcategory text,
  tags text[] not null default '{}'::text[],
  description text,
  event_date date,
  event_time time,
  location_type text not null default 'address',
  location_city text,
  location_address text,
  location_free_text text,
  location_lat double precision,
  location_lon double precision,
  price_min numeric,
  price_max numeric,
  currency text,
  is_free boolean,
  max_attendees integer,
  image_url text,
  organizer_name text,
  source_payload jsonb not null default '{}'::jsonb,
  source_last_synced_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_events_source_id_uniq
  on public.external_events (external_source, external_id);

create index if not exists external_events_date_idx
  on public.external_events (event_date);

create index if not exists external_events_city_idx
  on public.external_events (location_city);

create index if not exists external_events_source_idx
  on public.external_events (external_source);

alter table public.external_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'external_events'
      and policyname = 'External events are viewable by everyone'
  ) then
    create policy "External events are viewable by everyone"
      on public.external_events
      for select
      using (is_active = true);
  end if;
end $$;
