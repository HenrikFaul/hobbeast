-- Prompt 09: external event/place provenance, freshness and reversible dedupe.
-- Existing provider/external IDs remain the upsert identity. Cross-provider
-- matches are review records, never destructive canonical merges.
-- Rollback: set provider kill switches, stop sync jobs, export review/run state,
-- restore the previous public policy, then drop new tables/columns.

BEGIN;

ALTER TABLE public.external_events
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS normalization_version text NOT NULL DEFAULT 'external-event-v1',
  ADD COLUMN IF NOT EXISTS dedupe_confidence numeric(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canonical_fingerprint text,
  ADD COLUMN IF NOT EXISTS import_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz;

UPDATE public.external_events
SET first_seen_at = COALESCE(created_at, now()),
    last_verified_at = COALESCE(last_verified_at, source_last_synced_at),
    canonical_fingerprint = COALESCE(
      canonical_fingerprint,
      lower(regexp_replace(trim(title), '\s+', ' ', 'g')) || '|' || COALESCE(event_date::text, '') || '|' || lower(COALESCE(location_city, ''))
    ),
    freshness_state = CASE
      WHEN source_last_synced_at IS NULL THEN 'unknown'
      WHEN source_last_synced_at >= now() - interval '24 hours' THEN 'fresh'
      WHEN source_last_synced_at >= now() - interval '72 hours' THEN 'aging'
      ELSE 'stale'
    END,
    import_state = CASE WHEN is_active THEN 'active' ELSE 'cancelled' END
WHERE true;

ALTER TABLE public.external_events DROP CONSTRAINT IF EXISTS external_events_freshness_state_check;
ALTER TABLE public.external_events ADD CONSTRAINT external_events_freshness_state_check
  CHECK (freshness_state IN ('fresh', 'aging', 'stale', 'unknown'));
ALTER TABLE public.external_events DROP CONSTRAINT IF EXISTS external_events_import_state_check;
ALTER TABLE public.external_events ADD CONSTRAINT external_events_import_state_check
  CHECK (import_state IN ('discovered', 'review', 'active', 'stale', 'cancelled', 'rejected'));
ALTER TABLE public.external_events DROP CONSTRAINT IF EXISTS external_events_dedupe_confidence_check;
ALTER TABLE public.external_events ADD CONSTRAINT external_events_dedupe_confidence_check
  CHECK (dedupe_confidence BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS external_events_fingerprint_idx
  ON public.external_events (canonical_fingerprint, event_date);
CREATE INDEX IF NOT EXISTS external_events_public_supply_idx
  ON public.external_events (import_state, freshness_state, event_date)
  WHERE is_active = true;

ALTER TABLE public.places_local_catalog
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS normalization_version text NOT NULL DEFAULT 'place-v1',
  ADD COLUMN IF NOT EXISTS import_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source_confidence numeric(5,4);

UPDATE public.places_local_catalog
SET first_seen_at = COALESCE(synced_at, updated_at, now()),
    last_verified_at = COALESCE(last_verified_at, synced_at),
    freshness_state = CASE
      WHEN synced_at >= now() - interval '7 days' THEN 'fresh'
      WHEN synced_at >= now() - interval '30 days' THEN 'aging'
      ELSE 'stale'
    END
WHERE true;

ALTER TABLE public.places_local_catalog DROP CONSTRAINT IF EXISTS places_local_catalog_freshness_state_check;
ALTER TABLE public.places_local_catalog ADD CONSTRAINT places_local_catalog_freshness_state_check
  CHECK (freshness_state IN ('fresh', 'aging', 'stale', 'unknown'));
ALTER TABLE public.places_local_catalog DROP CONSTRAINT IF EXISTS places_local_catalog_import_state_check;
ALTER TABLE public.places_local_catalog ADD CONSTRAINT places_local_catalog_import_state_check
  CHECK (import_state IN ('active', 'stale', 'review', 'rejected'));
ALTER TABLE public.places_local_catalog DROP CONSTRAINT IF EXISTS places_local_catalog_source_confidence_check;
ALTER TABLE public.places_local_catalog ADD CONSTRAINT places_local_catalog_source_confidence_check
  CHECK (source_confidence IS NULL OR source_confidence BETWEEN 0 AND 1);

CREATE TABLE IF NOT EXISTS public.external_provider_state (
  provider text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  circuit_state text NOT NULL DEFAULT 'closed',
  consecutive_failures integer NOT NULL DEFAULT 0,
  circuit_open_until timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_kind text,
  last_error_code text,
  last_checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_units numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider IN ('eventbrite', 'ticketmaster', 'seatgeek', 'geoapify', 'tomtom', 'mapy', 'local_catalog', 'external_supabase')),
  CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  CHECK (last_error_kind IS NULL OR last_error_kind IN ('outage', 'quota', 'malformed_payload', 'geocode_failure', 'timeout', 'unknown'))
);

CREATE TABLE IF NOT EXISTS public.external_provider_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  page_count integer NOT NULL DEFAULT 0,
  error_kind text,
  error_code text,
  failure_sample_redacted text,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'cancelled', 'dead_letter')),
  CHECK (char_length(COALESCE(failure_sample_redacted, '')) <= 500)
);

CREATE INDEX IF NOT EXISTS external_provider_sync_runs_provider_started_idx
  ON public.external_provider_sync_runs (provider, started_at DESC);

CREATE TABLE IF NOT EXISTS public.external_event_dedupe_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  candidate_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  confidence numeric(5,4) NOT NULL,
  review_state text NOT NULL DEFAULT 'pending',
  linked_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_event_id <> candidate_event_id),
  CHECK (confidence BETWEEN 0 AND 1),
  CHECK (review_state IN ('pending', 'linked', 'rejected', 'unlinked')),
  UNIQUE (source_event_id, candidate_event_id)
);

ALTER TABLE public.external_provider_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_provider_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_dedupe_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read external provider state" ON public.external_provider_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read external sync runs" ON public.external_provider_sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage external dedupe reviews" ON public.external_event_dedupe_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Service role manages external provider state" ON public.external_provider_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages external sync runs" ON public.external_provider_sync_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "External events are viewable by everyone" ON public.external_events;
DROP POLICY IF EXISTS "External events readable by all" ON public.external_events;
CREATE POLICY "Published external supply is readable"
  ON public.external_events FOR SELECT TO public
  USING (is_active = true AND import_state IN ('active', 'stale'));

CREATE OR REPLACE FUNCTION public.refresh_external_supply_freshness()
RETURNS TABLE (event_rows integer, place_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_rows integer := 0;
  v_place_rows integer := 0;
BEGIN
  UPDATE public.external_events
  SET freshness_state = CASE
        WHEN last_verified_at IS NULL THEN 'unknown'
        WHEN last_verified_at >= now() - interval '24 hours' THEN 'fresh'
        WHEN last_verified_at >= now() - interval '72 hours' THEN 'aging'
        ELSE 'stale'
      END,
      import_state = CASE
        WHEN import_state IN ('cancelled', 'rejected', 'review') THEN import_state
        WHEN last_verified_at < now() - interval '72 hours' THEN 'stale'
        ELSE 'active'
      END
  WHERE is_active = true;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  UPDATE public.places_local_catalog
  SET freshness_state = CASE
        WHEN last_verified_at IS NULL THEN 'unknown'
        WHEN last_verified_at >= now() - interval '7 days' THEN 'fresh'
        WHEN last_verified_at >= now() - interval '30 days' THEN 'aging'
        ELSE 'stale'
      END,
      import_state = CASE
        WHEN import_state IN ('rejected', 'review') THEN import_state
        WHEN last_verified_at < now() - interval '30 days' THEN 'stale'
        ELSE 'active'
      END;
  GET DIAGNOSTICS v_place_rows = ROW_COUNT;

  RETURN QUERY SELECT v_event_rows, v_place_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_external_event_dedupe_reviews()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.external_event_dedupe_reviews
    (source_event_id, candidate_event_id, confidence, reason)
  SELECT
    LEAST(a.id, b.id),
    GREATEST(a.id, b.id),
    0.9900,
    'exact_normalized_title_date_city_cross_provider'
  FROM public.external_events a
  JOIN public.external_events b
    ON a.canonical_fingerprint = b.canonical_fingerprint
   AND a.id < b.id
   AND a.external_source <> b.external_source
  WHERE a.canonical_fingerprint IS NOT NULL
    AND a.canonical_fingerprint <> '||'
    AND a.is_active = true
    AND b.is_active = true
  ON CONFLICT (source_event_id, candidate_event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_external_supply_freshness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_external_event_dedupe_reviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_external_supply_freshness() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_external_event_dedupe_reviews() TO service_role;

COMMIT;
