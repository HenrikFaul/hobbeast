-- Self-service program sources.
--
-- Until now a new source could only be added by writing a migration. This makes
-- it a product surface: an operator (and, through the review queue, a provider)
-- pastes a link, the engine inspects the page and proposes an extraction recipe,
-- and the source goes live after a real trial run.
--
-- Nothing a provider submits reaches the catalogue on its own — submissions land
-- in a queue that an admin approves, which is what keeps the pipeline safe while
-- still letting providers do the typing.

-- New recipes the inspector can choose ---------------------------------------

ALTER TABLE public.external_event_feed_sources
  DROP CONSTRAINT IF EXISTS external_event_feed_sources_scrape_strategy_check;

ALTER TABLE public.external_event_feed_sources
  ADD CONSTRAINT external_event_feed_sources_scrape_strategy_check
  CHECK (scrape_strategy = ANY (ARRAY[
    'render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld'
  ]));

-- Registry writes from the admin panel ---------------------------------------

CREATE OR REPLACE FUNCTION public.admin_upsert_scraper_source(
  p_endpoint_url text,
  p_publisher_name text,
  p_strategy text DEFAULT 'render',
  p_homepage_url text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_categories text[] DEFAULT '{}',
  p_scrape_enabled boolean DEFAULT true,
  p_note text DEFAULT NULL,
  p_source_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_source_id text;
  v_host text;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_endpoint_url IS NULL OR p_endpoint_url !~ '^https?://' THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_URL' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_publisher_name, ''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_PUBLISHER_NAME' USING ERRCODE = '22023';
  END IF;
  IF p_strategy IS NULL OR p_strategy NOT IN ('render', 'rss', 'tribe', 'site', 'ics', 'wp-ics-calendar', 'jsonld') THEN
    RAISE EXCEPTION 'INVALID_STRATEGY' USING ERRCODE = '22023';
  END IF;

  v_host := public.event_feed_url_host(p_endpoint_url);
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_HOST' USING ERRCODE = '22023';
  END IF;

  -- A source is identified by its endpoint, so re-adding the same link updates
  -- the existing row instead of creating a duplicate collector.
  v_source_id := COALESCE(NULLIF(btrim(coalesce(p_source_id, '')), ''),
                          'src_' || substr(md5(lower(btrim(p_endpoint_url))), 1, 8));

  INSERT INTO public.external_event_feed_sources AS s (
    source_id, publisher_name, publisher_type, homepage_url, endpoint_url,
    original_endpoint_url, city, country_code, categories, fetch_hosts,
    review_state, legal_review_status, scrape_enabled, scrape_strategy,
    scrape_priority, scrape_note, timezone
  ) VALUES (
    v_source_id, btrim(p_publisher_name), 'venue',
    COALESCE(p_homepage_url, 'https://' || v_host), btrim(p_endpoint_url),
    btrim(p_endpoint_url), NULLIF(btrim(coalesce(p_city, '')), ''), 'HU',
    COALESCE(p_categories, '{}'), ARRAY[v_host],
    'approved', 'pending', COALESCE(p_scrape_enabled, true), p_strategy,
    150, p_note, 'Europe/Budapest'
  )
  ON CONFLICT (source_id) DO UPDATE SET
    publisher_name = EXCLUDED.publisher_name,
    homepage_url = COALESCE(EXCLUDED.homepage_url, s.homepage_url),
    endpoint_url = EXCLUDED.endpoint_url,
    city = COALESCE(EXCLUDED.city, s.city),
    categories = EXCLUDED.categories,
    fetch_hosts = EXCLUDED.fetch_hosts,
    scrape_enabled = EXCLUDED.scrape_enabled,
    scrape_strategy = EXCLUDED.scrape_strategy,
    scrape_note = COALESCE(EXCLUDED.scrape_note, s.scrape_note),
    updated_at = now();

  RETURN v_source_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_scraper_source(text, text, text, text, text, text[], boolean, text, text) TO authenticated;

-- Provider submissions -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_source_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publisher_name text NOT NULL,
  homepage_url text,
  endpoint_url text NOT NULL,
  strategy text NOT NULL DEFAULT 'render',
  city text,
  categories text[] NOT NULL DEFAULT '{}',
  note text,
  inspection jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_events integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  source_id text,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_source_submissions_name_len CHECK (char_length(btrim(publisher_name)) BETWEEN 2 AND 160),
  CONSTRAINT event_source_submissions_url_shape CHECK (endpoint_url ~ '^https?://')
);

CREATE INDEX IF NOT EXISTS event_source_submissions_status_idx
  ON public.event_source_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS event_source_submissions_owner_idx
  ON public.event_source_submissions (submitted_by, created_at DESC);

ALTER TABLE public.event_source_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_source_submissions FROM anon, authenticated;

DROP POLICY IF EXISTS "Providers read their own submissions" ON public.event_source_submissions;
CREATE POLICY "Providers read their own submissions"
  ON public.event_source_submissions FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

GRANT SELECT ON public.event_source_submissions TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_event_source(
  p_endpoint_url text,
  p_publisher_name text,
  p_strategy text DEFAULT 'render',
  p_homepage_url text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_categories text[] DEFAULT '{}',
  p_note text DEFAULT NULL,
  p_inspection jsonb DEFAULT '{}'::jsonb,
  p_detected_events integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_id uuid;
  v_open integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_endpoint_url IS NULL OR p_endpoint_url !~ '^https?://' THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_URL' USING ERRCODE = '22023';
  END IF;
  IF public.event_feed_url_host(p_endpoint_url) IS NULL THEN
    RAISE EXCEPTION 'INVALID_ENDPOINT_HOST' USING ERRCODE = '22023';
  END IF;

  -- A queue that anyone can fill is a queue that gets flooded.
  SELECT count(*) INTO v_open
  FROM public.event_source_submissions
  WHERE submitted_by = auth.uid() AND status = 'pending';
  IF v_open >= 10 THEN
    RAISE EXCEPTION 'TOO_MANY_PENDING_SUBMISSIONS' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.event_source_submissions (
    submitted_by, publisher_name, homepage_url, endpoint_url, strategy,
    city, categories, note, inspection, detected_events
  ) VALUES (
    auth.uid(), btrim(p_publisher_name), p_homepage_url, btrim(p_endpoint_url),
    COALESCE(p_strategy, 'render'), NULLIF(btrim(coalesce(p_city, '')), ''),
    COALESCE(p_categories, '{}'), left(coalesce(p_note, ''), 500),
    COALESCE(p_inspection, '{}'::jsonb), GREATEST(0, COALESCE(p_detected_events, 0))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_event_source(text, text, text, text, text, text[], text, jsonb, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_event_source(text, text, text, text, text, text[], text, jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_event_source_submissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'publisher_name', s.publisher_name, 'endpoint_url', s.endpoint_url,
    'strategy', s.strategy, 'status', s.status, 'detected_events', s.detected_events,
    'review_note', s.review_note, 'source_id', s.source_id, 'created_at', s.created_at
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public.event_source_submissions s
  WHERE s.submitted_by = auth.uid();
$fn$;

REVOKE ALL ON FUNCTION public.my_event_source_submissions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_event_source_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_source_submissions(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT CASE WHEN public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'publisher_name', s.publisher_name, 'homepage_url', s.homepage_url,
      'endpoint_url', s.endpoint_url, 'strategy', s.strategy, 'city', s.city,
      'categories', s.categories, 'note', s.note, 'detected_events', s.detected_events,
      'status', s.status, 'source_id', s.source_id, 'review_note', s.review_note,
      'created_at', s.created_at, 'inspection', s.inspection
    ) ORDER BY s.created_at DESC)
    FROM public.event_source_submissions s
    WHERE p_status IS NULL OR s.status = p_status), '[]'::jsonb)
  ELSE NULL END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_source_submissions(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_source_submissions(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_source_submission(
  p_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_row public.event_source_submissions;
  v_source_id text;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.event_source_submissions WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_PENDING' USING ERRCODE = '02000';
  END IF;

  IF p_approve THEN
    v_source_id := public.admin_upsert_scraper_source(
      v_row.endpoint_url, v_row.publisher_name, v_row.strategy,
      v_row.homepage_url, v_row.city, v_row.categories, true,
      'Szolgáltatói beküldés', NULL
    );
  END IF;

  UPDATE public.event_source_submissions
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      source_id = v_source_id,
      review_note = left(coalesce(p_note, ''), 500),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_id;

  RETURN v_source_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_review_source_submission(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_source_submission(uuid, boolean, text) TO authenticated;
