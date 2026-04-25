-- Address Manager: provider fetch hardening + bulk crawling tunables.
-- Append-only follow-up to:
--   20260423110000_address_manager_phase1.sql
--   20260423153000_edge_function_connectivity_hardening.sql
--   20260423193000_address_manager_parallel_rebuild.sql
--
-- Goals:
--   1) Make raw_venues / sync_discovery_matrix accept any volume (no clamping).
--   2) Re-publish app_runtime_config defaults so the worker has its time-budget
--      and per-tile page caps available even on cold projects.
--   3) Add narrow indexes that materially speed up the admin UI.
--   4) Force PostgREST to reload schema so the new tables are visible to the
--      embedded REST client used by the edge functions.

create extension if not exists pgcrypto;

-- 1) Belt-and-braces: ensure tables exist (no-op if already created).
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

-- 2) Indexes that the admin UI actually filters on.
create index if not exists idx_raw_venues_provider_country_category
  on public.raw_venues (provider, country_code, category_key);
create index if not exists idx_raw_venues_discovered_at
  on public.raw_venues (discovered_at desc);
create index if not exists idx_raw_venues_country_only
  on public.raw_venues (country_code);
create index if not exists idx_raw_venues_category_only
  on public.raw_venues (category_key);

create index if not exists idx_sync_discovery_matrix_selected
  on public.sync_discovery_matrix (selected, provider, country_code);
create index if not exists idx_sync_discovery_matrix_status
  on public.sync_discovery_matrix (status, updated_at desc);
create index if not exists idx_sync_discovery_matrix_started_at
  on public.sync_discovery_matrix (status, last_run_started_at);

-- 3) Drop ANY check constraint on app_runtime_config that might clamp options.
do $$
declare
  c record;
  def text;
begin
  for c in
    select conname, oid
    from pg_constraint
    where conrelid = 'public.app_runtime_config'::regclass
      and contype = 'c'
  loop
    def := pg_get_constraintdef(c.oid);
    if c.conname <> 'app_runtime_config_provider_check'
       and (
         def ilike '%options%'
         or def ilike '%geo_limit%'
         or def ilike '%tomtom_limit%'
         or def ilike '%max_results%'
         or def ilike '%address_manager%'
       )
    then
      execute format('alter table public.app_runtime_config drop constraint if exists %I', c.conname);
    end if;
  end loop;
end
$$;

-- 4) Make sure provider='address_manager' is allowed (re-add provider check).
do $$
begin
  execute 'alter table public.app_runtime_config drop constraint if exists app_runtime_config_provider_check';
exception when others then null;
end
$$;
alter table public.app_runtime_config
  add constraint app_runtime_config_provider_check
  check (provider in ('aws', 'geoapify_tomtom', 'local_catalog', 'supabase', 'address_manager'));

-- 5) Re-publish runtime config defaults (merge — don't overwrite existing).
insert into public.app_runtime_config (key, provider, options)
values (
  'address_manager_limits',
  'address_manager',
  jsonb_build_object(
    'geoapify_limit', 1000,
    'tomtom_limit', 1000,
    'radius_meters', 30000,
    'worker_chunk_size', 5,
    'max_parallel_workers', 2,
    'worker_time_budget_ms', 35000,
    'worker_max_pages_per_tile', 20
  )
)
on conflict (key) do update
set options = coalesce(public.app_runtime_config.options, '{}'::jsonb) ||
              jsonb_build_object(
                'worker_time_budget_ms',
                  coalesce(public.app_runtime_config.options ->> 'worker_time_budget_ms', '35000')::int,
                'worker_max_pages_per_tile',
                  coalesce(public.app_runtime_config.options ->> 'worker_max_pages_per_tile', '20')::int
              ),
    updated_at = now();

-- 6) Make sure crawler state row exists.
insert into public.app_runtime_config (key, provider, options)
values (
  'address_manager_crawler_state',
  'address_manager',
  jsonb_build_object(
    'active_provider', null,
    'active_country', null,
    'active_category', null,
    'last_generated_at', null
  )
)
on conflict (key) do nothing;

-- 7) Internal edge URL for service-role internal calls.
insert into public.app_runtime_config (key, provider, options)
values (
  'internal_edge_function_base_url',
  'supabase',
  jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co')
)
on conflict (key) do update
set provider = excluded.provider,
    options = jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co'),
    updated_at = now();

-- 8) RLS — the edge functions use service-role so RLS doesn't block them, but
--    enabling RLS on these tables prevents accidental anonymous reads via
--    PostgREST. No public policies = locked down.
alter table public.raw_venues enable row level security;
alter table public.sync_discovery_matrix enable row level security;

-- 9) Force PostgREST to see the new tables.
notify pgrst, 'reload schema';
