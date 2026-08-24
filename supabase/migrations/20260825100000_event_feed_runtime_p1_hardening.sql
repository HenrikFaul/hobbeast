-- Event-feed runtime P1 hardening.
--
-- Invariants:
--   * identical bodies may be observed by multiple runs without losing the
--     run-level evidence needed by the quarantine/publish boundary;
--   * a feed event is public only while its source is currently approved and
--     its last verification is inside the source-specific freshness window;
--   * only an explicitly complete, successful sync snapshot can age missing
--     items out, and the same run can be completed repeatedly without applying
--     the missing transition twice;
--   * probe runs never become validator, provider-health, or freshness proof;
--   * raw retention is bounded and is reached by the explicit dispatcher;
--   * scheduling remains an operator action, with a two-minute due dispatcher
--     default so a bounded 3x10 worker drains 185 due sources in under 15 min.

BEGIN;

-- ---------------------------------------------------------------------------
-- One immutable raw body may legitimately be fetched by multiple runs. Keep
-- the body de-duplicated per source/hash, while recording every run that saw it.
-- Evidence is deleted with the 14-day raw record and is never client-readable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.external_event_feed_raw_fetch_evidence (
  run_id uuid NOT NULL
    REFERENCES public.external_event_feed_runs(id) ON DELETE CASCADE,
  raw_payload_id uuid NOT NULL
    REFERENCES public.external_event_feed_raw_payloads(id) ON DELETE CASCADE,
  source_id text NOT NULL
    REFERENCES public.external_event_feed_sources(source_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, raw_payload_id)
);

CREATE INDEX IF NOT EXISTS external_event_feed_raw_fetch_evidence_raw_idx
  ON public.external_event_feed_raw_fetch_evidence (raw_payload_id, observed_at DESC);

INSERT INTO public.external_event_feed_raw_fetch_evidence (
  run_id, raw_payload_id, source_id, payload_sha256, observed_at
)
SELECT raw.run_id, raw.id, raw.source_id, raw.payload_sha256, raw.fetched_at
FROM public.external_event_feed_raw_payloads raw
ON CONFLICT (run_id, raw_payload_id) DO NOTHING;

ALTER TABLE public.external_event_feed_raw_fetch_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service manages feed raw fetch evidence"
  ON public.external_event_feed_raw_fetch_evidence;
CREATE POLICY "Service manages feed raw fetch evidence"
  ON public.external_event_feed_raw_fetch_evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.external_event_feed_raw_fetch_evidence
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.external_event_feed_raw_fetch_evidence TO service_role;

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
  ON CONFLICT (source_id, payload_sha256) DO UPDATE SET
    -- The legacy compatibility pointer follows the latest observing run. The
    -- append-only evidence table below remains the authoritative run history.
    run_id = EXCLUDED.run_id,
    content_type = COALESCE(EXCLUDED.content_type, external_event_feed_raw_payloads.content_type),
    fetched_at = now(),
    expires_at = GREATEST(
      external_event_feed_raw_payloads.expires_at,
      now() + interval '14 days'
    )
  RETURNING id INTO v_payload_id;

  INSERT INTO public.external_event_feed_raw_fetch_evidence (
    run_id, raw_payload_id, source_id, payload_sha256, observed_at
  ) VALUES (
    p_run_id, v_payload_id, p_source_id, p_payload_sha256, now()
  )
  ON CONFLICT (run_id, raw_payload_id) DO UPDATE SET
    observed_at = EXCLUDED.observed_at;

  RETURN v_payload_id;
END;
$$;

REVOKE ALL ON FUNCTION public.store_external_event_feed_raw_payload(
  text, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_external_event_feed_raw_payload(
  text, uuid, uuid, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Source policy transitions and complete-snapshot disappearance tracking.
-- ---------------------------------------------------------------------------

ALTER TABLE public.external_event_feed_runs
  ADD COLUMN IF NOT EXISTS snapshot_complete boolean NOT NULL DEFAULT false;

ALTER TABLE public.external_event_feed_items
  ADD COLUMN IF NOT EXISTS missing_successful_runs integer NOT NULL DEFAULT 0
    CHECK (missing_successful_runs >= 0),
  ADD COLUMN IF NOT EXISTS last_missing_run_id uuid
    REFERENCES public.external_event_feed_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS external_event_feed_items_missing_idx
  ON public.external_event_feed_items (
    source_id, missing_successful_runs DESC, last_seen_at
  )
  WHERE item_state = 'published' AND external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_events_feed_source_payload_idx
  ON public.external_events ((source_payload ->> 'feed_source_id'))
  WHERE external_source = 'feed';

CREATE OR REPLACE FUNCTION public.reset_external_event_feed_item_missing_on_seen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    NEW.missing_successful_runs := 0;
    NEW.last_missing_run_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_event_feed_items_reset_missing_on_seen
  ON public.external_event_feed_items;
CREATE TRIGGER external_event_feed_items_reset_missing_on_seen
  BEFORE INSERT OR UPDATE OF run_id, last_seen_at
  ON public.external_event_feed_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_external_event_feed_item_missing_on_seen();

REVOKE ALL ON FUNCTION public.reset_external_event_feed_item_missing_on_seen()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_external_event_feed_source_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_eligible boolean;
  v_new_eligible boolean;
BEGIN
  v_old_eligible := OLD.enabled
    AND OLD.review_state = 'approved'
    AND OLD.legal_review_status = 'approved'
    AND OLD.robots_allowed IS TRUE;
  v_new_eligible := NEW.enabled
    AND NEW.review_state = 'approved'
    AND NEW.legal_review_status = 'approved'
    AND NEW.robots_allowed IS TRUE;

  -- Approval after a probe and every endpoint/host transition must force one
  -- unconditional normal fetch; probe validators are not publishing proof.
  IF (NOT v_old_eligible AND v_new_eligible)
     OR NEW.endpoint_url IS DISTINCT FROM OLD.endpoint_url
     OR NEW.fetch_hosts IS DISTINCT FROM OLD.fetch_hosts THEN
    NEW.etag := NULL;
    NEW.last_modified := NULL;
    NEW.next_poll_at := now();
    NEW.next_retry_at := NULL;
  END IF;

  IF v_old_eligible AND NOT v_new_eligible THEN
    NEW.lease_token := NULL;
    NEW.lease_worker := NULL;
    NEW.lease_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_external_events_for_feed_source_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_eligible boolean;
  v_policy_changed boolean;
  v_import_state text;
BEGIN
  v_new_eligible := NEW.enabled
    AND NEW.review_state = 'approved'
    AND NEW.legal_review_status = 'approved'
    AND NEW.robots_allowed IS TRUE;
  v_policy_changed := NEW.enabled IS DISTINCT FROM OLD.enabled
    OR NEW.review_state IS DISTINCT FROM OLD.review_state
    OR NEW.legal_review_status IS DISTINCT FROM OLD.legal_review_status
    OR NEW.robots_allowed IS DISTINCT FROM OLD.robots_allowed
    OR NEW.endpoint_url IS DISTINCT FROM OLD.endpoint_url
    OR NEW.fetch_hosts IS DISTINCT FROM OLD.fetch_hosts;

  IF v_policy_changed AND NOT v_new_eligible THEN
    v_import_state := CASE
      WHEN NEW.review_state = 'rejected'
        OR NEW.legal_review_status = 'rejected' THEN 'rejected'
      ELSE 'stale'
    END;

    UPDATE public.external_events e
    SET is_active = false,
        freshness_state = 'stale',
        import_state = v_import_state,
        updated_at = now()
    WHERE e.external_source = 'feed'
      AND (
        e.source_payload ->> 'feed_source_id' = NEW.source_id
        OR EXISTS (
          SELECT 1
          FROM public.external_event_feed_items i
          WHERE i.source_id = NEW.source_id
            AND i.external_event_id = e.id
        )
      );

    UPDATE public.external_event_feed_runs r
    SET status = 'cancelled',
        error_kind = 'source_policy',
        error_code = CASE
          WHEN NEW.review_state = 'rejected' THEN 'source_rejected'
          WHEN NEW.review_state = 'paused' THEN 'source_paused'
          WHEN NOT NEW.enabled THEN 'source_disabled'
          WHEN NEW.legal_review_status <> 'approved' THEN 'legal_approval_removed'
          WHEN NEW.robots_allowed IS NOT TRUE THEN 'robots_approval_removed'
          ELSE 'source_policy_changed'
        END,
        failure_sample_redacted = 'Source policy changed while the run was active',
        finished_at = now()
    WHERE r.source_id = NEW.source_id
      AND r.status = 'running';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_event_feed_sources_guard_transition
  ON public.external_event_feed_sources;
CREATE TRIGGER external_event_feed_sources_guard_transition
  BEFORE UPDATE ON public.external_event_feed_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_external_event_feed_source_transition();

DROP TRIGGER IF EXISTS external_event_feed_sources_deactivate_events
  ON public.external_event_feed_sources;
CREATE TRIGGER external_event_feed_sources_deactivate_events
  AFTER UPDATE ON public.external_event_feed_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.deactivate_external_events_for_feed_source_transition();

REVOKE ALL ON FUNCTION public.guard_external_event_feed_source_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_external_events_for_feed_source_transition()
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.complete_external_event_feed_run(
  text, uuid, uuid, text, integer, text, text,
  integer, integer, integer, integer, text, text, text
);

CREATE FUNCTION public.complete_external_event_feed_run(
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
  p_failure_sample_redacted text DEFAULT NULL,
  p_snapshot_complete boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source public.external_event_feed_sources%ROWTYPE;
  v_run public.external_event_feed_runs%ROWTYPE;
  v_success boolean;
  v_is_probe boolean;
  v_full_snapshot boolean;
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

  SELECT * INTO v_run
  FROM public.external_event_feed_runs r
  WHERE r.id = p_run_id
    AND r.source_id = p_source_id
    AND r.lease_token = p_lease_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;

  v_is_probe := v_run.action = 'probe';
  v_full_snapshot := p_status = 'succeeded'
    AND v_run.action = 'sync'
    AND COALESCE(p_snapshot_complete, false);

  -- Terminal retry is a read-only replay. It cannot age missing items twice.
  IF v_run.status <> 'running' THEN
    IF v_run.status <> p_status
       OR v_run.snapshot_complete IS DISTINCT FROM v_full_snapshot THEN
      RAISE EXCEPTION 'RUN_ALREADY_COMPLETED' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_source
    FROM public.external_event_feed_sources
    WHERE source_id = p_source_id;
    RETURN jsonb_build_object(
      'source_id', p_source_id,
      'run_id', p_run_id,
      'status', v_run.status,
      'snapshot_complete', v_run.snapshot_complete,
      'next_poll_at', v_source.next_poll_at,
      'consecutive_failures', v_source.consecutive_failures,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_source
  FROM public.external_event_feed_sources
  WHERE source_id = p_source_id
  FOR UPDATE;

  -- Re-check after taking the source lock: a concurrent completion may have
  -- finished while this transaction waited.
  SELECT * INTO v_run
  FROM public.external_event_feed_runs r
  WHERE r.id = p_run_id
    AND r.source_id = p_source_id
    AND r.lease_token = p_lease_token
  FOR UPDATE;
  IF v_run.status <> 'running' THEN
    IF v_run.status <> p_status
       OR v_run.snapshot_complete IS DISTINCT FROM v_full_snapshot THEN
      RAISE EXCEPTION 'RUN_ALREADY_COMPLETED' USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object(
      'source_id', p_source_id,
      'run_id', p_run_id,
      'status', v_run.status,
      'snapshot_complete', v_run.snapshot_complete,
      'next_poll_at', v_source.next_poll_at,
      'consecutive_failures', v_source.consecutive_failures,
      'replayed', true
    );
  END IF;

  IF NOT FOUND OR v_source.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'SOURCE_LEASE_MISMATCH' USING ERRCODE = '55000';
  END IF;

  v_success := p_status IN ('succeeded', 'not_modified');
  v_failures := CASE
    WHEN v_is_probe THEN v_source.consecutive_failures
    WHEN v_success THEN 0
    ELSE LEAST(v_source.consecutive_failures + 1, 1000000)
  END;
  v_next_poll := CASE
    WHEN v_is_probe THEN v_source.next_poll_at
    WHEN v_success THEN now() + make_interval(mins => v_source.poll_interval_minutes)
    ELSE now() + LEAST(
      make_interval(mins => (15 * power(2::numeric, LEAST(v_failures, 7)))::integer),
      interval '24 hours'
    )
  END;

  UPDATE public.external_event_feed_runs
  SET status = p_status,
      snapshot_complete = v_full_snapshot,
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

  -- A successful conditional GET proves that the source representation is
  -- unchanged. Revalidate only the source's already-public, non-missing items;
  -- it must never promote quarantine/rejection/stale/inactive state. Probe
  -- responses are deliberately excluded even when their upstream status is 304.
  IF NOT v_is_probe
     AND v_run.action = 'sync'
     AND p_status = 'not_modified'
     AND p_http_status = 304
     AND v_source.enabled
     AND v_source.review_state = 'approved'
     AND v_source.legal_review_status = 'approved'
     AND v_source.robots_allowed IS TRUE THEN
    UPDATE public.external_events e
    SET last_verified_at = now(),
        source_last_synced_at = now(),
        freshness_state = 'fresh',
        updated_at = now()
    WHERE e.external_source = 'feed'
      AND e.is_active = true
      AND e.import_state = 'active'
      AND e.freshness_state IN ('fresh', 'aging')
      AND e.event_date >= current_date
      AND e.external_url ~ '^https://[^[:space:]]+$'
      AND e.source_payload ->> 'feed_source_id' = p_source_id
      AND EXISTS (
        SELECT 1
        FROM public.external_event_feed_items i
        WHERE i.source_id = p_source_id
          AND i.external_event_id = e.id
          AND i.item_state = 'published'
          AND i.missing_successful_runs = 0
          AND i.last_missing_run_id IS NULL
      );
  END IF;

  IF v_full_snapshot THEN
    UPDATE public.external_event_feed_items i
    SET missing_successful_runs = 0,
        last_missing_run_id = NULL
    WHERE i.source_id = p_source_id
      AND i.run_id = p_run_id;

    WITH missed AS (
      UPDATE public.external_event_feed_items i
      SET missing_successful_runs = i.missing_successful_runs + 1,
          last_missing_run_id = p_run_id
      WHERE i.source_id = p_source_id
        AND i.item_state = 'published'
        AND i.external_event_id IS NOT NULL
        AND i.run_id <> p_run_id
        AND i.last_missing_run_id IS DISTINCT FROM p_run_id
      RETURNING i.external_event_id, i.missing_successful_runs
    )
    UPDATE public.external_events e
    SET is_active = false,
        freshness_state = 'stale',
        import_state = 'stale',
        updated_at = now()
    FROM missed m
    WHERE e.id = m.external_event_id
      AND e.external_source = 'feed'
      AND m.missing_successful_runs >= 3
      AND e.last_verified_at IS NOT NULL
      AND e.last_verified_at <= now() - GREATEST(
        interval '72 hours',
        make_interval(mins => 2 * v_source.poll_interval_minutes)
      );
  END IF;

  UPDATE public.external_event_feed_sources
  SET http_status = p_http_status,
      etag = CASE
        WHEN NOT v_is_probe AND v_success AND p_etag IS NOT NULL THEN left(p_etag, 1000)
        ELSE etag
      END,
      last_modified = CASE
        WHEN NOT v_is_probe AND v_success AND p_last_modified IS NOT NULL THEN left(p_last_modified, 500)
        ELSE last_modified
      END,
      last_checked_at = now(),
      last_successful_parse_at = CASE
        WHEN NOT v_is_probe AND v_success THEN now()
        ELSE last_successful_parse_at
      END,
      health_status = CASE
        WHEN v_is_probe THEN health_status
        WHEN v_success THEN 'healthy'
        WHEN v_failures < 3 THEN 'degraded'
        ELSE 'failing'
      END,
      consecutive_failures = v_failures,
      last_error_kind = CASE
        WHEN v_is_probe THEN last_error_kind
        WHEN v_success THEN NULL
        ELSE left(p_error_kind, 120)
      END,
      last_error_code = CASE
        WHEN v_is_probe THEN last_error_code
        WHEN v_success THEN NULL
        ELSE left(p_error_code, 120)
      END,
      next_poll_at = v_next_poll,
      next_retry_at = CASE
        WHEN v_is_probe THEN next_retry_at
        WHEN v_success THEN NULL
        ELSE v_next_poll
      END,
      lease_token = NULL,
      lease_worker = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE source_id = p_source_id AND lease_token = p_lease_token;

  IF NOT v_is_probe THEN
    UPDATE public.external_provider_state
    SET consecutive_failures = CASE WHEN v_success THEN 0 ELSE consecutive_failures + 1 END,
        last_success_at = CASE WHEN v_success THEN now() ELSE last_success_at END,
        last_error_at = CASE WHEN v_success THEN last_error_at ELSE now() END,
        last_error_kind = CASE WHEN v_success THEN NULL ELSE 'unknown' END,
        last_error_code = CASE WHEN v_success THEN NULL ELSE left(p_error_code, 120) END,
        updated_at = now()
    WHERE provider = 'event_feed';
  END IF;

  IF NOT v_is_probe AND p_published_count > 0 THEN
    PERFORM public.queue_external_event_dedupe_reviews();
  END IF;

  RETURN jsonb_build_object(
    'source_id', p_source_id,
    'run_id', p_run_id,
    'status', p_status,
    'snapshot_complete', v_full_snapshot,
    'next_poll_at', v_next_poll,
    'consecutive_failures', v_failures,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_external_event_feed_run(
  text, uuid, uuid, text, integer, text, text,
  integer, integer, integer, integer, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_external_event_feed_run(
  text, uuid, uuid, text, integer, text, text,
  integer, integer, integer, integer, text, text, text, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- Positive public reads re-check current source policy and source-specific
-- verification time. A denormalized fresh/aging flag alone is never enough.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.external_event_is_publicly_available(
  p_external_event_id uuid
)
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
      AND (
        e.external_source <> 'feed'
        OR EXISTS (
          SELECT 1
          FROM public.external_event_feed_sources s
          WHERE s.source_id = e.source_payload ->> 'feed_source_id'
            AND s.enabled = true
            AND s.review_state = 'approved'
            AND s.legal_review_status = 'approved'
            AND s.robots_allowed IS TRUE
            AND public.event_feed_url_host(s.endpoint_url) = ANY(s.fetch_hosts)
            AND e.last_verified_at IS NOT NULL
            AND e.last_verified_at >= now() - GREATEST(
              interval '72 hours',
              make_interval(mins => 2 * s.poll_interval_minutes)
            )
        )
      )
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
      AND (
        e.external_source <> 'feed'
        OR EXISTS (
          SELECT 1
          FROM public.external_event_feed_sources s
          WHERE s.source_id = e.source_payload ->> 'feed_source_id'
            AND s.enabled = true
            AND s.review_state = 'approved'
            AND s.legal_review_status = 'approved'
            AND s.robots_allowed IS TRUE
            AND public.event_feed_url_host(s.endpoint_url) = ANY(s.fetch_hosts)
            AND e.last_verified_at IS NOT NULL
            AND e.last_verified_at >= now() - GREATEST(
              interval '72 hours',
              make_interval(mins => 2 * s.poll_interval_minutes)
            )
        )
      )
    ORDER BY e.event_date, e.event_time NULLS LAST, e.id
    OFFSET (SELECT page_offset FROM bounds)
    LIMIT (SELECT page_limit + 1 FROM bounds)
  ), numbered AS (
    SELECT c.*, row_number() OVER (
      ORDER BY c.event_date, c.event_time NULLS LAST, c.id
    ) AS row_number
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

REVOKE ALL ON FUNCTION public.external_event_is_publicly_available(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_external_events_safe_page(date, integer, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_external_events_safe_page(date, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bounded raw retention. The owner-only helper is invoked by the dispatcher;
-- the service-only public RPC remains available for explicit operations/tests.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.external_event_feed_raw_retention_internal(
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
  WITH expired AS (
    SELECT raw.id
    FROM public.external_event_feed_raw_payloads raw
    WHERE raw.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.external_event_feed_items item
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

REVOKE ALL ON FUNCTION public.external_event_feed_raw_retention_internal(integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_external_event_feed_raw_payloads(
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN public.external_event_feed_raw_retention_internal(p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_external_event_feed_raw_payloads(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_external_event_feed_raw_payloads(integer)
  TO service_role;

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
  -- Bounded and idempotent: active quarantine work retains its raw evidence.
  PERFORM public.external_event_feed_raw_retention_internal(1000);

  v_project_url := public.resolve_internal_edge_function_base_url();
  SELECT COALESCE(
    (SELECT nullif(trim(decrypted_secret), '')
     FROM vault.decrypted_secrets
     WHERE name = 'event_feed_cron_hmac_secret' LIMIT 1),
    (SELECT nullif(trim(decrypted_secret), '')
     FROM vault.decrypted_secrets
     WHERE name = 'EVENT_FEED_CRON_HMAC_SECRET' LIMIT 1)
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
  v_signature := encode(
    hmac(v_issued_at::text || '.' || v_body_text, v_hmac_secret, 'sha256'),
    'hex'
  );

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

CREATE OR REPLACE FUNCTION public.schedule_external_event_feed_daily(
  p_cron text DEFAULT '*/2 * * * *'
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

REVOKE ALL ON FUNCTION public.dispatch_external_event_feed_due()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_external_event_feed_daily(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_external_event_feed_due()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_external_event_feed_daily(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
