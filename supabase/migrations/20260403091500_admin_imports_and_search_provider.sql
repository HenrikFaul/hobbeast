create extension if not exists pg_trgm with schema public;

create table if not exists public.app_runtime_config (
  key text primary key,
  provider text not null check (provider in ('aws', 'geoapify_tomtom', 'local_catalog')),
  options jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_app_runtime_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_app_runtime_config_updated_at on public.app_runtime_config;
create trigger trg_app_runtime_config_updated_at
before update on public.app_runtime_config
for each row execute function public.set_app_runtime_config_updated_at();

alter table public.app_runtime_config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_runtime_config' and policyname = 'Authenticated users can read app runtime config'
  ) then
    create policy "Authenticated users can read app runtime config"
      on public.app_runtime_config
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_runtime_config' and policyname = 'Admins can mutate app runtime config'
  ) then
    create policy "Admins can mutate app runtime config"
      on public.app_runtime_config
      for all
      to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

insert into public.app_runtime_config (key, provider, options)
values ('address_search', 'aws', '{}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.places_local_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  name text not null,
  category_group text not null default 'place',
  categories text[] not null default '{}'::text[],
  address text,
  city text,
  district text,
  postal_code text,
  country_code text not null default 'HU',
  latitude double precision,
  longitude double precision,
  open_now boolean,
  rating double precision,
  review_count integer,
  image_url text,
  phone text,
  website text,
  opening_hours_text text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create or replace function public.compute_places_local_catalog_search_text(
  p_name text,
  p_address text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_category_group text,
  p_categories text[]
)
returns text
language sql
immutable
as $$
  select lower(
    coalesce(p_name, '') || ' ' ||
    coalesce(p_address, '') || ' ' ||
    coalesce(p_city, '') || ' ' ||
    coalesce(p_district, '') || ' ' ||
    coalesce(p_postal_code, '') || ' ' ||
    coalesce(p_category_group, '') || ' ' ||
    coalesce(array_to_string(coalesce(p_categories, '{}'), ' '), '')
  );
$$;

create or replace function public.set_places_local_catalog_derived_fields()
returns trigger
language plpgsql
as $$
begin
  new.search_text := public.compute_places_local_catalog_search_text(
    new.name,
    new.address,
    new.city,
    new.district,
    new.postal_code,
    new.category_group,
    new.categories
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_places_local_catalog_derived_fields on public.places_local_catalog;
create trigger trg_places_local_catalog_derived_fields
before insert or update on public.places_local_catalog
for each row execute function public.set_places_local_catalog_derived_fields();

create index if not exists idx_places_local_catalog_search_text_trgm on public.places_local_catalog using gin (search_text gin_trgm_ops);
create index if not exists idx_places_local_catalog_category_group on public.places_local_catalog (category_group);
create index if not exists idx_places_local_catalog_city on public.places_local_catalog (city);
create index if not exists idx_places_local_catalog_coords on public.places_local_catalog (latitude, longitude);
create index if not exists idx_places_local_catalog_synced_at on public.places_local_catalog (synced_at desc);

alter table public.places_local_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'places_local_catalog' and policyname = 'Authenticated users can read local place catalog'
  ) then
    create policy "Authenticated users can read local place catalog"
      on public.places_local_catalog
      for select
      to authenticated
      using (true);
  end if;
end $$;

create table if not exists public.place_sync_state (
  key text primary key,
  status text not null default 'idle',
  rows_written integer not null default 0,
  provider_counts jsonb not null default '{}'::jsonb,
  last_run_started_at timestamptz,
  last_run_completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_place_sync_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_place_sync_state_updated_at on public.place_sync_state;
create trigger trg_place_sync_state_updated_at
before update on public.place_sync_state
for each row execute function public.set_place_sync_state_updated_at();

alter table public.place_sync_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_sync_state' and policyname = 'Authenticated users can read place sync state'
  ) then
    create policy "Authenticated users can read place sync state"
      on public.place_sync_state
      for select
      to authenticated
      using (true);
  end if;
end $$;

insert into public.place_sync_state (key, status, rows_written, provider_counts)
values ('local_places', 'idle', 0, '{}'::jsonb)
on conflict (key) do nothing;

create or replace function public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(
    sqrt(
      power(sin(radians(($3 - $1) / 2)), 2) +
      cos(radians($1)) * cos(radians($3)) * power(sin(radians(($4 - $2) / 2)), 2)
    )
  );
$$;

create or replace function public.search_local_places(
  p_query text default null,
  p_category text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_radius_km double precision default 40,
  p_limit integer default 20
)
returns table (
  provider text,
  external_id text,
  name text,
  category text,
  categories text[],
  address text,
  city text,
  district text,
  postal_code text,
  country_code text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  rating double precision,
  review_count integer,
  image_url text,
  phone text,
  website text,
  open_now boolean,
  opening_hours_text text[],
  metadata jsonb,
  synced_at timestamptz
)
language sql
stable
as $$
  with args as (
    select
      nullif(lower(trim(coalesce(p_query, ''))), '') as q,
      nullif(lower(trim(coalesce(p_category, ''))), '') as c,
      greatest(1, least(coalesce(p_limit, 20), 100)) as result_limit,
      greatest(1, least(coalesce(p_radius_km, 40), 300)) as radius_limit
  ),
  base as (
    select
      p.provider,
      p.external_id,
      p.name,
      p.category_group as category,
      p.categories,
      p.address,
      p.city,
      p.district,
      p.postal_code,
      p.country_code,
      p.latitude,
      p.longitude,
      case
        when p_lat is not null and p_lon is not null and p.latitude is not null and p.longitude is not null
          then public.haversine_km(p_lat, p_lon, p.latitude, p.longitude)
        else null
      end as distance_km,
      p.rating,
      p.review_count,
      p.image_url,
      p.phone,
      p.website,
      p.open_now,
      p.opening_hours_text,
      p.metadata,
      p.synced_at,
      p.search_text,
      case
        when (select q from args) is null then 0
        when p.search_text like '%' || (select q from args) || '%' then 0
        when exists (
          select 1
          from regexp_split_to_table((select q from args), '\s+') as token
          where token <> '' and p.search_text like '%' || token || '%'
        ) then 1
        else 2
      end as text_rank
    from public.places_local_catalog p
    where p.country_code = 'HU'
      and (
        (select c from args) is null
        or p.category_group = (select c from args)
        or ((select c from args) = 'venue' and p.category_group in ('venue','restaurant','cafe','bar','pub','leisure','entertainment'))
      )
      and (
        (select q from args) is null
        or p.search_text like '%' || (select q from args) || '%'
        or exists (
          select 1
          from regexp_split_to_table((select q from args), '\s+') as token
          where token <> '' and p.search_text like '%' || token || '%'
        )
      )
  )
  select
    provider,
    external_id,
    name,
    category,
    categories,
    address,
    city,
    district,
    postal_code,
    country_code,
    latitude,
    longitude,
    distance_km,
    rating,
    review_count,
    image_url,
    phone,
    website,
    open_now,
    opening_hours_text,
    metadata,
    synced_at
  from base
  where distance_km is null or distance_km <= (select radius_limit from args)
  order by text_rank asc, distance_km asc nulls last, rating desc nulls last, synced_at desc
  limit (select result_limit from args);
$$;

grant execute on function public.search_local_places(text, text, double precision, double precision, double precision, integer) to authenticated;
