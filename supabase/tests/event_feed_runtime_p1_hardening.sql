\set ON_ERROR_STOP on
BEGIN;

-- Requires 20260825100000_event_feed_runtime_p1_hardening.sql.
-- The fixture is intentionally self-rolling-back and covers cross-run raw
-- evidence, probe->approval validators, positive freshness, missing snapshots,
-- policy deactivation, bounded retention and the 185-source scheduler contract.

INSERT INTO auth.users (id)
VALUES ('a2510000-0000-4000-8000-000000000001');

INSERT INTO public.admin_operator_roles (user_id, role_key, grant_reason)
VALUES (
  'a2510000-0000-4000-8000-000000000001',
  'super_admin',
  'Event feed runtime P1 fixture'
)
ON CONFLICT (user_id, role_key) DO NOTHING;

INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, country_code, timezone, endpoint_url,
  original_endpoint_url, endpoint_kind, format, categories, fetch_hosts,
  review_state, legal_review_status, robots_allowed, enabled,
  poll_interval_minutes, min_publish_quality, next_poll_at, etag, last_modified
) VALUES (
  'p1_runtime_source', 'P1 Runtime Events', 'HU', 'Europe/Budapest',
  'https://p1-runtime.example.org/feed.xml',
  'p1-runtime.example.org/feed.xml', 'feed', 'RSS', ARRAY['community'],
  ARRAY['p1-runtime.example.org'], 'pending_review', 'pending', NULL, false,
  60, 80, now(), '"probe-validator"', 'Mon, 24 Aug 2026 08:00:00 GMT'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.external_event_feed_sources
    WHERE country_code = 'HU'
      AND review_state = 'pending_review'
      AND enabled = false
      AND timezone IS DISTINCT FROM 'Europe/Budapest'
  ) THEN
    RAISE EXCEPTION 'HU pending candidate timezone backfill is incomplete';
  END IF;
END;
$$;

-- Pending/disabled sources may only be probed. Even if a caller incorrectly
-- marks the response as a complete snapshot, DB action semantics keep it from
-- becoming publishing/freshness proof.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

SELECT *
FROM public.claim_external_event_feed_source(
  'p1_runtime_source', 'p1-probe-worker', 600, true
) \gset p1_probe_

SELECT public.store_external_event_feed_raw_payload(
  'p1_runtime_source', :'p1_probe_run_id', :'p1_probe_lease_token',
  'application/rss+xml', '<rss><fixture>same-body</fixture></rss>',
  '1e5a7f6a39761d023b4b3653dd81e944641c165484cb16e101d8f9353c7bf82e'
) AS raw_id \gset p1_probe_

SELECT *
FROM public.commit_external_event_feed_item(
  'p1_runtime_source', :'p1_probe_run_id', :'p1_probe_lease_token',
  'p1-event-a',
  jsonb_build_object(
    'title', 'P1 közösségi est',
    'event_date', (current_date + 30)::text,
    'external_url', 'https://p1-runtime.example.org/events/a',
    'category', 'community',
    'location_city', 'Budapest'
  ),
  100, '{}'::text[], :'p1_probe_raw_id'
) \gset p1_probe_item_

SELECT public.complete_external_event_feed_run(
  'p1_runtime_source', :'p1_probe_run_id', :'p1_probe_lease_token',
  'succeeded', 200, '"probe-response"',
  'Tue, 25 Aug 2026 08:00:00 GMT', 1, 1, 0, 0,
  NULL, NULL, NULL, true
);

SELECT set_config('fixture.p1_probe_run_action', :'p1_probe_run_action', true);
SELECT set_config('fixture.p1_probe_timezone', :'p1_probe_timezone', true);
SELECT set_config('fixture.p1_probe_item_state', :'p1_probe_item_item_state', true);
SELECT set_config('fixture.p1_probe_published', :'p1_probe_item_published', true);
SELECT set_config('fixture.p1_probe_run_id', :'p1_probe_run_id', true);
DO $$
BEGIN
  IF current_setting('fixture.p1_probe_run_action') <> 'probe'
     OR current_setting('fixture.p1_probe_timezone') <> 'Europe/Budapest'
     OR current_setting('fixture.p1_probe_item_state') <> 'quarantined'
     OR current_setting('fixture.p1_probe_published')::boolean THEN
    RAISE EXCEPTION 'probe escaped the quarantine boundary';
  END IF;
  IF (SELECT snapshot_complete
      FROM public.external_event_feed_runs
      WHERE id = current_setting('fixture.p1_probe_run_id')::uuid) THEN
    RAISE EXCEPTION 'probe became complete snapshot proof';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.external_event_feed_sources
    WHERE source_id = 'p1_runtime_source'
      AND (
        last_successful_parse_at IS NOT NULL
        OR etag IS DISTINCT FROM '"probe-validator"'
        OR last_modified IS DISTINCT FROM 'Mon, 24 Aug 2026 08:00:00 GMT'
      )
  ) THEN
    RAISE EXCEPTION 'probe mutated normal-sync validators or freshness proof';
  END IF;
END;
$$;

-- Make extension behavior observable inside this single transaction: now() is
-- transaction-stable, so shorten the first retention deadline before reuse.
UPDATE public.external_event_feed_raw_payloads
SET expires_at = now() + interval '1 day'
WHERE id = :'p1_probe_raw_id';

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  'a2510000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT public.admin_review_external_event_feed_source(
  'p1_runtime_source', 'approve',
  'P1 legal and robots evidence approved',
  'p1-runtime-request-0001', 'p1-runtime-idempotency-0001', true,
  ARRAY['p1-runtime.example.org'], 'approved', true, 60, 80
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.external_event_feed_sources
    WHERE source_id = 'p1_runtime_source'
      AND (
        etag IS NOT NULL
        OR last_modified IS NOT NULL
        OR next_poll_at > now()
        OR review_state <> 'approved'
        OR NOT enabled
      )
  ) THEN
    RAISE EXCEPTION 'probe approval did not clear validators and become due';
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.external_provider_state
SET enabled = true, circuit_state = 'closed', updated_at = now()
WHERE provider = 'event_feed';
SET LOCAL ROLE service_role;

-- The first normal sync receives the full body even after the probe. Reusing
-- the exact hash returns the same raw id, records a second run observation and
-- extends TTL; commit must not raise RAW_PAYLOAD_RUN_MISMATCH.
SELECT *
FROM public.claim_external_event_feed_source(
  'p1_runtime_source', 'p1-sync-worker-1', 600, false
) \gset p1_sync1_

SELECT public.store_external_event_feed_raw_payload(
  'p1_runtime_source', :'p1_sync1_run_id', :'p1_sync1_lease_token',
  'application/rss+xml', '<rss><fixture>same-body</fixture></rss>',
  '1e5a7f6a39761d023b4b3653dd81e944641c165484cb16e101d8f9353c7bf82e'
) AS raw_id \gset p1_sync1_

SELECT *
FROM public.commit_external_event_feed_item(
  'p1_runtime_source', :'p1_sync1_run_id', :'p1_sync1_lease_token',
  'p1-event-a',
  jsonb_build_object(
    'title', 'P1 közösségi est',
    'event_date', (current_date + 30)::text,
    'event_time', '19:00:00',
    'external_url', 'https://p1-runtime.example.org/events/a',
    'category', 'community',
    'tags', jsonb_build_array('community', 'budapest'),
    'location_type', 'address',
    'location_city', 'Budapest'
  ),
  100, '{}'::text[], :'p1_sync1_raw_id'
) \gset p1_event_a_

SELECT public.complete_external_event_feed_run(
  'p1_runtime_source', :'p1_sync1_run_id', :'p1_sync1_lease_token',
  'succeeded', 200, '"sync-validator"',
  'Tue, 25 Aug 2026 09:00:00 GMT', 1, 0, 1, 0,
  NULL, NULL, NULL, true
) AS completion \gset p1_sync1_

SELECT set_config('fixture.p1_probe_raw_id', :'p1_probe_raw_id', true);
SELECT set_config('fixture.p1_sync1_raw_id', :'p1_sync1_raw_id', true);
SELECT set_config('fixture.p1_event_a_published', :'p1_event_a_published', true);
SELECT set_config('fixture.p1_event_a_item_state', :'p1_event_a_item_state', true);
SELECT set_config('fixture.p1_event_a_external_event_id', :'p1_event_a_external_event_id', true);
DO $$
BEGIN
  IF current_setting('fixture.p1_probe_raw_id')::uuid
       <> current_setting('fixture.p1_sync1_raw_id')::uuid THEN
    RAISE EXCEPTION 'identical source/hash created a duplicate raw body';
  END IF;
  IF (SELECT count(*)
      FROM public.external_event_feed_raw_fetch_evidence
      WHERE raw_payload_id = current_setting('fixture.p1_sync1_raw_id')::uuid) <> 2 THEN
    RAISE EXCEPTION 'cross-run raw evidence is incomplete';
  END IF;
  IF (SELECT count(DISTINCT run_id)
      FROM public.external_event_feed_raw_fetch_evidence
      WHERE raw_payload_id = current_setting('fixture.p1_sync1_raw_id')::uuid) <> 2 THEN
    RAISE EXCEPTION 'raw evidence did not preserve both observing runs';
  END IF;
  IF (SELECT expires_at
      FROM public.external_event_feed_raw_payloads
      WHERE id = current_setting('fixture.p1_sync1_raw_id')::uuid) < now() + interval '14 days' THEN
    RAISE EXCEPTION 'raw body TTL was not renewed on a later observation';
  END IF;
  IF NOT current_setting('fixture.p1_event_a_published')::boolean
     OR current_setting('fixture.p1_event_a_item_state') <> 'published' THEN
    RAISE EXCEPTION 'normal sync did not publish the qualified event';
  END IF;
END;
$$;

-- Completion retries are true no-op replays and cannot double-apply missing.
SELECT public.complete_external_event_feed_run(
  'p1_runtime_source', :'p1_sync1_run_id', :'p1_sync1_lease_token',
  'succeeded', 200, '"sync-validator"',
  'Tue, 25 Aug 2026 09:00:00 GMT', 1, 0, 1, 0,
  NULL, NULL, NULL, true
) AS completion \gset p1_sync1_replay_

SELECT set_config(
  'fixture.p1_sync1_replay_completion',
  :'p1_sync1_replay_completion',
  true
);
DO $$
BEGIN
  IF NOT (current_setting('fixture.p1_sync1_replay_completion')::jsonb ->> 'replayed')::boolean THEN
    RAISE EXCEPTION 'terminal completion retry was not an idempotent replay';
  END IF;
END;
$$;

-- Direct raw/evidence reads remain unavailable to both client roles.
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM raw_body FROM public.external_event_feed_raw_payloads LIMIT 1;
    RAISE EXCEPTION 'anon read raw feed data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM * FROM public.external_event_feed_raw_fetch_evidence LIMIT 1;
    RAISE EXCEPTION 'anon read raw run evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM raw_body FROM public.external_event_feed_raw_payloads LIMIT 1;
    RAISE EXCEPTION 'authenticated read raw feed data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM * FROM public.external_event_feed_raw_fetch_evidence LIMIT 1;
    RAISE EXCEPTION 'authenticated read raw run evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

-- A normal HTTP 304 is positive freshness evidence for the already-published,
-- non-missing active set only. Guard rows model states a revalidation must not
-- legitimize even if corrupt/imported historical data links them to the source.
INSERT INTO public.external_events (
  external_source, external_id, external_url, title, category, event_date,
  source_payload, source_last_synced_at, is_active, last_verified_at,
  freshness_state, normalization_version, import_state
) VALUES
  (
    'feed', 'p1_runtime_source:guard-quarantined',
    'https://p1-runtime.example.org/events/guard-quarantined',
    'P1 quarantined guard', 'community', current_date + 30,
    jsonb_build_object('feed_source_id', 'p1_runtime_source'),
    now() - interval '4 days', false, now() - interval '4 days',
    'aging', 'event-feed-v1', 'active'
  ),
  (
    'feed', 'p1_runtime_source:guard-rejected',
    'https://p1-runtime.example.org/events/guard-rejected',
    'P1 rejected guard', 'community', current_date + 30,
    jsonb_build_object('feed_source_id', 'p1_runtime_source'),
    now() - interval '4 days', false, now() - interval '4 days',
    'aging', 'event-feed-v1', 'active'
  ),
  (
    'feed', 'p1_runtime_source:guard-stale',
    'https://p1-runtime.example.org/events/guard-stale',
    'P1 stale guard', 'community', current_date + 30,
    jsonb_build_object('feed_source_id', 'p1_runtime_source'),
    now() - interval '4 days', true, now() - interval '4 days',
    'stale', 'event-feed-v1', 'stale'
  ),
  (
    'feed', 'p1_runtime_source:guard-missing',
    'https://p1-runtime.example.org/events/guard-missing',
    'P1 missing guard', 'community', current_date + 30,
    jsonb_build_object('feed_source_id', 'p1_runtime_source'),
    now() - interval '4 days', true, now() - interval '4 days',
    'aging', 'event-feed-v1', 'active'
  );

INSERT INTO public.external_event_feed_items (
  source_id, source_item_id, run_id, source_identity_hash,
  normalized_payload, quality_score, item_state, external_event_id
)
SELECT
  'p1_runtime_source', guard.source_item_id, :'p1_sync1_run_id',
  encode(extensions.digest('p1_runtime_source' || E'\n' || guard.source_item_id, 'sha256'), 'hex'),
  '{}'::jsonb, 0, guard.item_state, e.id
FROM (VALUES
  ('p1-guard-quarantined', 'quarantined'),
  ('p1-guard-rejected', 'rejected'),
  ('p1-guard-stale', 'published'),
  ('p1-guard-missing', 'published')
) AS guard(source_item_id, item_state)
JOIN public.external_events e
  ON e.external_source = 'feed'
 AND e.external_id = 'p1_runtime_source:guard-' ||
   replace(guard.source_item_id, 'p1-guard-', '');

UPDATE public.external_event_feed_items
SET missing_successful_runs = 1,
    last_missing_run_id = :'p1_sync1_run_id'
WHERE source_id = 'p1_runtime_source'
  AND source_item_id = 'p1-guard-missing';

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
UPDATE public.external_events
SET last_verified_at = now() - interval '4 days',
    source_last_synced_at = now() - interval '4 days',
    freshness_state = 'aging',
    is_active = true,
    import_state = 'active'
WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid;

DO $$
DECLARE
  v_claim record;
  v_completion jsonb;
BEGIN
  SELECT * INTO STRICT v_claim
  FROM public.claim_external_event_feed_source(
    'p1_runtime_source', 'p1-not-modified-worker', 600, false
  );
  v_completion := public.complete_external_event_feed_run(
    'p1_runtime_source', v_claim.run_id, v_claim.lease_token,
    'not_modified', 304, '"sync-validator"',
    'Tue, 25 Aug 2026 09:00:00 GMT', 0, 0, 0, 0,
    NULL, NULL, NULL, false
  );

  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid
      AND (
        last_verified_at IS DISTINCT FROM now()
        OR source_last_synced_at IS DISTINCT FROM now()
        OR freshness_state <> 'fresh'
        OR NOT is_active
        OR import_state <> 'active'
      )
  ) THEN
    RAISE EXCEPTION 'normal HTTP 304 did not atomically revalidate published supply';
  END IF;
  IF (SELECT count(*)
      FROM public.external_events
      WHERE external_id LIKE 'p1_runtime_source:guard-%'
        AND last_verified_at = now() - interval '4 days') <> 4 THEN
    RAISE EXCEPTION 'HTTP 304 legitimized quarantined/rejected/stale/missing supply';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT public.external_event_is_publicly_available(
    current_setting('fixture.p1_event_a_external_event_id')::uuid
  ) THEN
    RAISE EXCEPTION 'normal HTTP 304 evidence did not preserve safe visibility';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_page jsonb;
BEGIN
  v_page := public.list_external_events_safe_page(current_date, 100, 0);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_page -> 'items') item
    WHERE item ->> 'id' = current_setting('fixture.p1_event_a_external_event_id')
  ) THEN
    RAISE EXCEPTION 'normal HTTP 304 event missing from safe list';
  END IF;
END;
$$;
RESET ROLE;

-- The same upstream 304 through a probe is diagnostic only and must not renew
-- event/source freshness proof.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
UPDATE public.external_events
SET last_verified_at = now() - interval '4 days',
    source_last_synced_at = now() - interval '4 days',
    freshness_state = 'aging'
WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid;

DO $$
DECLARE
  v_claim record;
  v_completion jsonb;
BEGIN
  SELECT * INTO STRICT v_claim
  FROM public.claim_external_event_feed_source(
    'p1_runtime_source', 'p1-probe-304-worker', 600, true
  );
  v_completion := public.complete_external_event_feed_run(
    'p1_runtime_source', v_claim.run_id, v_claim.lease_token,
    'not_modified', 304, '"probe-304-validator"',
    'Tue, 25 Aug 2026 10:00:00 GMT', 0, 0, 0, 0,
    NULL, NULL, NULL, false
  );
  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid
      AND (
        last_verified_at IS DISTINCT FROM now() - interval '4 days'
        OR source_last_synced_at IS DISTINCT FROM now() - interval '4 days'
        OR freshness_state <> 'aging'
      )
  ) THEN
    RAISE EXCEPTION 'probe HTTP 304 refreshed public freshness proof';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF public.external_event_is_publicly_available(
    current_setting('fixture.p1_event_a_external_event_id')::uuid
  ) THEN
    RAISE EXCEPTION 'probe HTTP 304 kept an expired event publicly available';
  END IF;
END;
$$;

-- A stale last_verified_at is hidden immediately even if denormalized flags are
-- still active/fresh. Missing deactivation then requires three distinct full,
-- successful sync snapshots; partial/failed/probe runs never enter this path.
UPDATE public.external_events
SET last_verified_at = now() - interval '4 days',
    is_active = true,
    freshness_state = 'fresh',
    import_state = 'active'
WHERE id = :'p1_event_a_external_event_id';

DO $$
BEGIN
  IF public.external_event_is_publicly_available(
    current_setting('fixture.p1_event_a_external_event_id')::uuid
  ) THEN
    RAISE EXCEPTION 'source-specific last_verified freshness failed closed';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_page jsonb;
BEGIN
  v_page := public.list_external_events_safe_page(current_date, 100, 0);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_page -> 'items') item
    WHERE item ->> 'id' = current_setting('fixture.p1_event_a_external_event_id')
  ) THEN
    RAISE EXCEPTION 'safe list exposed a feed event outside its source window';
  END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_iteration integer;
  v_claim record;
  v_commit record;
  v_completion jsonb;
  v_counter integer;
BEGIN
  FOR v_iteration IN 1..3 LOOP
    UPDATE public.external_event_feed_sources
    SET next_poll_at = now(), next_retry_at = NULL
    WHERE source_id = 'p1_runtime_source';

    SELECT * INTO STRICT v_claim
    FROM public.claim_external_event_feed_source(
      'p1_runtime_source', 'p1-missing-worker-' || v_iteration, 600, false
    );
    IF v_claim.run_action <> 'sync' THEN
      RAISE EXCEPTION 'missing snapshot claim did not return sync action';
    END IF;

    SELECT * INTO STRICT v_commit
    FROM public.commit_external_event_feed_item(
      'p1_runtime_source', v_claim.run_id, v_claim.lease_token,
      'p1-event-b',
      jsonb_build_object(
        'title', 'P1 társasjáték délután',
        'event_date', (current_date + 31)::text,
        'external_url', 'https://p1-runtime.example.org/events/b',
        'category', 'community',
        'location_city', 'Budapest'
      ),
      100, '{}'::text[], NULL
    );

    v_completion := public.complete_external_event_feed_run(
      'p1_runtime_source', v_claim.run_id, v_claim.lease_token,
      'succeeded', 200, NULL, NULL, 1, 0, 1, 0,
      NULL, NULL, NULL, true
    );

    SELECT missing_successful_runs INTO v_counter
    FROM public.external_event_feed_items
    WHERE source_id = 'p1_runtime_source'
      AND source_item_id = 'p1-event-a';
    IF v_counter <> v_iteration THEN
      RAISE EXCEPTION 'missing counter %, expected %', v_counter, v_iteration;
    END IF;
    IF v_iteration < 3 AND NOT EXISTS (
      SELECT 1 FROM public.external_events
      WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'event deactivated before three complete misses';
    END IF;

    IF v_iteration = 1 THEN
      v_completion := public.complete_external_event_feed_run(
        'p1_runtime_source', v_claim.run_id, v_claim.lease_token,
        'succeeded', 200, NULL, NULL, 1, 0, 1, 0,
        NULL, NULL, NULL, true
      );
      IF NOT (v_completion ->> 'replayed')::boolean THEN
        RAISE EXCEPTION 'missing-run completion retry was not replayed';
      END IF;
      IF (SELECT missing_successful_runs
          FROM public.external_event_feed_items
          WHERE source_id = 'p1_runtime_source'
            AND source_item_id = 'p1-event-a') <> 1 THEN
        RAISE EXCEPTION 'completion replay double-counted a missing event';
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE id = current_setting('fixture.p1_event_a_external_event_id')::uuid
      AND (is_active = true OR freshness_state <> 'stale' OR import_state <> 'stale')
  ) THEN
    RAISE EXCEPTION 'three old complete misses did not deactivate the event';
  END IF;
END;
$$;

-- Pause, reject and plain disable all deactivate published feed supply in the
-- same transaction. Current source policy is also re-checked by positive RPCs.
UPDATE public.external_event_feed_sources
SET review_state = 'paused', enabled = false
WHERE source_id = 'p1_runtime_source';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.external_events e
    WHERE e.external_source = 'feed'
      AND e.source_payload ->> 'feed_source_id' = 'p1_runtime_source'
      AND (e.is_active = true OR e.freshness_state <> 'stale')
  ) THEN
    RAISE EXCEPTION 'paused source retained active public supply';
  END IF;
END;
$$;

-- Deliberately corrupt the denormalized event flags: the safe contract must
-- still fail closed because the source itself is paused.
UPDATE public.external_events
SET is_active = true,
    freshness_state = 'fresh',
    import_state = 'active',
    last_verified_at = now()
WHERE external_source = 'feed'
  AND source_payload ->> 'feed_source_id' = 'p1_runtime_source'
  AND external_id LIKE 'p1_runtime_source:%';

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.external_events e
    WHERE e.external_source = 'feed'
      AND e.source_payload ->> 'feed_source_id' = 'p1_runtime_source'
      AND public.external_event_is_publicly_available(e.id)
  ) THEN
    RAISE EXCEPTION 'positive availability ignored current source policy';
  END IF;
END;
$$;

INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, endpoint_url, original_endpoint_url,
  endpoint_kind, format, fetch_hosts, review_state, legal_review_status,
  robots_allowed, enabled, poll_interval_minutes, next_poll_at
) VALUES
  (
    'p1_reject_source', 'P1 Reject Source',
    'https://p1-reject.example.org/feed.xml', 'p1-reject.example.org/feed.xml',
    'feed', 'RSS', ARRAY['p1-reject.example.org'],
    'approved', 'approved', true, true, 60, now() + interval '1 day'
  ),
  (
    'p1_disable_source', 'P1 Disable Source',
    'https://p1-disable.example.org/feed.xml', 'p1-disable.example.org/feed.xml',
    'feed', 'RSS', ARRAY['p1-disable.example.org'],
    'approved', 'approved', true, true, 60, now() + interval '1 day'
  );

INSERT INTO public.external_events (
  external_source, external_id, external_url, title, category, event_date,
  source_payload, source_last_synced_at, is_active, last_verified_at,
  freshness_state, normalization_version, import_state
) VALUES
  (
    'feed', 'p1_reject_source:fixture',
    'https://p1-reject.example.org/events/fixture', 'P1 reject fixture',
    'community', current_date + 20,
    jsonb_build_object('feed_source_id', 'p1_reject_source'),
    now(), true, now(), 'fresh', 'event-feed-v1', 'active'
  ),
  (
    'feed', 'p1_disable_source:fixture',
    'https://p1-disable.example.org/events/fixture', 'P1 disable fixture',
    'community', current_date + 20,
    jsonb_build_object('feed_source_id', 'p1_disable_source'),
    now(), true, now(), 'fresh', 'event-feed-v1', 'active'
  );

UPDATE public.external_event_feed_sources
SET review_state = 'rejected', enabled = false
WHERE source_id = 'p1_reject_source';
UPDATE public.external_event_feed_sources
SET enabled = false
WHERE source_id = 'p1_disable_source';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE external_id = 'p1_reject_source:fixture'
      AND (is_active = true OR import_state <> 'rejected')
  ) THEN
    RAISE EXCEPTION 'rejected source retained active/non-rejected supply';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE external_id = 'p1_disable_source:fixture'
      AND (is_active = true OR import_state <> 'stale')
  ) THEN
    RAISE EXCEPTION 'disabled source retained active/non-stale supply';
  END IF;
END;
$$;

-- Bounded retention deletes expired, inactive raw evidence, cascades its run
-- evidence, and preserves raw bodies still backing active quarantine work.
INSERT INTO public.external_event_feed_runs (
  id, source_id, lease_token, worker_id, action, status, finished_at
) VALUES
  (
    'a2510000-0000-4000-8000-000000000101', 'p1_runtime_source',
    'a2510000-0000-4000-8000-000000000111', 'p1-retention-worker-1',
    'sync', 'succeeded', now()
  ),
  (
    'a2510000-0000-4000-8000-000000000102', 'p1_runtime_source',
    'a2510000-0000-4000-8000-000000000112', 'p1-retention-worker-2',
    'sync', 'succeeded', now()
  );

INSERT INTO public.external_event_feed_raw_payloads (
  id, source_id, run_id, payload_sha256, content_type, raw_body, expires_at
) VALUES
  (
    'a2510000-0000-4000-8000-000000000121', 'p1_runtime_source',
    'a2510000-0000-4000-8000-000000000101', repeat('c', 64),
    'application/rss+xml', '<rss>expired-unused</rss>', now() - interval '1 day'
  ),
  (
    'a2510000-0000-4000-8000-000000000122', 'p1_runtime_source',
    'a2510000-0000-4000-8000-000000000102', repeat('d', 64),
    'application/rss+xml', '<rss>expired-active</rss>', now() - interval '1 day'
  );

INSERT INTO public.external_event_feed_raw_fetch_evidence (
  run_id, raw_payload_id, source_id, payload_sha256
) VALUES
  (
    'a2510000-0000-4000-8000-000000000101',
    'a2510000-0000-4000-8000-000000000121',
    'p1_runtime_source', repeat('c', 64)
  ),
  (
    'a2510000-0000-4000-8000-000000000102',
    'a2510000-0000-4000-8000-000000000122',
    'p1_runtime_source', repeat('d', 64)
  );

INSERT INTO public.external_event_feed_items (
  source_id, source_item_id, run_id, raw_payload_id, source_identity_hash,
  normalized_payload, quality_score, item_state
) VALUES (
  'p1_runtime_source', 'p1-retention-active',
  'a2510000-0000-4000-8000-000000000102',
  'a2510000-0000-4000-8000-000000000122', repeat('e', 64),
  '{}'::jsonb, 0, 'discovered'
);

DO $$
DECLARE
  v_deleted integer;
BEGIN
  v_deleted := public.purge_expired_external_event_feed_raw_payloads(100);
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'bounded retention deleted %, expected 1', v_deleted;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.external_event_feed_raw_payloads
    WHERE id = 'a2510000-0000-4000-8000-000000000121'
  ) OR EXISTS (
    SELECT 1 FROM public.external_event_feed_raw_fetch_evidence
    WHERE raw_payload_id = 'a2510000-0000-4000-8000-000000000121'
  ) THEN
    RAISE EXCEPTION 'expired inactive raw/evidence survived retention';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.external_event_feed_raw_payloads
    WHERE id = 'a2510000-0000-4000-8000-000000000122'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.external_event_feed_raw_fetch_evidence
    WHERE raw_payload_id = 'a2510000-0000-4000-8000-000000000122'
  ) THEN
    RAISE EXCEPTION 'active work-item raw/evidence was purged';
  END IF;
  IF public.purge_expired_external_event_feed_raw_payloads(100) <> 0 THEN
    RAISE EXCEPTION 'bounded retention was not idempotent';
  END IF;
END;
$$;

-- The SQL claim contract supports repeated batches. With the explicit two-
-- minute scheduler default and a 3x10 bounded handler, 185 due sources drain in
-- seven invocations (<15 minutes) instead of being stranded after ten.
INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, endpoint_url, original_endpoint_url,
  endpoint_kind, format, fetch_hosts, review_state, legal_review_status,
  robots_allowed, enabled, poll_interval_minutes, next_poll_at
)
SELECT
  format('p1_batch_%s', g),
  format('P1 Batch Publisher %s', g),
  format('https://p1-batch-%s.example.org/feed.xml', g),
  format('p1-batch-%s.example.org/feed.xml', g),
  'feed', 'RSS', ARRAY[format('p1-batch-%s.example.org', g)],
  'approved', 'approved', true, true, 60, now()
FROM generate_series(1, 25) AS g;

CREATE TEMP TABLE p1_claimed_batches (
  batch_no integer NOT NULL,
  run_id uuid NOT NULL,
  source_id text NOT NULL,
  run_action text NOT NULL
) ON COMMIT DROP;

INSERT INTO p1_claimed_batches
SELECT 1, run_id, source_id, run_action
FROM public.claim_external_event_feed_sources(10, 'p1-batch-worker-1', 600);
INSERT INTO p1_claimed_batches
SELECT 2, run_id, source_id, run_action
FROM public.claim_external_event_feed_sources(10, 'p1-batch-worker-2', 600);
INSERT INTO p1_claimed_batches
SELECT 3, run_id, source_id, run_action
FROM public.claim_external_event_feed_sources(10, 'p1-batch-worker-3', 600);
INSERT INTO p1_claimed_batches
SELECT 4, run_id, source_id, run_action
FROM public.claim_external_event_feed_sources(10, 'p1-batch-worker-4', 600);

DO $$
DECLARE
  v_schedule_args text;
  v_dispatch_def text;
BEGIN
  IF (SELECT count(*) FROM p1_claimed_batches WHERE batch_no = 1) <> 10
     OR (SELECT count(*) FROM p1_claimed_batches WHERE batch_no = 2) <> 10
     OR (SELECT count(*) FROM p1_claimed_batches WHERE batch_no = 3) <> 5
     OR (SELECT count(*) FROM p1_claimed_batches WHERE batch_no = 4) <> 0
     OR (SELECT count(DISTINCT source_id) FROM p1_claimed_batches) <> 25
     OR EXISTS (SELECT 1 FROM p1_claimed_batches WHERE run_action <> 'sync') THEN
    RAISE EXCEPTION 'repeated due claims did not drain 10/10/5 uniquely';
  END IF;

  SELECT pg_get_function_arguments(p.oid) INTO v_schedule_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'schedule_external_event_feed_daily'
    AND pg_get_function_identity_arguments(p.oid) = 'p_cron text';
  IF v_schedule_args NOT LIKE '%*/2 * * * *%' THEN
    RAISE EXCEPTION 'operator scheduler default is not two-minute due dispatch';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_dispatch_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'dispatch_external_event_feed_due'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_dispatch_def !~ '''limit''[[:space:]]*,[[:space:]]*10'
     OR v_dispatch_def NOT LIKE '%external_event_feed_raw_retention_internal(1000)%' THEN
    RAISE EXCEPTION 'dispatcher lost limit=10 or automatic bounded retention';
  END IF;
END;
$$;

-- Runtime proof for the pg_net contract: the dispatcher must actually pass the
-- 90-second timeout, not merely contain a matching source-code fragment. These
-- local extension tables and the fixture-only Vault secret roll back below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'event_feed_cron_hmac_secret'
  ) THEN
    IF to_regclass('vault.secrets') IS NOT NULL THEN
      EXECUTE
        'INSERT INTO vault.secrets (secret, name, description) VALUES ($1, $2, $3)'
      USING repeat('f', 64), 'event_feed_cron_hmac_secret',
        'P1 dispatcher timeout fixture only';
    ELSE
      -- Compatibility with the minimal isolated-PostgreSQL Vault stand-in.
      INSERT INTO vault.decrypted_secrets (name, decrypted_secret)
      VALUES ('event_feed_cron_hmac_secret', repeat('f', 64));
    END IF;
  END IF;
END;
$$;
DELETE FROM net.stub_calls;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT public.dispatch_external_event_feed_due() AS request_id \gset p1_dispatch_
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM net.stub_calls) <> 1 THEN
    RAISE EXCEPTION 'dispatcher did not emit exactly one stubbed HTTP request';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM net.stub_calls call
    WHERE call.method = 'POST'
      AND call.timeout_milliseconds = 90000
      AND call.body ->> 'action' = 'sync_due'
      AND (call.body ->> 'limit')::integer = 10
  ) THEN
    RAISE EXCEPTION 'dispatcher runtime timeout is not 90000 milliseconds';
  END IF;
END;
$$;

ROLLBACK;
\echo EVENT_FEED_RUNTIME_P1_HARDENING_PASS
