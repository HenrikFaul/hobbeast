-- Event-feed ingestion safety foundation.
--
-- This migration is deliberately fail-closed:
--   * imported source candidates stay pending_review + disabled;
--   * raw upstream payloads are service-only;
--   * only approved sources and quality-qualified normalized items can become
--     externally discoverable events;
--   * cron jobs execute a runtime dispatcher and never persist a secret in the
--     pg_cron command text.
--
-- The source catalogue is seeded by a separate, data-only migration so that
-- registry schema/security can be reviewed independently from candidate data.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Close the legacy local-places Vault disclosure and stale-project routing.
-- ---------------------------------------------------------------------------

INSERT INTO public.app_runtime_config (key, provider, options)
VALUES (
  'internal_edge_function_base_url',
  'supabase',
  jsonb_build_object('url', 'https://bqdvqmpwccsxumzijspj.supabase.co')
)
ON CONFLICT (key) DO UPDATE
SET provider = EXCLUDED.provider,
    options = EXCLUDED.options,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.resolve_internal_edge_function_base_url()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT rtrim(COALESCE(
    (
      SELECT nullif(trim(options ->> 'url'), '')
      FROM public.app_runtime_config
      WHERE key = 'internal_edge_function_base_url'
      LIMIT 1
    ),
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1),
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1)
  ), '/');
$$;

CREATE OR REPLACE FUNCTION public.resolve_internal_service_role_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.enqueue_local_places_batch(p_reset boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_project_url text;
  v_service_key text;
  v_request_id bigint;
BEGIN
  v_project_url := public.resolve_internal_edge_function_base_url();
  v_service_key := public.resolve_internal_service_role_key();

  IF v_project_url IS NULL OR v_service_key IS NULL THEN
    RAISE EXCEPTION 'Missing internal edge base URL or service role key';
  END IF;

  SELECT net.http_post(
    url := v_project_url || '/functions/v1/sync-local-places',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_service_key),
      'apikey', trim(v_service_key)
    ),
    body := jsonb_build_object('action', 'enqueue', 'reset', p_reset)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Only the runtime enqueue function reads Vault. The stored pg_cron command is
-- a constant function call, never a formatted bearer token.
CREATE OR REPLACE FUNCTION public.schedule_daily_local_places_sync(
  p_cron text DEFAULT '30 2 * * *',
  p_reset boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_job_id bigint;
  v_command text;
BEGIN
  IF p_cron IS NULL OR length(p_cron) NOT BETWEEN 9 AND 80
     OR p_cron ~ '[;\n\r]' THEN
    RAISE EXCEPTION 'INVALID_CRON_EXPRESSION' USING ERRCODE = '22023';
  END IF;

  BEGIN
    PERFORM cron.unschedule('sync-local-places-daily-hu');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_command := CASE WHEN p_reset
    THEN 'select public.enqueue_local_places_batch(true);'
    ELSE 'select public.enqueue_local_places_batch(false);'
  END;

  SELECT cron.schedule('sync-local-places-daily-hu', p_cron, v_command)
  INTO v_job_id;

  RETURN format('Scheduled daily sync job id: %s', v_job_id);
END;
$$;

-- If the legacy daily job already exists, preserve its cadence while replacing
-- the old command that may contain an interpolated bearer token. This does not
-- create a new schedule when none was configured.
DO $$
DECLARE
  v_existing_schedule text;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT schedule FROM cron.job WHERE jobname = $1 LIMIT 1'
      INTO v_existing_schedule
      USING 'sync-local-places-daily-hu';
    IF v_existing_schedule IS NOT NULL THEN
      PERFORM cron.unschedule('sync-local-places-daily-hu');
      PERFORM cron.schedule(
        'sync-local-places-daily-hu',
        v_existing_schedule,
        'select public.enqueue_local_places_batch(false);'
      );
    END IF;
  END IF;
END;
$$;

-- Every legacy secret/scheduler entry point is service-only. PUBLIC is revoked
-- as well because PostgreSQL grants function EXECUTE to PUBLIC by default.
REVOKE ALL ON FUNCTION public.resolve_internal_edge_function_base_url() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_internal_service_role_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_local_places_batch(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_daily_local_places_sync(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_daily_local_places_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_local_places_interval(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_local_places_interval() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_internal_edge_function_base_url() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_internal_service_role_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_local_places_batch(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_daily_local_places_sync(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_daily_local_places_sync() TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_local_places_interval(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_local_places_interval() TO service_role;

-- ---------------------------------------------------------------------------
-- External supply allowlists and positive public visibility.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.external_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%external_source%'
  LOOP
    EXECUTE format('ALTER TABLE public.external_events DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.external_events
  ADD CONSTRAINT external_events_external_source_check
  CHECK (external_source IN ('ticketmaster', 'universe', 'tickettailor', 'seatgeek', 'feed'));

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.external_provider_state'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%provider%'
  LOOP
    EXECUTE format('ALTER TABLE public.external_provider_state DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.external_provider_state
  ADD CONSTRAINT external_provider_state_provider_check
  CHECK (provider IN (
    'eventbrite', 'ticketmaster', 'seatgeek', 'geoapify', 'tomtom', 'mapy',
    'local_catalog', 'external_supabase', 'event_feed'
  ));

INSERT INTO public.external_provider_state (provider, enabled, circuit_state)
VALUES ('event_feed', false, 'closed')
ON CONFLICT (provider) DO NOTHING;

DROP POLICY IF EXISTS "External events are viewable by everyone" ON public.external_events;
DROP POLICY IF EXISTS "External events readable by all" ON public.external_events;
DROP POLICY IF EXISTS "Published external supply is readable" ON public.external_events;
REVOKE SELECT ON TABLE public.external_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_events TO service_role;

-- ---------------------------------------------------------------------------
-- Source registry helpers and tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.event_feed_url_host(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v_rest text;
  v_authority text;
  v_host text;
  v_port text;
BEGIN
  IF trim(p_url) !~* '^https://' OR trim(p_url) ~ '[[:space:]]' THEN
    RETURN NULL;
  END IF;

  v_rest := substring(trim(p_url) FROM 9);
  v_authority := split_part(split_part(split_part(v_rest, '/', 1), '?', 1), '#', 1);
  IF v_authority = '' OR position('@' IN v_authority) > 0 THEN
    RETURN NULL;
  END IF;

  v_host := lower(split_part(v_authority, ':', 1));
  v_port := CASE WHEN position(':' IN v_authority) > 0
    THEN split_part(v_authority, ':', 2)
    ELSE NULL
  END;

  IF v_port IS NOT NULL AND v_port <> '443' THEN
    RETURN NULL;
  END IF;
  IF position('.' IN v_host) = 0
     OR v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
     OR v_host ~ '\.\.'
     OR v_host LIKE '.%'
     OR v_host LIKE '%.'
     OR v_host IN ('localhost', 'localhost.localdomain')
     OR v_host ~ '^(10|127)\.'
     OR v_host ~ '^169\.254\.'
     OR v_host ~ '^192\.168\.'
     OR v_host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
    RETURN NULL;
  END IF;

  RETURN v_host;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_feed_hosts_are_exact(p_hosts text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v_host text;
BEGIN
  IF p_hosts IS NULL OR cardinality(p_hosts) = 0 OR cardinality(p_hosts) > 20 THEN
    RETURN false;
  END IF;

  FOREACH v_host IN ARRAY p_hosts LOOP
    IF v_host IS NULL
       OR v_host <> lower(trim(v_host))
       OR position('.' IN v_host) = 0
       OR v_host ~ '[*/:@?#[:space:]]'
       OR v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
       OR v_host ~ '\.\.'
       OR v_host IN ('localhost', 'localhost.localdomain')
       OR v_host ~ '^(10|127)\.'
       OR v_host ~ '^169\.254\.'
       OR v_host ~ '^192\.168\.'
       OR v_host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.event_feed_url_host(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_feed_hosts_are_exact(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_feed_url_host(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_feed_hosts_are_exact(text[]) TO service_role;

CREATE TABLE public.external_event_feed_sources (
  source_id text PRIMARY KEY CHECK (length(source_id) BETWEEN 3 AND 160),
  publisher_id text,
  publisher_name text NOT NULL CHECK (length(trim(publisher_name)) BETWEEN 2 AND 300),
  publisher_type text,
  city text,
  district text,
  county text,
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  homepage_url text,
  endpoint_url text,
  original_endpoint_url text,
  canonical_url text,
  endpoint_kind text,
  format text,
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  redirect_target text,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  event_schema_detected boolean,
  schema_types text[] NOT NULL DEFAULT '{}'::text[],
  ics_detected boolean,
  rss_detected boolean,
  api_detected boolean,
  last_item_at timestamptz,
  next_event_at timestamptz,
  robots_url text,
  robots_allowed boolean,
  terms_url text,
  privacy_url text,
  copyright_url text,
  attribution_required boolean,
  legal_basis text,
  audit_status text,
  etag text,
  last_modified text,
  last_checked_at timestamptz,
  last_successful_parse_at timestamptz,
  parse_success_rate numeric(5,4) CHECK (parse_success_rate IS NULL OR parse_success_rate BETWEEN 0 AND 1),
  health_status text,
  poll_interval_minutes integer NOT NULL DEFAULT 1440 CHECK (poll_interval_minutes BETWEEN 15 AND 10080),
  event_relevance_score numeric(5,2) CHECK (event_relevance_score IS NULL OR event_relevance_score BETWEEN 0 AND 100),
  source_trust_score numeric(5,2) CHECK (source_trust_score IS NULL OR source_trust_score BETWEEN 0 AND 100),
  geo_confidence text,
  dedupe_priority integer,
  parser_strategy text,
  notes text,

  review_state text NOT NULL DEFAULT 'pending_review'
    CHECK (review_state IN ('pending_review', 'approved', 'rejected', 'paused')),
  legal_review_status text NOT NULL DEFAULT 'pending'
    CHECK (legal_review_status IN ('pending', 'approved', 'rejected')),
  fetch_hosts text[] NOT NULL DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT false,
  min_publish_quality numeric(5,2) NOT NULL DEFAULT 80.00
    CHECK (min_publish_quality BETWEEN 50.00 AND 100.00),
  max_response_bytes integer NOT NULL DEFAULT 2097152
    CHECK (max_response_bytes BETWEEN 16384 AND 5242880),
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz,
  lease_token uuid,
  lease_worker text,
  lease_expires_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures BETWEEN 0 AND 1000000),
  last_error_kind text,
  last_error_code text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT external_event_feed_sources_enable_guard CHECK (
    NOT enabled OR (
      review_state = 'approved'
      AND legal_review_status = 'approved'
      AND robots_allowed IS TRUE
      AND endpoint_url IS NOT NULL
      AND public.event_feed_url_host(endpoint_url) IS NOT NULL
      AND public.event_feed_hosts_are_exact(fetch_hosts)
      AND public.event_feed_url_host(endpoint_url) = ANY(fetch_hosts)
    )
  ),
  CONSTRAINT external_event_feed_sources_lease_shape CHECK (
    (lease_token IS NULL AND lease_worker IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_worker IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX external_event_feed_sources_due_idx
  ON public.external_event_feed_sources (next_poll_at, source_id)
  WHERE enabled = true;
CREATE INDEX external_event_feed_sources_review_idx
  ON public.external_event_feed_sources (review_state, publisher_name);

CREATE TABLE public.external_event_feed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.external_event_feed_sources(source_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  lease_token uuid NOT NULL,
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 3 AND 120),
  action text NOT NULL DEFAULT 'sync' CHECK (action IN ('probe', 'sync', 'backfill')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'not_modified', 'partial', 'failed', 'cancelled')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  response_etag text,
  response_last_modified text,
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  quarantined_count integer NOT NULL DEFAULT 0 CHECK (quarantined_count >= 0),
  published_count integer NOT NULL DEFAULT 0 CHECK (published_count >= 0),
  duplicate_count integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  error_kind text,
  error_code text,
  failure_sample_redacted text CHECK (char_length(COALESCE(failure_sample_redacted, '')) <= 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (source_id, lease_token)
);

CREATE INDEX external_event_feed_runs_source_started_idx
  ON public.external_event_feed_runs (source_id, started_at DESC);

CREATE TABLE public.external_event_feed_raw_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.external_event_feed_sources(source_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES public.external_event_feed_runs(id) ON DELETE RESTRICT,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text,
  raw_body text NOT NULL CHECK (octet_length(raw_body) <= 5242880),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  UNIQUE (source_id, payload_sha256)
);

CREATE INDEX external_event_feed_raw_payloads_expiry_idx
  ON public.external_event_feed_raw_payloads (expires_at, id);

CREATE TABLE public.external_event_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.external_event_feed_sources(source_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source_item_id text NOT NULL CHECK (length(trim(source_item_id)) BETWEEN 1 AND 500),
  run_id uuid NOT NULL REFERENCES public.external_event_feed_runs(id) ON DELETE RESTRICT,
  raw_payload_id uuid REFERENCES public.external_event_feed_raw_payloads(id) ON DELETE SET NULL,
  source_identity_hash text NOT NULL CHECK (source_identity_hash ~ '^[0-9a-f]{64}$'),
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(normalized_payload) = 'object' AND pg_column_size(normalized_payload) <= 131072),
  quality_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  quality_reasons text[] NOT NULL DEFAULT '{}'::text[],
  item_state text NOT NULL DEFAULT 'discovered'
    CHECK (item_state IN ('discovered', 'quarantined', 'publish_ready', 'published', 'duplicate', 'rejected', 'cancelled')),
  external_event_id uuid REFERENCES public.external_events(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text CHECK (review_reason IS NULL OR length(review_reason) <= 1000),
  UNIQUE (source_id, source_item_id)
);

CREATE INDEX external_event_feed_items_queue_idx
  ON public.external_event_feed_items (item_state, quality_score DESC, last_seen_at DESC);
CREATE INDEX external_event_feed_items_event_idx
  ON public.external_event_feed_items (external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE public.external_event_feed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_feed_raw_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider operators read feed sources"
  ON public.external_event_feed_sources FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'providers.manage'));
CREATE POLICY "Provider operators read feed runs"
  ON public.external_event_feed_runs FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'providers.manage'));
CREATE POLICY "Provider operators read feed quarantine"
  ON public.external_event_feed_items FOR SELECT TO authenticated
  USING (public.admin_has_capability(auth.uid(), 'providers.manage'));

CREATE POLICY "Service manages feed sources"
  ON public.external_event_feed_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manages feed runs"
  ON public.external_event_feed_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manages feed raw payloads"
  ON public.external_event_feed_raw_payloads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manages feed items"
  ON public.external_event_feed_items FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.external_event_feed_sources,
  public.external_event_feed_runs,
  public.external_event_feed_raw_payloads,
  public.external_event_feed_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.external_event_feed_sources,
  public.external_event_feed_runs,
  public.external_event_feed_items
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_event_feed_sources,
  public.external_event_feed_runs,
  public.external_event_feed_raw_payloads,
  public.external_event_feed_items
  TO service_role;

-- ---------------------------------------------------------------------------
-- Service-only lease, raw staging, normalized commit and completion RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_external_event_feed_sources(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT 'event-feed-worker',
  p_lease_seconds integer DEFAULT 600
)
RETURNS TABLE (
  run_id uuid,
  source_id text,
  run_action text,
  endpoint_url text,
  endpoint_kind text,
  format text,
  parser_strategy text,
  publisher_name text,
  city text,
  categories text[],
  review_state text,
  enabled boolean,
  legal_review_status text,
  robots_allowed boolean,
  min_publish_quality numeric,
  fetch_hosts text[],
  etag text,
  last_modified text,
  poll_interval_minutes integer,
  max_response_bytes integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  attribution_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_lease_seconds integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 600), 60), 1800);
  v_worker text := left(trim(COALESCE(p_worker_id, '')), 120);
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF length(v_worker) < 3 THEN
    RAISE EXCEPTION 'INVALID_WORKER_ID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT s.source_id
    FROM public.external_event_feed_sources s
    WHERE s.enabled = true
      AND s.review_state = 'approved'
      AND s.legal_review_status = 'approved'
      AND s.robots_allowed IS TRUE
      AND public.event_feed_url_host(s.endpoint_url) = ANY(s.fetch_hosts)
      AND s.next_poll_at <= now()
      AND COALESCE(s.next_retry_at, '-infinity'::timestamptz) <= now()
      AND (s.lease_expires_at IS NULL OR s.lease_expires_at <= now())
      AND EXISTS (
        SELECT 1
        FROM public.external_provider_state ps
        WHERE ps.provider = 'event_feed'
          AND ps.enabled = true
          AND ps.circuit_state IN ('closed', 'half_open')
      )
    ORDER BY s.next_poll_at, s.source_id
    FOR UPDATE OF s SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.external_event_feed_sources s
    SET lease_token = gen_random_uuid(),
        lease_worker = v_worker,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        updated_at = now()
    FROM candidates c
    WHERE s.source_id = c.source_id
    RETURNING s.*
  ), created_runs AS (
    INSERT INTO public.external_event_feed_runs (
      source_id, lease_token, worker_id, action, status
    )
    SELECT c.source_id, c.lease_token, v_worker, 'sync', 'running'
    FROM claimed c
    RETURNING id, external_event_feed_runs.source_id, external_event_feed_runs.lease_token
  )
  SELECT
    r.id,
    c.source_id,
    'sync'::text,
    c.endpoint_url,
    c.endpoint_kind,
    c.format,
    c.parser_strategy,
    c.publisher_name,
    c.city,
    c.categories,
    c.review_state,
    c.enabled,
    c.legal_review_status,
    c.robots_allowed,
    c.min_publish_quality,
    c.fetch_hosts,
    c.etag,
    c.last_modified,
    c.poll_interval_minutes,
    c.max_response_bytes,
    c.lease_token,
    c.lease_expires_at,
    c.attribution_required
  FROM claimed c
  JOIN created_runs r USING (source_id, lease_token)
  ORDER BY c.next_poll_at, c.source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_external_event_feed_source(
  p_source_id text,
  p_worker_id text,
  p_lease_seconds integer,
  p_probe boolean DEFAULT false
)
RETURNS TABLE (
  run_id uuid,
  source_id text,
  run_action text,
  endpoint_url text,
  endpoint_kind text,
  format text,
  parser_strategy text,
  publisher_name text,
  city text,
  categories text[],
  review_state text,
  enabled boolean,
  legal_review_status text,
  robots_allowed boolean,
  min_publish_quality numeric,
  fetch_hosts text[],
  etag text,
  last_modified text,
  poll_interval_minutes integer,
  max_response_bytes integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  attribution_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source public.external_event_feed_sources%ROWTYPE;
  v_run_id uuid;
  v_token uuid := gen_random_uuid();
  v_worker text := left(trim(COALESCE(p_worker_id, '')), 120);
  v_lease_seconds integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 600), 60), 1800);
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF length(v_worker) < 3 OR length(trim(COALESCE(p_source_id, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_CLAIM_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources s
  WHERE s.source_id = p_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FEED_SOURCE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.lease_expires_at IS NOT NULL AND v_source.lease_expires_at > now() THEN
    RAISE EXCEPTION 'FEED_SOURCE_ALREADY_LEASED' USING ERRCODE = '55P03';
  END IF;
  IF public.event_feed_url_host(v_source.endpoint_url) IS NULL
     OR public.event_feed_url_host(v_source.endpoint_url) <> ALL(v_source.fetch_hosts) THEN
    RAISE EXCEPTION 'FEED_SOURCE_HOST_NOT_APPROVED' USING ERRCODE = '42501';
  END IF;
  IF NOT p_probe AND (
    NOT v_source.enabled
    OR v_source.review_state <> 'approved'
    OR v_source.legal_review_status <> 'approved'
    OR v_source.robots_allowed IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.external_provider_state ps
      WHERE ps.provider = 'event_feed'
        AND ps.enabled = true
        AND ps.circuit_state IN ('closed', 'half_open')
    )
  ) THEN
    RAISE EXCEPTION 'FEED_SOURCE_NOT_SYNCABLE' USING ERRCODE = '42501';
  END IF;

  UPDATE public.external_event_feed_sources
  SET lease_token = v_token,
      lease_worker = v_worker,
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      updated_at = now()
  WHERE external_event_feed_sources.source_id = p_source_id;

  INSERT INTO public.external_event_feed_runs (
    source_id, lease_token, worker_id, action, status
  ) VALUES (
    p_source_id, v_token, v_worker, CASE WHEN p_probe THEN 'probe' ELSE 'sync' END, 'running'
  ) RETURNING id INTO v_run_id;

  RETURN QUERY SELECT
    v_run_id,
    v_source.source_id,
    CASE WHEN p_probe THEN 'probe' ELSE 'sync' END,
    v_source.endpoint_url,
    v_source.endpoint_kind,
    v_source.format,
    v_source.parser_strategy,
    v_source.publisher_name,
    v_source.city,
    v_source.categories,
    v_source.review_state,
    v_source.enabled,
    v_source.legal_review_status,
    v_source.robots_allowed,
    v_source.min_publish_quality,
    v_source.fetch_hosts,
    v_source.etag,
    v_source.last_modified,
    v_source.poll_interval_minutes,
    v_source.max_response_bytes,
    v_token,
    now() + make_interval(secs => v_lease_seconds),
    v_source.attribution_required;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_external_event_feed_raw_payload(
  p_source_id text,
  p_run_id uuid,
  p_lease_token uuid,
  p_content_type text,
  p_raw_body text,
  p_payload_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_source public.external_event_feed_sources%ROWTYPE;
  v_payload_id uuid;
  v_digest text;
  v_run_action text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_raw_body IS NULL OR p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_RAW_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources
  WHERE source_id = p_source_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_source.lease_token IS DISTINCT FROM p_lease_token
     OR v_source.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'SOURCE_LEASE_NOT_AVAILABLE' USING ERRCODE = '55000';
  END IF;
  IF public.event_feed_url_host(v_source.endpoint_url) IS NULL
     OR public.event_feed_url_host(v_source.endpoint_url) <> ALL(v_source.fetch_hosts) THEN
    RAISE EXCEPTION 'FEED_SOURCE_HOST_NOT_APPROVED' USING ERRCODE = '42501';
  END IF;
  IF octet_length(p_raw_body) > v_source.max_response_bytes THEN
    RAISE EXCEPTION 'RAW_PAYLOAD_TOO_LARGE' USING ERRCODE = '22001';
  END IF;
  SELECT r.action INTO v_run_action
  FROM public.external_event_feed_runs r
    WHERE r.id = p_run_id
      AND r.source_id = p_source_id
      AND r.lease_token = p_lease_token
      AND r.status = 'running';
  IF v_run_action IS NULL THEN
    RAISE EXCEPTION 'RUN_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF v_run_action <> 'probe' AND (
    NOT v_source.enabled
    OR v_source.review_state <> 'approved'
    OR v_source.legal_review_status <> 'approved'
    OR v_source.robots_allowed IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'SOURCE_NOT_APPROVED' USING ERRCODE = '42501';
  END IF;

  v_digest := encode(digest(p_raw_body, 'sha256'), 'hex');
  IF v_digest <> p_payload_sha256 THEN
    RAISE EXCEPTION 'RAW_PAYLOAD_DIGEST_MISMATCH' USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.external_event_feed_raw_payloads (
    source_id, run_id, payload_sha256, content_type, raw_body
  ) VALUES (
    p_source_id, p_run_id, p_payload_sha256, left(p_content_type, 300), p_raw_body
  )
  ON CONFLICT (source_id, payload_sha256) DO NOTHING
  RETURNING id INTO v_payload_id;

  IF v_payload_id IS NULL THEN
    SELECT id INTO v_payload_id
    FROM public.external_event_feed_raw_payloads
    WHERE source_id = p_source_id AND payload_sha256 = p_payload_sha256;
  END IF;

  RETURN v_payload_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_external_event_feed_raw_payloads(
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  WITH expired AS (
    SELECT raw.id
    FROM public.external_event_feed_raw_payloads raw
    WHERE raw.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.external_event_feed_items item
        WHERE item.raw_payload_id = raw.id
          AND item.item_state IN ('discovered', 'publish_ready')
      )
    ORDER BY raw.expires_at, raw.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 10000)
  )
  DELETE FROM public.external_event_feed_raw_payloads raw
  USING expired
  WHERE raw.id = expired.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_external_event_feed_item(
  p_source_id text,
  p_run_id uuid,
  p_lease_token uuid,
  p_source_item_id text,
  p_item jsonb,
  p_quality_score numeric,
  p_quality_reasons text[] DEFAULT '{}'::text[],
  p_raw_payload_id uuid DEFAULT NULL
)
RETURNS TABLE (
  feed_item_id uuid,
  external_event_id uuid,
  item_state text,
  published boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_source public.external_event_feed_sources%ROWTYPE;
  v_feed_item public.external_event_feed_items%ROWTYPE;
  v_external_event_id uuid;
  v_identity_hash text;
  v_external_id text;
  v_title text;
  v_event_date date;
  v_event_time time;
  v_event_url text;
  v_category text;
  v_tags text[] := '{}'::text[];
  v_reasons text[] := COALESCE(p_quality_reasons, '{}'::text[]);
  v_can_publish boolean := true;
  v_candidate_state text;
  v_location_lat double precision;
  v_location_lon double precision;
  v_price_min numeric;
  v_price_max numeric;
  v_max_attendees integer;
  v_provider_updated_at timestamptz;
  v_is_free boolean;
  v_run_action text;
  v_is_cancelled boolean := false;
  v_image_url text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object'
     OR length(trim(COALESCE(p_source_item_id, ''))) NOT BETWEEN 1 AND 500
     OR p_quality_score IS NULL OR p_quality_score NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'INVALID_NORMALIZED_ITEM' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources
  WHERE source_id = p_source_id
  FOR UPDATE;

  IF NOT FOUND
     OR public.event_feed_url_host(v_source.endpoint_url) IS NULL
     OR public.event_feed_url_host(v_source.endpoint_url) <> ALL(v_source.fetch_hosts)
     OR v_source.lease_token IS DISTINCT FROM p_lease_token
     OR v_source.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'SOURCE_NOT_APPROVED_OR_LEASED' USING ERRCODE = '55000';
  END IF;
  SELECT r.action INTO v_run_action
  FROM public.external_event_feed_runs r
    WHERE r.id = p_run_id
      AND r.source_id = p_source_id
      AND r.lease_token = p_lease_token
      AND r.status = 'running';
  IF v_run_action IS NULL THEN
    RAISE EXCEPTION 'RUN_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF v_run_action <> 'probe' AND (
    NOT v_source.enabled
    OR v_source.review_state <> 'approved'
    OR v_source.legal_review_status <> 'approved'
    OR v_source.robots_allowed IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'SOURCE_NOT_APPROVED' USING ERRCODE = '42501';
  END IF;
  IF p_raw_payload_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.external_event_feed_raw_payloads raw
    WHERE raw.id = p_raw_payload_id
      AND raw.source_id = p_source_id
      AND raw.run_id = p_run_id
  ) THEN
    RAISE EXCEPTION 'RAW_PAYLOAD_RUN_MISMATCH' USING ERRCODE = '55000';
  END IF;

  v_title := left(trim(COALESCE(p_item ->> 'title', '')), 500);
  v_event_url := left(trim(COALESCE(p_item ->> 'external_url', '')), 2000);
  v_category := left(trim(COALESCE(p_item ->> 'category', '')), 120);
  v_is_cancelled := lower(trim(COALESCE(p_item ->> 'status', ''))) = 'cancelled';
  v_image_url := left(trim(COALESCE(p_item ->> 'image_url', '')), 2000);
  IF v_image_url !~ '^https://[^[:space:]]+$' THEN
    v_image_url := NULL;
  END IF;

  IF cardinality(COALESCE(p_quality_reasons, '{}'::text[])) > 0 THEN
    v_can_publish := false;
  END IF;

  IF length(v_title) < 3 THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'missing_title');
  END IF;
  IF v_event_url !~ '^https://[^[:space:]]+$' THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'invalid_external_url');
  END IF;
  IF length(v_category) < 2 THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'missing_category');
  END IF;

  BEGIN
    IF COALESCE(p_item ->> 'event_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'invalid event date';
    END IF;
    v_event_date := (p_item ->> 'event_date')::date;
    IF v_event_date < current_date THEN
      v_can_publish := false;
      v_reasons := array_append(v_reasons, 'event_in_past');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'invalid_event_date');
    v_event_date := NULL;
  END;

  BEGIN
    IF NULLIF(trim(p_item ->> 'event_time'), '') IS NOT NULL THEN
      v_event_time := (p_item ->> 'event_time')::time;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_event_time := NULL;
    v_reasons := array_append(v_reasons, 'invalid_event_time_ignored');
  END;

  IF jsonb_typeof(p_item -> 'tags') = 'array' THEN
    SELECT COALESCE(array_agg(DISTINCT left(tag_value #>> '{}', 120)), '{}'::text[])
    INTO v_tags
    FROM jsonb_array_elements(p_item -> 'tags') AS tag_value
    WHERE jsonb_typeof(tag_value) = 'string'
      AND length(trim(tag_value #>> '{}')) BETWEEN 1 AND 120;
  END IF;

  BEGIN
    IF jsonb_typeof(p_item -> 'location_lat') = 'number' THEN v_location_lat := (p_item ->> 'location_lat')::double precision; END IF;
    IF jsonb_typeof(p_item -> 'location_lon') = 'number' THEN v_location_lon := (p_item ->> 'location_lon')::double precision; END IF;
    IF jsonb_typeof(p_item -> 'price_min') = 'number' THEN v_price_min := (p_item ->> 'price_min')::numeric; END IF;
    IF jsonb_typeof(p_item -> 'price_max') = 'number' THEN v_price_max := (p_item ->> 'price_max')::numeric; END IF;
    IF jsonb_typeof(p_item -> 'max_attendees') = 'number' THEN v_max_attendees := (p_item ->> 'max_attendees')::integer; END IF;
    IF jsonb_typeof(p_item -> 'is_free') = 'boolean' THEN v_is_free := (p_item ->> 'is_free')::boolean; END IF;
    IF NULLIF(trim(p_item ->> 'provider_updated_at'), '') IS NOT NULL THEN
      v_provider_updated_at := (p_item ->> 'provider_updated_at')::timestamptz;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'invalid_numeric_or_timestamp_field');
  END;

  IF p_quality_score < v_source.min_publish_quality THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'quality_below_source_threshold');
  END IF;
  IF v_run_action = 'probe' THEN
    v_can_publish := false;
    v_reasons := array_append(v_reasons, 'probe_only_source');
  END IF;

  v_identity_hash := encode(digest(p_source_id || E'\n' || trim(p_source_item_id), 'sha256'), 'hex');
  v_external_id := left(p_source_id, 150) || ':' || v_identity_hash;
  v_candidate_state := CASE
    WHEN v_run_action = 'probe' THEN 'quarantined'
    WHEN v_is_cancelled THEN 'cancelled'
    WHEN v_can_publish THEN 'publish_ready'
    ELSE 'quarantined'
  END;

  INSERT INTO public.external_event_feed_items (
    source_id, source_item_id, run_id, raw_payload_id, source_identity_hash,
    normalized_payload, quality_score, quality_reasons, item_state, last_seen_at
  ) VALUES (
    p_source_id, trim(p_source_item_id), p_run_id, p_raw_payload_id, v_identity_hash,
    p_item, p_quality_score, v_reasons, v_candidate_state, now()
  )
  ON CONFLICT (source_id, source_item_id) DO UPDATE SET
    run_id = EXCLUDED.run_id,
    raw_payload_id = EXCLUDED.raw_payload_id,
    normalized_payload = CASE
      WHEN external_event_feed_items.item_state = 'published' AND EXCLUDED.item_state = 'quarantined'
        THEN external_event_feed_items.normalized_payload
      ELSE EXCLUDED.normalized_payload
    END,
    quality_score = EXCLUDED.quality_score,
    quality_reasons = EXCLUDED.quality_reasons,
    item_state = CASE
      WHEN external_event_feed_items.item_state = 'published' AND EXCLUDED.item_state = 'quarantined'
        THEN 'published'
      ELSE EXCLUDED.item_state
    END,
    last_seen_at = now()
  RETURNING * INTO v_feed_item;

  IF v_is_cancelled AND v_run_action <> 'probe' THEN
    UPDATE public.external_events
    SET is_active = false,
        import_state = 'cancelled',
        last_verified_at = now(),
        source_last_synced_at = now(),
        provider_updated_at = COALESCE(v_provider_updated_at, provider_updated_at),
        updated_at = now()
    WHERE external_source = 'feed' AND external_id = v_external_id
    RETURNING id INTO v_external_event_id;

    UPDATE public.external_event_feed_items AS feed_item
    SET item_state = 'cancelled',
        external_event_id = COALESCE(v_external_event_id, feed_item.external_event_id),
        last_seen_at = now()
    WHERE feed_item.id = v_feed_item.id;

    RETURN QUERY SELECT v_feed_item.id, COALESCE(v_external_event_id, v_feed_item.external_event_id), 'cancelled'::text, false;
    RETURN;
  END IF;

  IF NOT v_can_publish THEN
    RETURN QUERY SELECT v_feed_item.id, v_feed_item.external_event_id, v_feed_item.item_state, false;
    RETURN;
  END IF;

  INSERT INTO public.external_events (
    external_source, external_id, external_url, title, category, subcategory,
    tags, description, event_date, event_time, location_type, location_city,
    location_address, location_free_text, location_lat, location_lon,
    price_min, price_max, currency, is_free, max_attendees, image_url,
    organizer_name, source_payload, source_last_synced_at, is_active,
    last_verified_at, freshness_state, normalization_version,
    canonical_fingerprint, import_state, provider_updated_at, updated_at
  ) VALUES (
    'feed', v_external_id, v_event_url, v_title, v_category,
    NULLIF(left(trim(p_item ->> 'subcategory'), 120), ''),
    v_tags, NULLIF(left(p_item ->> 'description', 12000), ''), v_event_date,
    v_event_time, COALESCE(NULLIF(left(trim(p_item ->> 'location_type'), 50), ''), 'address'),
    NULLIF(left(trim(p_item ->> 'location_city'), 200), ''),
    NULLIF(left(trim(p_item ->> 'location_address'), 500), ''),
    NULLIF(left(trim(p_item ->> 'location_free_text'), 500), ''),
    v_location_lat, v_location_lon, v_price_min, v_price_max,
    NULLIF(left(upper(trim(p_item ->> 'currency')), 3), ''), v_is_free,
    v_max_attendees, v_image_url,
    COALESCE(NULLIF(left(trim(p_item ->> 'organizer_name'), 300), ''), v_source.publisher_name),
    jsonb_build_object(
      'feed_source_id', p_source_id,
      'feed_item_id', v_feed_item.id,
      'source_identity_hash', v_identity_hash,
      'attribution_required', COALESCE(v_source.attribution_required, false)
    ),
    now(), true, now(), 'fresh', 'event-feed-v1',
    lower(regexp_replace(v_title, '\s+', ' ', 'g')) || '|' || v_event_date::text || '|' ||
      lower(COALESCE(NULLIF(trim(p_item ->> 'location_city'), ''), '')),
    'active', v_provider_updated_at, now()
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
    location_free_text = EXCLUDED.location_free_text,
    location_lat = EXCLUDED.location_lat,
    location_lon = EXCLUDED.location_lon,
    price_min = EXCLUDED.price_min,
    price_max = EXCLUDED.price_max,
    currency = EXCLUDED.currency,
    is_free = EXCLUDED.is_free,
    max_attendees = EXCLUDED.max_attendees,
    image_url = EXCLUDED.image_url,
    organizer_name = EXCLUDED.organizer_name,
    source_payload = EXCLUDED.source_payload,
    source_last_synced_at = now(),
    is_active = true,
    last_verified_at = now(),
    freshness_state = 'fresh',
    normalization_version = EXCLUDED.normalization_version,
    canonical_fingerprint = EXCLUDED.canonical_fingerprint,
    import_state = 'active',
    provider_updated_at = EXCLUDED.provider_updated_at,
    updated_at = now()
  RETURNING id INTO v_external_event_id;

  UPDATE public.external_event_feed_items
  SET item_state = 'published',
      external_event_id = v_external_event_id,
      published_at = COALESCE(published_at, now()),
      last_seen_at = now()
  WHERE id = v_feed_item.id;

  RETURN QUERY SELECT v_feed_item.id, v_external_event_id, 'published'::text, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_external_event_feed_run(
  p_source_id text,
  p_run_id uuid,
  p_lease_token uuid,
  p_status text,
  p_http_status integer DEFAULT NULL,
  p_etag text DEFAULT NULL,
  p_last_modified text DEFAULT NULL,
  p_discovered_count integer DEFAULT 0,
  p_quarantined_count integer DEFAULT 0,
  p_published_count integer DEFAULT 0,
  p_duplicate_count integer DEFAULT 0,
  p_error_kind text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_failure_sample_redacted text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source public.external_event_feed_sources%ROWTYPE;
  v_success boolean;
  v_next_poll timestamptz;
  v_failures integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('succeeded', 'not_modified', 'partial', 'failed', 'cancelled')
     OR COALESCE(p_discovered_count, -1) < 0
     OR COALESCE(p_quarantined_count, -1) < 0
     OR COALESCE(p_published_count, -1) < 0
     OR COALESCE(p_duplicate_count, -1) < 0 THEN
    RAISE EXCEPTION 'INVALID_RUN_COMPLETION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources
  WHERE source_id = p_source_id
  FOR UPDATE;

  IF NOT FOUND OR v_source.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'SOURCE_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.external_event_feed_runs r
    WHERE r.id = p_run_id
      AND r.source_id = p_source_id
      AND r.lease_token = p_lease_token
      AND r.status = 'running'
  ) THEN
    RAISE EXCEPTION 'RUN_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;

  v_success := p_status IN ('succeeded', 'not_modified');
  v_failures := CASE WHEN v_success THEN 0 ELSE LEAST(v_source.consecutive_failures + 1, 1000000) END;
  v_next_poll := CASE
    WHEN v_success THEN now() + make_interval(mins => v_source.poll_interval_minutes)
    ELSE now() + LEAST(
      make_interval(mins => (15 * power(2::numeric, LEAST(v_failures, 7)))::integer),
      interval '24 hours'
    )
  END;

  UPDATE public.external_event_feed_runs
  SET status = p_status,
      http_status = p_http_status,
      response_etag = left(p_etag, 1000),
      response_last_modified = left(p_last_modified, 500),
      discovered_count = p_discovered_count,
      quarantined_count = p_quarantined_count,
      published_count = p_published_count,
      duplicate_count = p_duplicate_count,
      error_kind = left(p_error_kind, 120),
      error_code = left(p_error_code, 120),
      failure_sample_redacted = left(p_failure_sample_redacted, 500),
      finished_at = now()
  WHERE id = p_run_id AND status = 'running';

  UPDATE public.external_event_feed_sources
  SET http_status = p_http_status,
      etag = CASE WHEN p_etag IS NULL THEN etag ELSE left(p_etag, 1000) END,
      last_modified = CASE WHEN p_last_modified IS NULL THEN last_modified ELSE left(p_last_modified, 500) END,
      last_checked_at = now(),
      last_successful_parse_at = CASE WHEN v_success THEN now() ELSE last_successful_parse_at END,
      health_status = CASE
        WHEN v_success THEN 'healthy'
        WHEN v_failures < 3 THEN 'degraded'
        ELSE 'failing'
      END,
      consecutive_failures = v_failures,
      last_error_kind = CASE WHEN v_success THEN NULL ELSE left(p_error_kind, 120) END,
      last_error_code = CASE WHEN v_success THEN NULL ELSE left(p_error_code, 120) END,
      next_poll_at = v_next_poll,
      next_retry_at = CASE WHEN v_success THEN NULL ELSE v_next_poll END,
      lease_token = NULL,
      lease_worker = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE source_id = p_source_id AND lease_token = p_lease_token;

  UPDATE public.external_provider_state
  SET consecutive_failures = CASE WHEN v_success THEN 0 ELSE consecutive_failures + 1 END,
      last_success_at = CASE WHEN v_success THEN now() ELSE last_success_at END,
      last_error_at = CASE WHEN v_success THEN last_error_at ELSE now() END,
      last_error_kind = CASE WHEN v_success THEN NULL ELSE 'unknown' END,
      last_error_code = CASE WHEN v_success THEN NULL ELSE left(p_error_code, 120) END,
      updated_at = now()
  WHERE provider = 'event_feed';

  IF p_published_count > 0 THEN
    PERFORM public.queue_external_event_dedupe_reviews();
  END IF;

  RETURN jsonb_build_object(
    'source_id', p_source_id,
    'run_id', p_run_id,
    'status', p_status,
    'next_poll_at', v_next_poll,
    'consecutive_failures', v_failures
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_external_event_feed_sources(integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_external_event_feed_source(text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_external_event_feed_raw_payload(text, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_external_event_feed_raw_payloads(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_external_event_feed_item(text, uuid, uuid, text, jsonb, numeric, text[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_external_event_feed_run(text, uuid, uuid, text, integer, text, text, integer, integer, integer, integer, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_external_event_feed_sources(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_external_event_feed_source(text, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_external_event_feed_raw_payload(text, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_external_event_feed_raw_payloads(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_external_event_feed_item(text, uuid, uuid, text, jsonb, numeric, text[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_external_event_feed_run(text, uuid, uuid, text, integer, text, text, integer, integer, integer, integer, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Capability-gated, audited source review. Candidate seeds cannot self-enable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_review_external_event_feed_source(
  p_source_id text,
  p_decision text,
  p_reason text,
  p_request_id text,
  p_idempotency_key text,
  p_enable boolean DEFAULT false,
  p_fetch_hosts text[] DEFAULT '{}'::text[],
  p_legal_review_status text DEFAULT 'pending',
  p_robots_allowed boolean DEFAULT NULL,
  p_poll_interval_minutes integer DEFAULT NULL,
  p_min_publish_quality numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.external_event_feed_sources%ROWTYPE;
  v_hosts text[];
  v_roles text[];
  v_audit_key text := left('feed-source-review:' || COALESCE(p_idempotency_key, ''), 240);
  v_result jsonb;
BEGIN
  IF NOT public.admin_has_capability(v_actor, 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject', 'pause')
     OR length(trim(COALESCE(p_reason, ''))) < 8
     OR length(COALESCE(p_request_id, '')) < 8
     OR length(COALESCE(p_idempotency_key, '')) < 8 THEN
    RAISE EXCEPTION 'INVALID_SOURCE_REVIEW' USING ERRCODE = '22023';
  END IF;
  IF p_enable AND p_decision <> 'approve' THEN
    RAISE EXCEPTION 'ONLY_APPROVED_SOURCE_CAN_BE_ENABLED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources
  WHERE source_id = p_source_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FEED_SOURCE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_audit_log WHERE idempotency_key = v_audit_key) THEN
    RETURN jsonb_build_object(
      'source_id', v_source.source_id,
      'review_state', v_source.review_state,
      'enabled', v_source.enabled,
      'replayed', true
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(trim(host)) ORDER BY lower(trim(host))), '{}'::text[])
  INTO v_hosts
  FROM unnest(COALESCE(p_fetch_hosts, '{}'::text[])) AS host
  WHERE length(trim(host)) > 0;

  IF p_decision = 'approve' THEN
    IF p_legal_review_status <> 'approved'
       OR p_robots_allowed IS NOT TRUE
       OR public.event_feed_url_host(v_source.endpoint_url) IS NULL
       OR NOT public.event_feed_hosts_are_exact(v_hosts)
       OR public.event_feed_url_host(v_source.endpoint_url) <> ALL(v_hosts) THEN
      RAISE EXCEPTION 'SOURCE_APPROVAL_EVIDENCE_INCOMPLETE' USING ERRCODE = '22023';
    END IF;
    IF p_poll_interval_minutes IS NOT NULL AND p_poll_interval_minutes NOT BETWEEN 15 AND 10080 THEN
      RAISE EXCEPTION 'INVALID_POLL_INTERVAL' USING ERRCODE = '22023';
    END IF;
    IF p_min_publish_quality IS NOT NULL AND p_min_publish_quality NOT BETWEEN 50 AND 100 THEN
      RAISE EXCEPTION 'INVALID_MIN_PUBLISH_QUALITY' USING ERRCODE = '22023';
    END IF;

    UPDATE public.external_event_feed_sources
    SET review_state = 'approved',
        legal_review_status = 'approved',
        robots_allowed = true,
        audit_status = 'approved',
        fetch_hosts = v_hosts,
        enabled = p_enable,
        poll_interval_minutes = COALESCE(p_poll_interval_minutes, poll_interval_minutes),
        min_publish_quality = COALESCE(p_min_publish_quality, min_publish_quality),
        reviewed_by = v_actor,
        reviewed_at = now(),
        updated_at = now()
    WHERE source_id = p_source_id;
  ELSIF p_decision = 'reject' THEN
    UPDATE public.external_event_feed_sources
    SET review_state = 'rejected',
        enabled = false,
        audit_status = 'rejected',
        reviewed_by = v_actor,
        reviewed_at = now(),
        updated_at = now()
    WHERE source_id = p_source_id;
  ELSE
    UPDATE public.external_event_feed_sources
    SET review_state = 'paused',
        enabled = false,
        audit_status = 'paused',
        reviewed_by = v_actor,
        reviewed_at = now(),
        updated_at = now()
    WHERE source_id = p_source_id;
  END IF;

  SELECT COALESCE(array_agg(role_key ORDER BY role_key), '{}'::text[])
  INTO v_roles
  FROM public.admin_operator_roles
  WHERE user_id = v_actor
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  SELECT jsonb_build_object(
    'source_id', s.source_id,
    'review_state', s.review_state,
    'enabled', s.enabled,
    'legal_review_status', s.legal_review_status,
    'robots_allowed', s.robots_allowed,
    'fetch_hosts', s.fetch_hosts,
    'replayed', false
  ) INTO v_result
  FROM public.external_event_feed_sources s
  WHERE s.source_id = p_source_id;

  INSERT INTO public.admin_audit_log (
    actor_id, role_snapshot, capability_key, action, target_type, target_id,
    before_redacted, after_redacted, safe_metadata, reason, request_id,
    idempotency_key, outcome
  ) VALUES (
    v_actor, v_roles, 'providers.manage', 'event_feed.source.reviewed',
    'event_feed_source', left(p_source_id, 200),
    jsonb_build_object(
      'review_state', v_source.review_state,
      'enabled', v_source.enabled,
      'legal_review_status', v_source.legal_review_status,
      'robots_allowed', v_source.robots_allowed
    ),
    v_result - 'replayed',
    jsonb_build_object(
      'decision', p_decision,
      'enabled', p_enable,
      'fetch_host_count', cardinality(v_hosts)
    ),
    left(trim(p_reason), 1000), left(p_request_id, 200), v_audit_key, 'succeeded'
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_external_event_feed_source(text, text, text, text, text, boolean, text[], text, boolean, integer, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_external_event_feed_source(text, text, text, text, text, boolean, text[], text, boolean, integer, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- HMAC-signed runtime dispatcher. Vault values never leave the function and
-- no schedule is created by this migration; scheduling is an explicit action.
-- ---------------------------------------------------------------------------

CREATE TABLE public.external_event_feed_cron_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce uuid NOT NULL UNIQUE,
  issued_at_epoch bigint NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  request_id bigint,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.external_event_feed_cron_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages feed cron dispatches"
  ON public.external_event_feed_cron_dispatches FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.external_event_feed_cron_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_event_feed_cron_dispatches TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_external_event_feed_due()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_project_url text;
  v_hmac_secret text;
  v_nonce uuid := gen_random_uuid();
  v_issued_at bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
  v_body jsonb;
  v_body_text text;
  v_signature text;
  v_request_id bigint;
BEGIN
  v_project_url := public.resolve_internal_edge_function_base_url();
  SELECT COALESCE(
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'event_feed_cron_hmac_secret' LIMIT 1),
    (SELECT nullif(trim(decrypted_secret), '') FROM vault.decrypted_secrets WHERE name = 'EVENT_FEED_CRON_HMAC_SECRET' LIMIT 1)
  ) INTO v_hmac_secret;

  IF v_project_url IS NULL OR v_hmac_secret IS NULL OR length(v_hmac_secret) < 32 THEN
    RAISE EXCEPTION 'EVENT_FEED_CRON_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;

  v_body := jsonb_build_object(
    'action', 'sync_due',
    'issued_at', v_issued_at,
    'nonce', v_nonce,
    'limit', 10
  );
  v_body_text := v_body::text;
  v_signature := encode(hmac(v_issued_at::text || '.' || v_body_text, v_hmac_secret, 'sha256'), 'hex');

  INSERT INTO public.external_event_feed_cron_dispatches (
    nonce, issued_at_epoch, body_sha256
  ) VALUES (
    v_nonce, v_issued_at, encode(digest(v_body_text, 'sha256'), 'hex')
  );

  SELECT net.http_post(
    url := v_project_url || '/functions/v1/event-feed-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Hobbeast-Timestamp', v_issued_at::text,
      'X-Hobbeast-Nonce', v_nonce::text,
      'X-Hobbeast-Signature', 'v1=' || v_signature
    ),
    body := v_body
  ) INTO v_request_id;

  UPDATE public.external_event_feed_cron_dispatches
  SET request_id = v_request_id
  WHERE nonce = v_nonce;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_external_event_feed_cron_dispatch(
  p_nonce uuid,
  p_issued_at bigint,
  p_body_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_consumed uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL OR p_body_sha256 !~ '^[0-9a-f]{64}$'
     OR abs(floor(extract(epoch FROM clock_timestamp()))::bigint - p_issued_at) > 300 THEN
    RETURN false;
  END IF;

  UPDATE public.external_event_feed_cron_dispatches
  SET consumed_at = now()
  WHERE nonce = p_nonce
    AND issued_at_epoch = p_issued_at
    AND body_sha256 = p_body_sha256
    AND consumed_at IS NULL
    AND created_at >= now() - interval '5 minutes'
  RETURNING id INTO v_consumed;

  RETURN v_consumed IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_external_event_feed_daily(
  p_cron text DEFAULT '17 3 * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  IF p_cron IS NULL OR length(p_cron) NOT BETWEEN 9 AND 80 OR p_cron ~ '[;\n\r]' THEN
    RAISE EXCEPTION 'INVALID_CRON_EXPRESSION' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name IN ('event_feed_cron_hmac_secret', 'EVENT_FEED_CRON_HMAC_SECRET')
      AND length(trim(decrypted_secret)) >= 32
  ) THEN
    RAISE EXCEPTION 'EVENT_FEED_CRON_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;

  BEGIN
    PERFORM cron.unschedule('event-feed-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT cron.schedule(
    'event-feed-daily',
    p_cron,
    'select public.dispatch_external_event_feed_due();'
  ) INTO v_job_id;

  RETURN format('Scheduled event-feed-daily job id: %s', v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unschedule_external_event_feed_daily()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('event-feed-daily');
  EXCEPTION WHEN OTHERS THEN
    RETURN 'event-feed-daily was not scheduled';
  END;
  RETURN 'Unscheduled event-feed-daily';
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_external_event_feed_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_external_event_feed_cron_dispatch(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_external_event_feed_daily(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_external_event_feed_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_external_event_feed_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_external_event_feed_cron_dispatch(uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_external_event_feed_daily(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_external_event_feed_daily() TO service_role;

-- ---------------------------------------------------------------------------
-- Positive public contract: direct table reads stay closed and these RPCs emit
-- only allowlisted fields for active, fresh/aging, future events.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.external_event_is_publicly_available(p_external_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.external_events e
    WHERE e.id = p_external_event_id
      AND e.is_active = true
      AND e.event_date >= current_date
      AND e.import_state = 'active'
      AND e.freshness_state IN ('fresh', 'aging')
      AND e.external_url ~ '^https://[^[:space:]]+$'
  );
$$;

CREATE OR REPLACE FUNCTION public.list_external_events_safe_page(
  p_from_date date DEFAULT current_date,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100) AS page_limit,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS page_offset
  ), candidates AS (
    SELECT e.*
    FROM public.external_events e, bounds b
    WHERE e.is_active = true
      AND e.event_date >= GREATEST(COALESCE(p_from_date, current_date), current_date)
      AND e.import_state = 'active'
      AND e.freshness_state IN ('fresh', 'aging')
      AND e.external_url ~ '^https://[^[:space:]]+$'
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET (SELECT page_offset FROM bounds)
    LIMIT (SELECT page_limit + 1 FROM bounds)
  ), numbered AS (
    SELECT c.*, row_number() OVER (ORDER BY c.event_date, c.event_time NULLS LAST, c.id) AS row_number
    FROM candidates c
  ), page AS (
    SELECT n.* FROM numbered n, bounds b WHERE n.row_number <= b.page_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'external_source', p.external_source,
      'external_id', p.external_id,
      'external_url', p.external_url,
      'title', p.title,
      'category', p.category,
      'subcategory', p.subcategory,
      'tags', p.tags,
      'description', p.description,
      'event_date', p.event_date,
      'event_time', p.event_time,
      'location_type', p.location_type,
      'location_city', p.location_city,
      'location_address', p.location_address,
      'location_free_text', p.location_free_text,
      'location_lat', p.location_lat,
      'location_lon', p.location_lon,
      'max_attendees', p.max_attendees,
      'image_url', p.image_url,
      'source_last_synced_at', p.source_last_synced_at,
      'first_seen_at', p.first_seen_at,
      'last_verified_at', p.last_verified_at,
      'freshness_state', p.freshness_state,
      'normalization_version', p.normalization_version,
      'dedupe_confidence', p.dedupe_confidence,
      'canonical_fingerprint', p.canonical_fingerprint,
      'import_state', p.import_state
    ) ORDER BY p.event_date, p.event_time NULLS LAST, p.id), '[]'::jsonb),
    'offset', (SELECT page_offset FROM bounds),
    'next_offset', CASE
      WHEN (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
      THEN (SELECT page_offset + page_limit FROM bounds)
      ELSE NULL
    END,
    'has_more', (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
  )
  FROM page p;
$$;

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
        WHEN import_state IN ('discovered', 'review', 'rejected', 'cancelled') THEN import_state
        WHEN last_verified_at IS NULL OR last_verified_at < now() - interval '72 hours' THEN 'stale'
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
      END
  WHERE true;
  GET DIAGNOSTICS v_place_rows = ROW_COUNT;

  RETURN QUERY SELECT v_event_rows, v_place_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_external_event_social_intent(
  p_external_event_id uuid,
  p_intent text,
  p_active boolean,
  p_idempotency_key uuid
)
RETURNS TABLE (intent text, status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_before public.external_event_social_intents%ROWTYPE;
  v_status text := CASE WHEN p_active THEN 'active' ELSE 'withdrawn' END;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_intent NOT IN ('interested', 'looking_for_company') OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_SOCIAL_INTENT' USING ERRCODE = '22023';
  END IF;
  IF NOT public.evaluate_feature_flag('external_social_intent', v_user_id, NULL) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_suspended(v_user_id) THEN
    RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.external_event_is_publicly_available(p_external_event_id) THEN
    RAISE EXCEPTION 'EXTERNAL_EVENT_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.external_event_social_intent_audits
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN QUERY SELECT i.intent, i.status, true
    FROM public.external_event_social_intents i
    WHERE i.external_event_id = p_external_event_id AND i.user_id = v_user_id;
    RETURN;
  END IF;

  SELECT * INTO v_before
  FROM public.external_event_social_intents
  WHERE external_event_id = p_external_event_id AND user_id = v_user_id
  FOR UPDATE;

  INSERT INTO public.external_event_social_intents (
    external_event_id, user_id, intent, status, visibility
  ) VALUES (
    p_external_event_id, v_user_id, p_intent, v_status, 'aggregate_only'
  )
  ON CONFLICT (external_event_id, user_id) DO UPDATE SET
    intent = EXCLUDED.intent,
    status = EXCLUDED.status,
    visibility = 'aggregate_only',
    updated_at = now();

  INSERT INTO public.external_event_social_intent_audits (
    external_event_id, user_id, previous_intent, new_intent,
    previous_status, new_status, idempotency_key
  ) VALUES (
    p_external_event_id, v_user_id, v_before.intent, p_intent,
    v_before.status, v_status, p_idempotency_key
  );

  RETURN QUERY SELECT p_intent, v_status, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_external_event_social_summary(p_external_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_intent text;
  v_status text;
  v_enabled boolean := false;
  v_available boolean := false;
BEGIN
  v_available := public.external_event_is_publicly_available(p_external_event_id);
  IF v_user_id IS NOT NULL THEN
    v_enabled := public.evaluate_feature_flag('external_social_intent', v_user_id, NULL);
  END IF;

  IF NOT v_available THEN
    RETURN jsonb_build_object(
      'feature_enabled', v_enabled,
      'available', false,
      'company_interest_count', 0,
      'threshold_met', false,
      'my_intent', NULL,
      'my_status', NULL,
      'privacy_mode', 'aggregate_only'
    );
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT i.intent, i.status INTO v_intent, v_status
    FROM public.external_event_social_intents i
    WHERE i.external_event_id = p_external_event_id AND i.user_id = v_user_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.external_event_social_intents i
  JOIN public.profiles p ON p.user_id = i.user_id
  WHERE i.external_event_id = p_external_event_id
    AND i.status = 'active'
    AND i.intent = 'looking_for_company'
    AND p.user_origin = 'real'
    AND p.is_active = true;

  RETURN jsonb_build_object(
    'feature_enabled', v_enabled,
    'available', true,
    'company_interest_count', CASE WHEN v_count >= 3 THEN v_count ELSE 0 END,
    'threshold_met', v_count >= 3,
    'my_intent', v_intent,
    'my_status', v_status,
    'privacy_mode', 'aggregate_only'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.external_event_is_publicly_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_external_events_safe_page(date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_external_supply_freshness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_external_event_social_intent(uuid, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_external_event_social_summary(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_external_events_safe_page(date, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_external_supply_freshness() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_external_event_social_intent(uuid, text, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_external_event_social_summary(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
