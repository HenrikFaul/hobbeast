
CREATE TABLE IF NOT EXISTS public.venue_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'HU',
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  phone text,
  website text,
  rating double precision,
  image_url text,
  opening_hours_text text[],
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS venue_cache_tags_gin ON public.venue_cache USING gin (tags);
CREATE INDEX IF NOT EXISTS venue_cache_city_idx ON public.venue_cache (city);
CREATE INDEX IF NOT EXISTS venue_cache_category_idx ON public.venue_cache (category);

ALTER TABLE public.venue_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read venue cache" ON public.venue_cache FOR SELECT TO public USING (true);
CREATE POLICY "Service role can manage venue cache" ON public.venue_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
