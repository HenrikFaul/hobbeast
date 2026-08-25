-- v1.16.0 scraper platform round:
--   1. Scraper-worker columns on the existing source registry (the V9 master list
--      registers into external_event_feed_sources; the Playwright worker reads its
--      targets from here instead of hard-coded lists).
--   2. scraper_runs log (per-source, per-run counters) + admin stats RPC so the
--      admin surface can show destinations and daily/total scrape output.
--   3. Cross-source event dedup: canonical fingerprint (normalized title + date)
--      computed inside the ingest RPC; an event already ingested from another
--      source is skipped as a duplicate ("master source" first-wins, run order is
--      priority order).
--   4. Richer ingest payload: ticket price/currency/link, image, description.
--   5. Owner-operator capability fix: content_ops gains the capabilities the
--      single-owner admin model needs (providers/notifications/profile/flags);
--      bulk.destructive stays super_admin-only (break-glass).

-- 1) Registry columns for the offline scraper worker
ALTER TABLE public.external_event_feed_sources
  ADD COLUMN IF NOT EXISTS scrape_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scrape_priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS scrape_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS scrape_last_event_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_total_event_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS feed_sources_scrape_due_idx
  ON public.external_event_feed_sources (scrape_enabled, scrape_priority, scrape_last_run_at NULLS FIRST);

-- 2) Scraper run log
CREATE TABLE IF NOT EXISTS public.scraper_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.external_event_feed_sources(source_id) ON DELETE CASCADE,
  run_started_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  discovered integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'partial', 'failed')),
  error text,
  runner text NOT NULL DEFAULT 'github-actions'
);
CREATE INDEX IF NOT EXISTS scraper_runs_started_idx ON public.scraper_runs (run_started_at DESC);
CREATE INDEX IF NOT EXISTS scraper_runs_source_idx ON public.scraper_runs (source_id, run_started_at DESC);
ALTER TABLE public.scraper_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scraper_runs FROM PUBLIC, anon, authenticated;

-- 3) Title normalization + fingerprint helper (Hungarian accent folding, no
--    extension dependency). Order-preserving first six meaningful words.
CREATE OR REPLACE FUNCTION public.event_dedupe_fingerprint(p_title text, p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT md5(
    (
      SELECT COALESCE(string_agg(w, ' '), '')
      FROM (
        SELECT w, ord
        FROM unnest(
          string_to_array(
            regexp_replace(
              -- Accent folding via Unicode escapes so the migration file stays
              -- encoding-safe on any toolchain: áéíóöőúüűäàâçèêëîïôûùñ
              translate(lower(COALESCE(p_title, '')),
                U&'\00E1\00E9\00ED\00F3\00F6\0151\00FA\00FC\0171\00E4\00E0\00E2\00E7\00E8\00EA\00EB\00EE\00EF\00F4\00FB\00F9\00F1',
                'aeiooouuuaaaceeeiiouun'),
              '[^a-z0-9]+', ' ', 'g'
            ), ' '
          )
        ) WITH ORDINALITY AS t(w, ord)
        WHERE length(w) >= 2
          AND w NOT IN ('koncert', 'koncertje', 'live', 'show', 'tour', 'turne', 'est', 'a', 'az', 'es', 'the', 'and')
        ORDER BY ord
        LIMIT 6
      ) words
    ) || '|' || COALESCE(p_date::text, '')
  );
$$;

-- 4) Ingest RPC v2: fingerprint + cross-source duplicate skip + price/ticket fields
CREATE OR REPLACE FUNCTION public.ingest_scraped_external_events(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event jsonb;
  v_source text;
  v_ext_id text;
  v_title text;
  v_date date;
  v_time time;
  v_fp text;
  v_price numeric;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_duplicates int := 0;
  v_existing uuid;
  v_dupe uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'EVENTS_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_events) > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_source := NULLIF(btrim(v_event->>'external_source'), '');
    v_ext_id := NULLIF(btrim(v_event->>'external_id'), '');
    v_title  := NULLIF(btrim(v_event->>'title'), '');
    v_date := NULL; v_time := NULL; v_price := NULL;
    BEGIN
      IF NULLIF(btrim(v_event->>'event_date'), '') IS NOT NULL THEN v_date := (v_event->>'event_date')::date; END IF;
      IF NULLIF(btrim(v_event->>'event_time'), '') IS NOT NULL THEN v_time := (v_event->>'event_time')::time; END IF;
      IF NULLIF(btrim(v_event->>'price_min'), '') IS NOT NULL THEN v_price := (v_event->>'price_min')::numeric; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
    END;

    IF v_source IS NULL OR v_ext_id IS NULL OR v_title IS NULL
       OR v_date IS NULL OR v_date < current_date THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_fp := public.event_dedupe_fingerprint(v_title, v_date);

    SELECT id INTO v_existing FROM public.external_events
      WHERE external_source = v_source AND external_id = v_ext_id;

    -- Cross-source dedup: same fingerprint already active from ANY other row →
    -- this is the same real-world event seen through another source. First
    -- (higher-priority master) source wins; the later copy is skipped.
    IF v_existing IS NULL THEN
      SELECT id INTO v_dupe FROM public.external_events
        WHERE canonical_fingerprint = v_fp AND is_active = true
          AND NOT (external_source = v_source AND external_id = v_ext_id)
        LIMIT 1;
      IF v_dupe IS NOT NULL THEN
        v_duplicates := v_duplicates + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.external_events (
      external_source, external_id, external_url, title, category, subcategory,
      tags, description, event_date, event_time, location_type, location_city,
      location_address, price_min, currency, image_url, organizer_name,
      source_payload, source_last_synced_at, is_active, freshness_state,
      normalization_version, dedupe_confidence, canonical_fingerprint,
      import_state, first_seen_at, last_verified_at
    ) VALUES (
      v_source, v_ext_id, NULLIF(btrim(v_event->>'external_url'), ''), v_title,
      NULLIF(btrim(v_event->>'category'), ''), NULLIF(btrim(v_event->>'subcategory'), ''),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_event->'tags') = 'array' THEN v_event->'tags' ELSE '[]'::jsonb END) x), '{}'::text[]),
      NULLIF(btrim(v_event->>'description'), ''), v_date, v_time,
      COALESCE(NULLIF(btrim(v_event->>'location_type'), ''), 'address'),
      NULLIF(btrim(v_event->>'location_city'), ''), NULLIF(btrim(v_event->>'location_address'), ''),
      v_price, NULLIF(btrim(v_event->>'currency'), ''),
      NULLIF(btrim(v_event->>'image_url'), ''), NULLIF(btrim(v_event->>'organizer_name'), ''),
      COALESCE(v_event->'source_payload', v_event),
      now(), true, 'fresh', 'hobbeast-scraper-v2', 0.9, v_fp, 'active', now(), now()
    )
    ON CONFLICT (external_source, external_id) DO UPDATE SET
      external_url = EXCLUDED.external_url,
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      tags = EXCLUDED.tags,
      description = COALESCE(EXCLUDED.description, public.external_events.description),
      event_date = EXCLUDED.event_date,
      event_time = EXCLUDED.event_time,
      location_type = EXCLUDED.location_type,
      location_city = COALESCE(EXCLUDED.location_city, public.external_events.location_city),
      location_address = COALESCE(EXCLUDED.location_address, public.external_events.location_address),
      price_min = COALESCE(EXCLUDED.price_min, public.external_events.price_min),
      currency = COALESCE(EXCLUDED.currency, public.external_events.currency),
      image_url = COALESCE(EXCLUDED.image_url, public.external_events.image_url),
      organizer_name = EXCLUDED.organizer_name,
      source_payload = EXCLUDED.source_payload,
      canonical_fingerprint = EXCLUDED.canonical_fingerprint,
      source_last_synced_at = now(),
      last_verified_at = now(),
      freshness_state = 'fresh',
      is_active = true,
      import_state = 'active',
      updated_at = now();

    IF v_existing IS NULL THEN v_inserted := v_inserted + 1;
    ELSE v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated,
                            'skipped', v_skipped, 'duplicates', v_duplicates);
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_scraped_external_events(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_scraped_external_events(jsonb) TO service_role;

-- Backfill fingerprints for rows ingested before this migration.
UPDATE public.external_events
SET canonical_fingerprint = public.event_dedupe_fingerprint(title, event_date)
WHERE canonical_fingerprint IS NULL AND external_source = 'scraper';

CREATE INDEX IF NOT EXISTS external_events_fingerprint_idx
  ON public.external_events (canonical_fingerprint) WHERE canonical_fingerprint IS NOT NULL;

-- 5) Worker support RPCs
CREATE OR REPLACE FUNCTION public.list_scraper_targets(p_limit integer DEFAULT 25)
RETURNS TABLE(source_id text, publisher_name text, endpoint_url text, city text,
              categories text[], scrape_priority integer, timezone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.source_id, s.publisher_name, s.endpoint_url, s.city, s.categories,
         s.scrape_priority, s.timezone
  FROM public.external_event_feed_sources s
  WHERE s.scrape_enabled = true
    AND s.endpoint_url IS NOT NULL
    AND COALESCE(auth.role(), '') = 'service_role'
  ORDER BY s.scrape_priority ASC, s.scrape_last_run_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
$$;
REVOKE ALL ON FUNCTION public.list_scraper_targets(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_scraper_targets(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.log_scraper_run(
  p_source_id text, p_discovered integer, p_inserted integer, p_updated integer,
  p_skipped integer, p_duplicates integer, p_status text, p_error text,
  p_duration_ms integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.scraper_runs (source_id, discovered, inserted, updated, skipped,
                                   duplicates, status, error, duration_ms)
  VALUES (p_source_id, COALESCE(p_discovered,0), COALESCE(p_inserted,0), COALESCE(p_updated,0),
          COALESCE(p_skipped,0), COALESCE(p_duplicates,0),
          CASE WHEN p_status IN ('succeeded','partial','failed') THEN p_status ELSE 'partial' END,
          left(p_error, 500), p_duration_ms)
  RETURNING id INTO v_id;

  UPDATE public.external_event_feed_sources
  SET scrape_last_run_at = now(),
      scrape_last_event_count = COALESCE(p_inserted,0) + COALESCE(p_updated,0),
      scrape_total_event_count = scrape_total_event_count + COALESCE(p_inserted,0)
  WHERE source_id = p_source_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_scraper_run(text,integer,integer,integer,integer,integer,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_scraper_run(text,integer,integer,integer,integer,integer,text,text,integer) TO service_role;

-- 6) Admin stats RPC (destinations + daily/total), gated on providers.manage.
CREATE OR REPLACE FUNCTION public.admin_scraper_stats(p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_days int := GREATEST(1, LEAST(COALESCE(p_days, 14), 90));
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'destinations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_id', s.source_id, 'publisher_name', s.publisher_name,
        'endpoint_url', s.endpoint_url, 'city', s.city,
        'scrape_enabled', s.scrape_enabled, 'scrape_priority', s.scrape_priority,
        'last_run_at', s.scrape_last_run_at, 'last_events', s.scrape_last_event_count,
        'total_events', s.scrape_total_event_count
      ) ORDER BY s.scrape_priority, s.publisher_name), '[]'::jsonb)
      FROM public.external_event_feed_sources s
      WHERE s.scrape_enabled = true
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', d.day, 'runs', d.runs, 'sources', d.sources,
        'discovered', d.discovered, 'inserted', d.inserted,
        'updated', d.updated, 'duplicates', d.duplicates
      ) ORDER BY d.day DESC), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', run_started_at)::date AS day,
               count(*) AS runs, count(DISTINCT source_id) AS sources,
               sum(discovered) AS discovered, sum(inserted) AS inserted,
               sum(updated) AS updated, sum(duplicates) AS duplicates
        FROM public.scraper_runs
        WHERE run_started_at >= current_date - (v_days || ' days')::interval
        GROUP BY 1
      ) d
    ),
    'totals', (
      SELECT jsonb_build_object(
        'total_scraper_events', (SELECT count(*) FROM public.external_events WHERE external_source = 'scraper' AND is_active),
        'enabled_sources', (SELECT count(*) FROM public.external_event_feed_sources WHERE scrape_enabled),
        'registered_sources', (SELECT count(*) FROM public.external_event_feed_sources),
        'runs_total', (SELECT count(*) FROM public.scraper_runs),
        'inserted_total', (SELECT COALESCE(sum(inserted),0) FROM public.scraper_runs),
        'duplicates_total', (SELECT COALESCE(sum(duplicates),0) FROM public.scraper_runs)
      )
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_scraper_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_scraper_stats(integer) TO authenticated;

-- 7) Owner-operator capability model: content_ops covers the owner's day-to-day
--    admin needs (feed/scraper source management included). bulk.destructive
--    remains super_admin-only break-glass.
INSERT INTO public.admin_role_capabilities (role_key, capability_key)
VALUES ('content_ops', 'providers.manage'),
       ('content_ops', 'notifications.manage'),
       ('content_ops', 'users.manage_profile'),
       ('content_ops', 'feature_flags.manage')
ON CONFLICT DO NOTHING;
