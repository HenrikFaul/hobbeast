-- Create places_cache table for venue/place API response caching
CREATE TABLE IF NOT EXISTS public.places_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL,
  provider text NOT NULL,
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;

notify pgrst, 'reload schema';
