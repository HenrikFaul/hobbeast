
CREATE TABLE IF NOT EXISTS public.external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source text NOT NULL,
  external_id text NOT NULL,
  external_url text,
  title text NOT NULL,
  category text,
  subcategory text,
  tags text[] DEFAULT '{}'::text[],
  description text,
  event_date date,
  event_time time without time zone,
  location_type text,
  location_city text,
  location_address text,
  location_free_text text,
  location_lat double precision,
  location_lon double precision,
  price_min numeric,
  price_max numeric,
  currency text,
  is_free boolean,
  max_attendees integer,
  image_url text,
  organizer_name text,
  source_payload jsonb DEFAULT '{}'::jsonb,
  source_last_synced_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id)
);

ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External events readable by all" ON public.external_events
  FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage external events" ON public.external_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
