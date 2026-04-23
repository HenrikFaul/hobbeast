-- Phase 1: Address Manager foundation (parallel to legacy local_places_sync)

create table if not exists public.raw_venues (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_venue_id text not null,
  country_code text,
  category_key text,
  name text,
  address text,
  city text,
  district text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  phone text,
  website text,
  open_now boolean,
  rating numeric,
  review_count integer,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_venue_id)
);

create index if not exists idx_raw_venues_provider_country_category
  on public.raw_venues (provider, country_code, category_key);
create index if not exists idx_raw_venues_discovered_at
  on public.raw_venues (discovered_at desc);

create table if not exists public.sync_discovery_matrix (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  country_code text not null,
  category_key text not null,
  category_label text,
  selected boolean not null default false,
  status text not null default 'pending',
  cursor jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  last_error text,
  last_run_started_at timestamptz,
  last_run_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, country_code, category_key)
);

create index if not exists idx_sync_discovery_matrix_selected
  on public.sync_discovery_matrix (selected, provider, country_code);
create index if not exists idx_sync_discovery_matrix_status
  on public.sync_discovery_matrix (status, updated_at desc);

-- Zero-limit policy: drop legacy max-results check constraints if they exist.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'app_runtime_config'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ilike '%geo_limit%'
        or pg_get_constraintdef(con.oid) ilike '%tomtom_limit%'
        or pg_get_constraintdef(con.oid) ilike '%max_results%'
        or pg_get_constraintdef(con.oid) ilike '%address_manager%'
      )
  loop
    execute format('alter table public.app_runtime_config drop constraint if exists %I', rec.conname);
  end loop;
end
$$;

-- Ensure runtime config keys for address manager exist with unrestricted defaults.
insert into public.app_runtime_config (key, provider, options)
values
  ('address_manager_limits', 'address_manager', jsonb_build_object(
    'geoapify_limit', 1000,
    'tomtom_limit', 1000,
    'radius_meters', 30000,
    'worker_chunk_size', 5,
    'max_parallel_workers', 2
  )),
  ('address_manager_crawler_state', 'address_manager', jsonb_build_object(
    'active_provider', null,
    'active_country', null,
    'active_category', null,
    'last_generated_at', null
  ))
on conflict (key)
do update set
  provider = excluded.provider,
  options = coalesce(public.app_runtime_config.options, '{}'::jsonb) || excluded.options,
  updated_at = now();
