
-- places_local_catalog: deduplicated venues fetched from external providers
CREATE TABLE IF NOT EXISTS public.places_local_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  category_group text,
  categories text[] DEFAULT '{}'::text[],
  address text,
  city text,
  district text,
  postal_code text,
  country_code text,
  latitude double precision,
  longitude double precision,
  open_now boolean,
  rating double precision,
  review_count integer,
  image_url text,
  phone text,
  website text,
  opening_hours_text text[] DEFAULT '{}'::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT places_local_catalog_provider_external_id_key UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_places_local_catalog_city ON public.places_local_catalog (city);
CREATE INDEX IF NOT EXISTS idx_places_local_catalog_category_group ON public.places_local_catalog (category_group);
CREATE INDEX IF NOT EXISTS idx_places_local_catalog_synced_at ON public.places_local_catalog (synced_at DESC);

ALTER TABLE public.places_local_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read local catalog"
  ON public.places_local_catalog FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages local catalog"
  ON public.places_local_catalog FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- place_sync_state: single-row sync state tracker (keyed)
CREATE TABLE IF NOT EXISTS public.place_sync_state (
  key text NOT NULL PRIMARY KEY,
  status text,
  rows_written integer DEFAULT 0,
  provider_counts jsonb DEFAULT '{}'::jsonb,
  task_count integer,
  cursor integer DEFAULT 0,
  last_run_started_at timestamptz,
  last_run_completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.place_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sync state"
  ON public.place_sync_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages sync state"
  ON public.place_sync_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- place_sync_logs: append-only milestone log
CREATE TABLE IF NOT EXISTS public.place_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  run_id text
);

CREATE INDEX IF NOT EXISTS idx_place_sync_logs_created_at ON public.place_sync_logs (created_at DESC);

ALTER TABLE public.place_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sync logs"
  ON public.place_sync_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role writes sync logs"
  ON public.place_sync_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Trigger to keep updated_at fresh
CREATE TRIGGER trg_places_local_catalog_updated_at
  BEFORE UPDATE ON public.places_local_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_place_sync_state_updated_at
  BEFORE UPDATE ON public.place_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
