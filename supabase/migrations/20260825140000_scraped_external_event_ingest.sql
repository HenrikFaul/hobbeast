-- Controlled ingest boundary for the offline Playwright event-scraper worker
-- (scraper-worker/, run from GitHub Actions). The worker renders JS event sites
-- offline, extracts dated events, and calls this ONE service-role RPC to upsert
-- them into public.external_events. This keeps the Supabase Edge feed pipeline
-- (deliberately no-JS / SSRF-hardened) untouched: the scraper never writes raw
-- table rows, and every ingested row is validated server-side here.
--
-- Safety:
--   * service_role only (GitHub Actions holds the key as a secret).
--   * Each event must have a non-empty title, an external id, and a future date
--     (>= current_date); anything else is skipped, never published.
--   * Idempotent upsert on the existing (external_source, external_id) unique
--     index. A re-run refreshes last_verified_at / freshness instead of duplicating.
--   * Rows are marked active/fresh so the existing safe public read RPC surfaces
--     them under "Külső programok" exactly like the provider-API events.

-- Allow a dedicated 'scraper' external_source bucket so scraper rows never mix
-- with provider-API rows or the no-JS feed pipeline's rows.
ALTER TABLE public.external_events DROP CONSTRAINT IF EXISTS external_events_external_source_check;
ALTER TABLE public.external_events ADD CONSTRAINT external_events_external_source_check
  CHECK (external_source = ANY (ARRAY['ticketmaster'::text, 'universe'::text, 'tickettailor'::text, 'seatgeek'::text, 'feed'::text, 'scraper'::text]));

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
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_existing uuid;
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
    v_date   := NULL;
    v_time   := NULL;
    BEGIN
      IF NULLIF(btrim(v_event->>'event_date'), '') IS NOT NULL THEN
        v_date := (v_event->>'event_date')::date;
      END IF;
      IF NULLIF(btrim(v_event->>'event_time'), '') IS NOT NULL THEN
        v_time := (v_event->>'event_time')::time;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
    END;

    -- Quality gate: title, id, source and a real future date are mandatory.
    IF v_source IS NULL OR v_ext_id IS NULL OR v_title IS NULL
       OR v_date IS NULL OR v_date < current_date THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_existing FROM public.external_events
      WHERE external_source = v_source AND external_id = v_ext_id;

    INSERT INTO public.external_events (
      external_source, external_id, external_url, title, category, subcategory,
      tags, description, event_date, event_time, location_type, location_city,
      location_address, image_url, organizer_name, source_payload,
      source_last_synced_at, is_active, freshness_state, normalization_version,
      dedupe_confidence, import_state, first_seen_at, last_verified_at
    ) VALUES (
      v_source, v_ext_id, NULLIF(btrim(v_event->>'external_url'), ''), v_title,
      NULLIF(btrim(v_event->>'category'), ''), NULLIF(btrim(v_event->>'subcategory'), ''),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_event->'tags') = 'array' THEN v_event->'tags' ELSE '[]'::jsonb END) x), '{}'::text[]),
      NULLIF(btrim(v_event->>'description'), ''), v_date, v_time,
      COALESCE(NULLIF(btrim(v_event->>'location_type'), ''), 'address'),
      NULLIF(btrim(v_event->>'location_city'), ''), NULLIF(btrim(v_event->>'location_address'), ''),
      NULLIF(btrim(v_event->>'image_url'), ''), NULLIF(btrim(v_event->>'organizer_name'), ''),
      COALESCE(v_event->'source_payload', v_event),
      now(), true, 'fresh', 'hobbeast-scraper-v1', 0, 'active', now(), now()
    )
    ON CONFLICT (external_source, external_id) DO UPDATE SET
      external_url = EXCLUDED.external_url,
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      tags = EXCLUDED.tags,
      description = EXCLUDED.description,
      event_date = EXCLUDED.event_date,
      event_time = EXCLUDED.event_time,
      location_type = EXCLUDED.location_type,
      location_city = EXCLUDED.location_city,
      location_address = EXCLUDED.location_address,
      image_url = EXCLUDED.image_url,
      organizer_name = EXCLUDED.organizer_name,
      source_payload = EXCLUDED.source_payload,
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

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_scraped_external_events(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_scraped_external_events(jsonb) TO service_role;
