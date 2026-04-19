-- Add columns that exist in production on the events table but were not tracked in migrations
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visibility_type text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS participation_type text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS place_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS place_address text,
  ADD COLUMN IF NOT EXISTS place_city text,
  ADD COLUMN IF NOT EXISTS place_country text,
  ADD COLUMN IF NOT EXISTS place_postcode text,
  ADD COLUMN IF NOT EXISTS place_lat double precision,
  ADD COLUMN IF NOT EXISTS place_lon double precision,
  ADD COLUMN IF NOT EXISTS place_distance_m double precision,
  ADD COLUMN IF NOT EXISTS place_source text,
  ADD COLUMN IF NOT EXISTS place_source_ids jsonb,
  ADD COLUMN IF NOT EXISTS place_details jsonb,
  ADD COLUMN IF NOT EXISTS place_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS place_category_confidence double precision;
