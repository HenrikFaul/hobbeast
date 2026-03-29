alter table public.events
  add column if not exists place_source text,
  add column if not exists place_source_ids jsonb,
  add column if not exists place_name text,
  add column if not exists place_categories text[],
  add column if not exists place_category_confidence numeric,
  add column if not exists place_address text,
  add column if not exists place_city text,
  add column if not exists place_postcode text,
  add column if not exists place_country text,
  add column if not exists place_lat double precision,
  add column if not exists place_lon double precision,
  add column if not exists place_distance_m integer,
  add column if not exists place_diagnostics jsonb,
  add column if not exists place_details jsonb;

create table if not exists public.places_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  query_text text not null,
  response_payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_places_cache_expires_at on public.places_cache(expires_at);

create table if not exists public.trip_planning_audits (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  caller_type text not null,
  caller_id uuid null,
  event_id uuid null references public.events(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null,
  route_type text null,
  provider text not null default 'mapy',
  request_summary jsonb not null default '{}'::jsonb,
  chosen_alternative_id text null,
  warnings jsonb null,
  error_code text null,
  correlation_id text null,
  created_at timestamptz not null default now()
);

alter table public.places_cache enable row level security;
alter table public.trip_planning_audits enable row level security;

create policy if not exists "Authenticated users can read places cache" on public.places_cache
for select to authenticated using (true);

create policy if not exists "Service role can manage places cache" on public.places_cache
for all to service_role using (true) with check (true);

create policy if not exists "Authenticated users can read own event audits" on public.trip_planning_audits
for select to authenticated using (
  event_id is null or exists (
    select 1 from public.events e where e.id = trip_planning_audits.event_id and e.created_by = auth.uid()
  )
);

create policy if not exists "Service role can manage trip planning audits" on public.trip_planning_audits
for all to service_role using (true) with check (true);
