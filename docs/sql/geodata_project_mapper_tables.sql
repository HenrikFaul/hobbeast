-- Geodata project DDL proposal
-- Target project: Geodata Supabase (buuoyyfzincmbxafvihc)
-- Purpose:
--   1) persist provider-category -> Hobbeast catalog mappings
--   2) persist AWS -> local address row matches for merger/review workflows
--
-- NOTE: this file is intentionally separate from the Hobbeast migrations because
-- the target database is the Geodata project, not the Hobbeast project.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table if not exists public.provider_category_mapper (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_table text not null,
  provider_category_key text not null,
  provider_category_en text not null,
  provider_category_hu text,
  hobbeast_category_slug text,
  hobbeast_category_path_hu text,
  hobbeast_category_path_en text,
  confidence numeric(5,4) not null default 0,
  mapping_source text not null default 'manual',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_table, provider_category_key)
);

create index if not exists idx_provider_category_mapper_lookup
  on public.provider_category_mapper (provider, source_table, provider_category_key);

create index if not exists idx_provider_category_mapper_slug
  on public.provider_category_mapper (hobbeast_category_slug);

create table if not exists public.aws_local_address_mapper (
  id uuid primary key default gen_random_uuid(),
  aws_place_id text not null,
  aws_label text,
  aws_full_address text,
  aws_city text,
  aws_postal_code text,
  aws_country text,
  aws_lat double precision,
  aws_lon double precision,
  aws_payload jsonb,
  local_table text not null default 'public.unified_pois',
  local_row_id text,
  local_name text,
  local_formatted_address text,
  local_city text,
  local_lat double precision,
  local_lon double precision,
  local_payload jsonb,
  match_status text not null default 'candidate' check (match_status in ('candidate', 'matched', 'rejected', 'needs_review')),
  matcher_version text not null default 'v1',
  matched_by text not null default 'system',
  name_similarity numeric(5,4),
  address_similarity numeric(5,4),
  city_similarity numeric(5,4),
  distance_meters numeric(12,2),
  composite_score numeric(5,4),
  reviewer_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aws_place_id, local_table, local_row_id)
);

create index if not exists idx_aws_local_address_mapper_status
  on public.aws_local_address_mapper (match_status, composite_score desc nulls last);

create index if not exists idx_aws_local_address_mapper_aws_place
  on public.aws_local_address_mapper (aws_place_id);

create index if not exists idx_aws_local_address_mapper_local_row
  on public.aws_local_address_mapper (local_table, local_row_id);

create index if not exists idx_aws_local_address_mapper_name_trgm
  on public.aws_local_address_mapper using gin (coalesce(local_name, '') gin_trgm_ops);

create index if not exists idx_aws_local_address_mapper_address_trgm
  on public.aws_local_address_mapper using gin (coalesce(local_formatted_address, '') gin_trgm_ops);

create or replace function public.touch_mapper_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_provider_category_mapper_updated_at
before update on public.provider_category_mapper
for each row execute function public.touch_mapper_updated_at();

create trigger trg_aws_local_address_mapper_updated_at
before update on public.aws_local_address_mapper
for each row execute function public.touch_mapper_updated_at();
