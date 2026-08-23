\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id) VALUES ('94000000-0000-4000-8000-000000000001');
INSERT INTO public.profiles (user_id, display_name, user_origin, is_active)
VALUES ('94000000-0000-4000-8000-000000000001', 'P1508 operator', 'real', true)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  user_origin = EXCLUDED.user_origin,
  is_active = EXCLUDED.is_active;
INSERT INTO public.admin_operator_roles (user_id, role_key, grant_reason)
VALUES ('94000000-0000-4000-8000-000000000001', 'super_admin', 'P1508 fixture')
ON CONFLICT (user_id, role_key) DO NOTHING;

INSERT INTO public.external_provider_state (provider, enabled, circuit_state)
VALUES ('eventbrite', true, 'closed')
ON CONFLICT (provider) DO UPDATE SET enabled = true, circuit_state = 'closed';
INSERT INTO public.external_provider_sync_runs (id, provider, action, status, started_by)
VALUES (
  '95000000-0000-4000-8000-000000000001', 'eventbrite', 'search_events', 'failed',
  '94000000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.consume_edge_rate_limit(
      'eventbrite.search_events', repeat('a', 64), 60, 2
    );
    RAISE EXCEPTION 'authenticated user consumed service-only rate bucket';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.consume_edge_rate_limit(
    'eventbrite.search_events', repeat('a', 64), 60, 2
  );
  IF NOT v_row.allowed OR v_row.remaining <> 1 THEN RAISE EXCEPTION 'first rate token incorrect'; END IF;
  SELECT * INTO v_row FROM public.consume_edge_rate_limit(
    'eventbrite.search_events', repeat('a', 64), 60, 2
  );
  IF NOT v_row.allowed OR v_row.remaining <> 0 THEN RAISE EXCEPTION 'second rate token incorrect'; END IF;
  SELECT * INTO v_row FROM public.consume_edge_rate_limit(
    'eventbrite.search_events', repeat('a', 64), 60, 2
  );
  IF v_row.allowed OR v_row.retry_after_seconds < 1 THEN RAISE EXCEPTION 'rate limit did not close'; END IF;
END $$;

SELECT public.record_external_provider_cost(
  '95000000-0000-4000-8000-000000000001', 'eventbrite', 2.5
);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT cost_units FROM public.external_provider_sync_runs
      WHERE id = '95000000-0000-4000-8000-000000000001') <> 2.5 THEN
    RAISE EXCEPTION 'run cost not recorded';
  END IF;
  IF (SELECT estimated_cost_units FROM public.external_provider_state
      WHERE provider = 'eventbrite') < 2.5 THEN
    RAISE EXCEPTION 'provider cost not accumulated';
  END IF;
END $$;

SET LOCAL ROLE service_role;
SELECT public.record_external_provider_dead_letter(
  '95000000-0000-4000-8000-000000000001', 'eventbrite', 'search_events',
  'timeout', 'provider_failure', repeat('b', 64),
  '{"correlation_id":"fixture-safe"}'::jsonb
) AS dead_letter_id \gset

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT public.admin_request_external_provider_replay(
  :'dead_letter_id', 'Operator verified provider recovery', 'request-p1508-0001', 'idem-p1508-0001'
);
SELECT public.admin_request_external_provider_replay(
  :'dead_letter_id', 'Operator verified provider recovery', 'request-p1508-0001', 'idem-p1508-0001'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v_claim record;
BEGIN
  SELECT * INTO v_claim FROM public.claim_external_provider_replays(10) LIMIT 1;
  IF v_claim.dead_letter_id IS NULL OR v_claim.provider <> 'eventbrite' THEN
    RAISE EXCEPTION 'dead letter replay was not claimed';
  END IF;
  PERFORM public.resolve_external_provider_dead_letter(v_claim.dead_letter_id, true, NULL);
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT state FROM public.external_provider_dead_letters
      WHERE run_id = '95000000-0000-4000-8000-000000000001'
      ORDER BY created_at DESC LIMIT 1) <> 'resolved' THEN
    RAISE EXCEPTION 'dead letter was not resolved';
  END IF;
  IF (SELECT count(*) FROM public.admin_audit_log
      WHERE idempotency_key = 'provider-replay:idem-p1508-0001') <> 1 THEN
    RAISE EXCEPTION 'replay audit is not idempotent';
  END IF;
END $$;

ROLLBACK;
\echo PROVIDER_RATE_COST_DEAD_LETTER_PASS
