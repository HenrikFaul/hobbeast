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

-- ---------------------------------------------------------------------------
-- Optional bootstrap seed for bilingual provider-category mapping.
-- Target DB: Geodata project
-- Related local Hobbeast catalog table (separate project): public.places_local_catalog
-- Usage: run AFTER the DDL above, then maintain with upserts / admin review.
-- ---------------------------------------------------------------------------

insert into public.provider_category_mapper (
  provider,
  source_table,
  provider_category_key,
  provider_category_en,
  provider_category_hu,
  hobbeast_category_slug,
  hobbeast_category_path_hu,
  hobbeast_category_path_en,
  confidence,
  mapping_source,
  notes
)
values
  ('geoapify', 'public.unified_pois', 'catering.restaurant', 'Catering > Restaurant', 'Vendeglatas > Etterem', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9600, 'bootstrap_seed_v1', 'Core gastro mapping for HU/EN typing and suggestion.'),
  ('geoapify', 'public.unified_pois', 'catering.cafe', 'Catering > Cafe', 'Vendeglatas > Kavezo', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9600, 'bootstrap_seed_v1', 'Cafe / coffee search bridge.'),
  ('geoapify', 'public.unified_pois', 'catering.pub', 'Catering > Pub', 'Vendeglatas > Pub', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.8900, 'bootstrap_seed_v1', 'Board-game meetup fallback to pub/cafe venues.'),
  ('geoapify', 'public.unified_pois', 'catering.bar', 'Catering > Bar', 'Vendeglatas > Bar', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.8600, 'bootstrap_seed_v1', 'Board-game meetup fallback to bar venues.'),
  ('geoapify', 'public.unified_pois', 'entertainment', 'Entertainment', 'Szorakozas', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.8200, 'bootstrap_seed_v1', 'Entertainment venue fallback for social game queries.'),
  ('geoapify', 'public.unified_pois', 'leisure', 'Leisure', 'Szabadido', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.7800, 'bootstrap_seed_v1', 'General leisure fallback.'),
  ('geoapify', 'public.unified_pois', 'sport.fitness', 'Sport > Fitness', 'Sport > Fitnesz', 'sports-fitness', 'Sport › Fitnesz', 'Sport > Fitness', 0.9600, 'bootstrap_seed_v1', 'Fitness related search bridge.'),
  ('geoapify', 'public.unified_pois', 'sport.sports_centre', 'Sport > Sports Centre', 'Sport > Sportkozpont', 'sports-fitness', 'Sport › Fitnesz', 'Sport > Fitness', 0.9300, 'bootstrap_seed_v1', 'Sports centre bridge.'),
  ('geoapify', 'public.unified_pois', 'sport.stadium', 'Sport > Stadium', 'Sport > Stadion', 'sports-fitness', 'Sport › Fitnesz', 'Sport > Fitness', 0.8800, 'bootstrap_seed_v1', 'Sport venue bridge.'),
  ('geoapify', 'public.unified_pois', 'tourism.sights', 'Tourism > Sights', 'Turizmus > Latnivalok', 'social-community', 'Kozosseg › Social / Seta', 'Community > Social / Walking', 0.7600, 'bootstrap_seed_v1', 'Walking / sightseeing fallback.'),
  ('geoapify', 'public.unified_pois', 'tourism.attraction', 'Tourism > Attraction', 'Turizmus > Latnivalo', 'social-community', 'Kozosseg › Social / Seta', 'Community > Social / Walking', 0.7600, 'bootstrap_seed_v1', 'Sightseeing fallback.'),
  ('geoapify', 'public.unified_pois', 'building.commercial.catering', 'Building > Commercial > Catering', 'Epulet > Kereskedelmi > Vendeglatas', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9000, 'bootstrap_seed_v1', 'Commercial food venue bridge.'),
  ('geoapify', 'public.unified_pois', 'community.club', 'Community > Club', 'Kozossegi > Klub', 'social-community', 'Kozosseg › Klub', 'Community > Club', 0.8400, 'bootstrap_seed_v1', 'Community club fallback.'),
  ('tomtom', 'public.unified_pois', 'restaurant', 'Restaurant', 'Etterem', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9600, 'bootstrap_seed_v1', 'TomTom restaurant bridge.'),
  ('tomtom', 'public.unified_pois', 'cafe', 'Cafe', 'Kavezo', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9600, 'bootstrap_seed_v1', 'TomTom cafe bridge.'),
  ('tomtom', 'public.unified_pois', 'pub', 'Pub', 'Pub', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.9000, 'bootstrap_seed_v1', 'TomTom pub fallback for board-game searches.'),
  ('tomtom', 'public.unified_pois', 'bar', 'Bar', 'Bar', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.8600, 'bootstrap_seed_v1', 'TomTom bar fallback for board-game searches.'),
  ('osm', 'public.unified_pois', 'amenity=cafe', 'Amenity = Cafe', 'Amenity = Kavezo', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9400, 'bootstrap_seed_v1', 'OSM amenity bridge.'),
  ('osm', 'public.unified_pois', 'amenity=restaurant', 'Amenity = Restaurant', 'Amenity = Etterem', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9400, 'bootstrap_seed_v1', 'OSM amenity bridge.'),
  ('local', 'public.local_pois', 'board_game_cafe', 'Board Game Cafe', 'Tarsasjatek kavezo', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.9800, 'bootstrap_seed_v1', 'Local curated venue type.'),
  ('local', 'public.local_pois', 'board_game_pub', 'Board Game Pub', 'Tarsasjatekos pub', 'games-gaming/board-games/board-games', 'Jatek & Gaming › Tarsasjatekok › Tarsasjatek', 'Games & Gaming > Board Games > Board Games', 0.9800, 'bootstrap_seed_v1', 'Local curated venue type.'),
  ('local', 'public.local_pois', 'cafe', 'Cafe', 'Kavezo', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9400, 'bootstrap_seed_v1', 'Local curated venue type.'),
  ('local', 'public.local_pois', 'restaurant', 'Restaurant', 'Etterem', 'gastronomy', 'Gasztronomia › Etterem / Kavezo / Bar', 'Gastronomy > Restaurant / Cafe / Bar', 0.9400, 'bootstrap_seed_v1', 'Local curated venue type.')
on conflict (provider, source_table, provider_category_key)
do update set
  provider_category_en = excluded.provider_category_en,
  provider_category_hu = excluded.provider_category_hu,
  hobbeast_category_slug = excluded.hobbeast_category_slug,
  hobbeast_category_path_hu = excluded.hobbeast_category_path_hu,
  hobbeast_category_path_en = excluded.hobbeast_category_path_en,
  confidence = excluded.confidence,
  mapping_source = excluded.mapping_source,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();
