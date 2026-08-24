\set ON_ERROR_STOP on
BEGIN;

-- Permission regression: the historical Vault resolver and every local-places
-- scheduler/enqueue entry point must be service-only.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.resolve_internal_service_role_key()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolve_internal_service_role_key()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service-role Vault resolver is executable by a client role';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.resolve_internal_service_role_key()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute Vault resolver';
  END IF;
  IF has_function_privilege('anon', 'public.enqueue_local_places_batch(boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enqueue_local_places_batch(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'local places enqueue is executable by a client role';
  END IF;
  IF has_table_privilege('anon', 'public.external_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.external_events', 'SELECT') THEN
    RAISE EXCEPTION 'external_events direct SELECT is still granted to a client role';
  END IF;
  IF has_table_privilege('anon', 'public.external_event_feed_raw_payloads', 'SELECT')
     OR has_table_privilege('authenticated', 'public.external_event_feed_raw_payloads', 'SELECT') THEN
    RAISE EXCEPTION 'raw feed payload SELECT is granted to a client role';
  END IF;
END;
$$;

INSERT INTO auth.users (id)
VALUES ('a1500000-0000-4000-8000-000000000001');

INSERT INTO public.admin_operator_roles (user_id, role_key, grant_reason)
VALUES (
  'a1500000-0000-4000-8000-000000000001',
  'super_admin',
  'Event feed publish safety fixture'
)
ON CONFLICT (user_id, role_key) DO NOTHING;

INSERT INTO public.external_event_feed_sources (
  source_id, publisher_name, country_code, endpoint_url,
  original_endpoint_url, endpoint_kind, format, categories, fetch_hosts,
  review_state, legal_review_status, robots_allowed, enabled,
  poll_interval_minutes, min_publish_quality, next_poll_at
) VALUES (
  'fixture_event_feed', 'Fixture Events', 'HU',
  'https://events.example.org/feed.xml', 'events.example.org/feed.xml',
  'feed', 'RSS', ARRAY['music'], ARRAY['events.example.org'],
  'pending_review', 'pending', NULL, false, 1440, 80, now()
);

-- A manual probe may fetch a pending/disabled source, but commit is forced into
-- quarantine and must never create an external event.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

SELECT *
FROM public.claim_external_event_feed_source(
  'fixture_event_feed', 'fixture-probe-worker', 600, true
) \gset probe_

SELECT set_config('fixture.probe_run_action', :'probe_run_action', true);
DO $$
BEGIN
  IF current_setting('fixture.probe_run_action') <> 'probe' THEN
    RAISE EXCEPTION 'manual probe claim did not identify probe action';
  END IF;
END;
$$;

SELECT public.store_external_event_feed_raw_payload(
  'fixture_event_feed', :'probe_run_id', :'probe_lease_token',
  'application/rss+xml', '<rss><fixture>probe</fixture></rss>',
  encode(digest('<rss><fixture>probe</fixture></rss>', 'sha256'), 'hex')
) AS raw_id \gset probe_

SELECT *
FROM public.commit_external_event_feed_item(
  'fixture_event_feed', :'probe_run_id', :'probe_lease_token',
  'fixture-item-1',
  jsonb_build_object(
    'title', 'Fixture koncert',
    'event_date', (current_date + 10)::text,
    'event_time', '19:00:00',
    'external_url', 'https://events.example.org/events/fixture-1',
    'category', 'music',
    'tags', jsonb_build_array('concert'),
    'location_city', 'Budapest',
    'image_url', 'javascript:invalid-image'
  ),
  100, '{}'::text[], :'probe_raw_id'
) \gset probe_item_

SELECT set_config('fixture.probe_item_state', :'probe_item_item_state', true);
SELECT set_config('fixture.probe_published', :'probe_item_published', true);

DO $$
BEGIN
  IF current_setting('fixture.probe_item_state') <> 'quarantined'
     OR current_setting('fixture.probe_published')::boolean THEN
    RAISE EXCEPTION 'probe item escaped quarantine';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.external_events
    WHERE external_source = 'feed' AND title = 'Fixture koncert'
  ) THEN
    RAISE EXCEPTION 'probe created a public external event';
  END IF;
END;
$$;

SELECT public.complete_external_event_feed_run(
  'fixture_event_feed', :'probe_run_id', :'probe_lease_token', 'succeeded',
  200, '"fixture-probe"', 'Tue, 25 Aug 2026 08:00:00 GMT', 1, 1, 0, 0
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM raw_body FROM public.external_event_feed_raw_payloads LIMIT 1;
    RAISE EXCEPTION 'anon read a raw feed payload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM normalized_payload FROM public.external_event_feed_items LIMIT 1;
    RAISE EXCEPTION 'anon directly read the feed quarantine';
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
    RAISE EXCEPTION 'authenticated role read a raw feed payload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- Explicit admin approval supplies legal/robots evidence and exact fetch hosts.
SELECT set_config('request.jwt.claim.sub', 'a1500000-0000-4000-8000-000000000001', true);
SELECT public.admin_review_external_event_feed_source(
  'fixture_event_feed', 'approve', 'Fixture legal and robots evidence reviewed',
  'fixture-request-0001', 'fixture-idempotency-0001', true,
  ARRAY['events.example.org'], 'approved', true, 1440, 80
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

UPDATE public.external_provider_state
SET enabled = true, circuit_state = 'closed', updated_at = now()
WHERE provider = 'event_feed';
UPDATE public.external_event_feed_sources
SET next_poll_at = now(), next_retry_at = NULL
WHERE source_id = 'fixture_event_feed';

SET LOCAL ROLE service_role;
SELECT *
FROM public.claim_external_event_feed_sources(10, 'fixture-sync-worker', 600)
WHERE source_id = 'fixture_event_feed'
\gset sync_

SELECT set_config('fixture.sync_run_action', :'sync_run_action', true);

-- A live lease cannot be claimed again (lease/idempotency boundary).
DO $$
BEGIN
  IF current_setting('fixture.sync_run_action') <> 'sync' THEN
    RAISE EXCEPTION 'due claim did not identify sync action';
  END IF;
  BEGIN
    PERFORM * FROM public.claim_external_event_feed_source(
      'fixture_event_feed', 'fixture-second-worker', 600, false
    );
    RAISE EXCEPTION 'second worker acquired an active lease';
  EXCEPTION WHEN lock_not_available THEN
    NULL;
  END;
END;
$$;

SELECT public.store_external_event_feed_raw_payload(
  'fixture_event_feed', :'sync_run_id', :'sync_lease_token',
  'application/rss+xml', '<rss><fixture>publish</fixture></rss>',
  encode(digest('<rss><fixture>publish</fixture></rss>', 'sha256'), 'hex')
) AS raw_id \gset sync_

SELECT *
FROM public.commit_external_event_feed_item(
  'fixture_event_feed', :'sync_run_id', :'sync_lease_token',
  'fixture-item-1',
  jsonb_build_object(
    'title', 'Fixture koncert',
    'event_date', (current_date + 10)::text,
    'event_time', '19:00:00',
    'external_url', 'https://events.example.org/events/fixture-1',
    'category', 'music',
    'tags', jsonb_build_array('concert', 'community'),
    'description', 'Safe normalized fixture description',
    'location_type', 'address',
    'location_city', 'Budapest',
    'image_url', 'javascript:invalid-image'
  ),
  100, '{}'::text[], :'sync_raw_id'
) \gset first_

SELECT *
FROM public.commit_external_event_feed_item(
  'fixture_event_feed', :'sync_run_id', :'sync_lease_token',
  'fixture-item-1',
  jsonb_build_object(
    'title', 'Fixture koncert',
    'event_date', (current_date + 10)::text,
    'event_time', '19:00:00',
    'external_url', 'https://events.example.org/events/fixture-1',
    'category', 'music',
    'tags', jsonb_build_array('concert', 'community'),
    'description', 'Safe normalized fixture description',
    'location_type', 'address',
    'location_city', 'Budapest',
    'image_url', 'javascript:invalid-image'
  ),
  100, '{}'::text[], :'sync_raw_id'
) \gset second_

SELECT set_config('fixture.first_published', :'first_published', true);
SELECT set_config('fixture.first_item_state', :'first_item_state', true);
SELECT set_config('fixture.first_external_event_id', :'first_external_event_id', true);
SELECT set_config('fixture.second_external_event_id', :'second_external_event_id', true);
SELECT set_config('fixture.first_feed_item_id', :'first_feed_item_id', true);
SELECT set_config('fixture.second_feed_item_id', :'second_feed_item_id', true);

DO $$
DECLARE
  v_external_event_id uuid := current_setting('fixture.first_external_event_id')::uuid;
BEGIN
  IF NOT current_setting('fixture.first_published')::boolean
     OR current_setting('fixture.first_item_state') <> 'published' THEN
    RAISE EXCEPTION 'quality-qualified item was not published';
  END IF;
  IF current_setting('fixture.first_external_event_id')::uuid
       <> current_setting('fixture.second_external_event_id')::uuid
     OR current_setting('fixture.first_feed_item_id')::uuid
       <> current_setting('fixture.second_feed_item_id')::uuid THEN
    RAISE EXCEPTION 'feed item commit is not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.external_events
      WHERE external_source = 'feed' AND title = 'Fixture koncert') <> 1 THEN
    RAISE EXCEPTION 'namespaced feed identity produced duplicate external events';
  END IF;
  IF (SELECT image_url FROM public.external_events WHERE id = v_external_event_id) IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe image URL reached external_events';
  END IF;
END;
$$;

SELECT public.complete_external_event_feed_run(
  'fixture_event_feed', :'sync_run_id', :'sync_lease_token', 'succeeded',
  200, '"fixture-publish"', 'Tue, 25 Aug 2026 09:00:00 GMT', 1, 0, 1, 0
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_page jsonb;
BEGIN
  v_page := public.list_external_events_safe_page(current_date, 100, 0);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_page -> 'items') item
    WHERE item ->> 'title' = 'Fixture koncert'
  ) THEN
    RAISE EXCEPTION 'published feed event missing from positive safe RPC';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_page -> 'items') item
    WHERE item ? 'source_payload'
  ) THEN
    RAISE EXCEPTION 'safe external event RPC leaked source_payload';
  END IF;
END;
$$;
RESET ROLE;

-- One-time cron dispatch consumption: the same signed body digest cannot replay.
INSERT INTO public.external_event_feed_cron_dispatches (
  nonce, issued_at_epoch, body_sha256
) VALUES (
  'a1500000-0000-4000-8000-000000000099',
  floor(extract(epoch FROM clock_timestamp()))::bigint,
  repeat('a', 64)
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_epoch bigint;
BEGIN
  SELECT issued_at_epoch INTO v_epoch
  FROM public.external_event_feed_cron_dispatches
  WHERE nonce = 'a1500000-0000-4000-8000-000000000099';
  IF NOT public.consume_external_event_feed_cron_dispatch(
    'a1500000-0000-4000-8000-000000000099', v_epoch, repeat('a', 64)
  ) THEN
    RAISE EXCEPTION 'valid cron dispatch was not consumed';
  END IF;
  IF public.consume_external_event_feed_cron_dispatch(
    'a1500000-0000-4000-8000-000000000099', v_epoch, repeat('a', 64)
  ) THEN
    RAISE EXCEPTION 'cron dispatch replay was accepted';
  END IF;
END;
$$;

ROLLBACK;
\echo EVENT_FEED_REGISTRY_PUBLISH_SAFETY_PASS
