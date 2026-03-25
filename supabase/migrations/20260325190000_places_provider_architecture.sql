ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS place_name TEXT,
  ADD COLUMN IF NOT EXISTS place_source TEXT CHECK (place_source IN ('geoapify', 'tomtom', 'merged')),
  ADD COLUMN IF NOT EXISTS place_source_ids JSONB,
  ADD COLUMN IF NOT EXISTS place_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS place_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS place_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS place_details JSONB,
  ADD COLUMN IF NOT EXISTS place_diagnostics JSONB;
