-- Hobbeast production prompt pack: cross-domain RLS and kill-switch regression.
-- Run after migrations 20260822010100 through 20260822150100 on an isolated
-- Supabase/PostgreSQL database. The transaction rolls every fixture and grant back.

BEGIN;

DO $structural_checks$
DECLARE
  missing_rls text[];
  unsafe_function text;
  unexpected_public_column text;
BEGIN
  SELECT array_agg(required_table ORDER BY required_table)
    INTO missing_rls
  FROM unnest(ARRAY[
    'account_activity_events',
    'admin_audit_log',
    'ai_event_proposals',
    'consent_records',
    'data_subject_requests',
    'event_encounters',
    'feature_flags',
    'moderation_cases',
    'notification_delivery_attempts',
    'operations_inbox_items',
    'product_analytics_events',
    'social_circles',
    'user_blocks',
    'user_reports',
    'user_session_devices',
    'virtual_hubs'
  ]::text[]) AS required_table
  LEFT JOIN pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = required_table
   AND c.relkind = 'r'
   AND c.relrowsecurity
  WHERE c.oid IS NULL;

  IF missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Missing table or RLS: %', missing_rls;
  END IF;

  SELECT p.proname
    INTO unsafe_function
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY (ARRAY[
      'admin_set_feature_flag',
      'apply_moderation_action',
      'create_social_circle',
      'evaluate_feature_flag',
      'get_my_connection_cards',
      'request_my_data_subject_action',
      'submit_safety_report'
    ])
    AND (
      NOT p.prosecdef
      OR p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) AS setting
        WHERE setting LIKE 'search_path=%'
      )
      OR has_function_privilege('public', p.oid, 'EXECUTE')
    )
  LIMIT 1;

  IF unsafe_function IS NOT NULL THEN
    RAISE EXCEPTION 'Unsafe SECURITY DEFINER contract: %', unsafe_function;
  END IF;

  SELECT column_name
    INTO unexpected_public_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'public_profile_cards'
    AND column_name = ANY (ARRAY[
      'address',
      'date_of_birth',
      'email',
      'gender',
      'location_lat',
      'location_lon',
      'phone'
    ])
  LIMIT 1;

  IF unexpected_public_column IS NOT NULL THEN
    RAISE EXCEPTION 'Private column exposed by public_profile_cards: %', unexpected_public_column;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE key = ANY (ARRAY[
      'ai_proposals',
      'analytics',
      'connections',
      'moderation',
      'new_recommender'
    ])
      AND (enabled OR rollout_percentage <> 0)
  ) THEN
    RAISE EXCEPTION 'A production-risk feature flag is not fail-closed by default';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE key IN ('circles', 'hub2')
      AND NOT (
        enabled
        AND rollout_percentage = 100
        AND cohorts = ARRAY[]::text[]
        AND eligibility_rule = '{}'::jsonb
        AND expires_at > now()
      )
  ) OR (
    SELECT count(*) FROM public.feature_flags WHERE key IN ('circles', 'hub2')
  ) <> 2 THEN
    RAISE EXCEPTION 'Released Circle/Hub flags are not configured for general availability';
  END IF;
END
$structural_checks$;

-- The released default is ON. Disable these two flags inside this
-- self-rolling-back fixture to keep proving the global kill-switch path before
-- the controlled enable-path assertions below.
UPDATE public.feature_flags
SET enabled = false,
    rollout_percentage = 0
WHERE key IN ('circles', 'hub2');

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (
  user_id,
  display_name,
  address,
  hobbies,
  onboarding_step,
  profile_visibility
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'RLS persona A',
    'A private fixture address',
    ARRAY['hiking'],
    2,
    'members'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'RLS persona B',
    'B private fixture address',
    ARRAY['cycling'],
    2,
    'members'
  )
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  address = EXCLUDED.address,
  hobbies = EXCLUDED.hobbies,
  onboarding_step = EXCLUDED.onboarding_step,
  profile_visibility = EXCLUDED.profile_visibility;

-- An active subject override can refine an enabled rollout, but it must never
-- bypass the global kill switch or an expired global registration.
INSERT INTO public.feature_flag_overrides (
  flag_key,
  user_id,
  enabled,
  reason,
  expires_at,
  created_by
)
VALUES
  (
    'connections',
    '11111111-1111-4111-8111-111111111111',
    true,
    'SQL kill-switch regression fixture',
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'analytics',
    '11111111-1111-4111-8111-111111111111',
    true,
    'SQL expiry regression fixture',
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  )
ON CONFLICT (flag_key, user_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at;

UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    expires_at = now() - interval '1 minute'
WHERE key = 'analytics';

-- Supabase normally supplies table grants. The temporary grants isolate RLS and
-- trigger behavior from the local harness' deliberately minimal role bootstrap.
GRANT SELECT ON
  public.profiles,
  public.public_profile_cards,
  public.user_reports,
  public.user_session_devices,
  public.data_subject_requests,
  public.discovery_preferences,
  public.connections,
  public.social_circles,
  public.virtual_hubs,
  public.virtual_hub_members
TO authenticated;

GRANT INSERT ON
  public.connections,
  public.social_circles,
  public.discovery_preferences
TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $persona_a_checks$
DECLARE
  row_count integer;
  flag_value boolean;
  report_id uuid;
BEGIN
  SELECT count(*)
    INTO row_count
  FROM public.profiles
  WHERE user_id = '22222222-2222-4222-8222-222222222222';

  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Persona A can read persona B private profile';
  END IF;

  SELECT count(*)
    INTO row_count
  FROM public.user_session_devices
  WHERE user_id = '22222222-2222-4222-8222-222222222222';

  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Persona A can read persona B session metadata';
  END IF;

  SELECT public.evaluate_feature_flag('connections', auth.uid(), NULL)
    INTO flag_value;

  IF flag_value THEN
    RAISE EXCEPTION 'A subject override bypassed the global connections kill switch';
  END IF;

  SELECT public.evaluate_feature_flag('analytics', auth.uid(), NULL)
    INTO flag_value;

  IF flag_value THEN
    RAISE EXCEPTION 'A subject override bypassed an expired global analytics flag';
  END IF;

  BEGIN
    PERFORM * FROM public.get_my_connection_cards();
    RAISE EXCEPTION 'Guarded connection read unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF position('FEATURE_DISABLED:connections' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.create_social_circle(
      'SQL security fixture',
      'Cross-domain feature flag validation',
      'monthly',
      8,
      'approval',
      'members',
      'Respect the community rules',
      'production-pack-sql-circle'
    );
    RAISE EXCEPTION 'Circle creation unexpectedly succeeded while flag is off';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF position('FEATURE_DISABLED:circles' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.connections (user_low_id, user_high_id)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'Connection insert unexpectedly succeeded while flag is off';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF position('FEATURE_DISABLED:connections' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.discovery_preferences (
      user_id,
      canonical_identity,
      candidate_source,
      preference,
      last_idempotency_key
    )
    VALUES (
      auth.uid(),
      'native:security-fixture',
      'native',
      'less_like_this',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'Recommender mutation unexpectedly succeeded while flag is off';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF position('FEATURE_DISABLED:new_recommender' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  report_id := public.submit_safety_report(
    '22222222-2222-4222-8222-222222222222',
    'user',
    '22222222-2222-4222-8222-222222222222',
    'harassment',
    'Non-production SQL fixture evidence',
    'profile',
    'production-pack-sql-report-0001'
  );

  IF report_id IS NULL THEN
    RAISE EXCEPTION 'Safety report did not return a case-safe identifier';
  END IF;

  SELECT count(*) INTO row_count
  FROM public.user_reports
  WHERE id = report_id;

  IF row_count <> 1 THEN
    RAISE EXCEPTION 'Reporter cannot read their own report receipt';
  END IF;

  PERFORM public.set_user_block(
    '22222222-2222-4222-8222-222222222222',
    true,
    'privacy'
  );

  SELECT count(*) INTO row_count
  FROM public.public_profile_cards
  WHERE user_id = '22222222-2222-4222-8222-222222222222';

  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Blocked user remains visible in public_profile_cards';
  END IF;
END
$persona_a_checks$;

SELECT set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

DO $persona_b_checks$
DECLARE
  row_count integer;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.user_reports
  WHERE reported_user_id = auth.uid();

  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Reported user can read reporter-private report data';
  END IF;
END
$persona_b_checks$;

RESET ROLE;

-- Prove that the same server-side boundaries have a controlled enable path;
-- the surrounding transaction restores the released Circle/Hub ON state.
UPDATE public.feature_flags
SET enabled = true,
    rollout_percentage = 100,
    cohorts = ARRAY[]::text[],
    eligibility_rule = '{}'::jsonb,
    expires_at = now() + interval '30 days'
WHERE key IN ('connections', 'circles', 'hub2', 'new_recommender');

INSERT INTO public.virtual_hubs (
  id,
  hobby_category,
  city,
  purpose,
  join_policy,
  lifecycle_state,
  is_discoverable
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'SQL fixture activity',
  'Budapest',
  'Controlled Hub 2 rollout test',
  'open',
  'recruiting',
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $controlled_enable_checks$
DECLARE
  first_circle_id uuid;
  replay_circle_id uuid;
  hub_id uuid;
  first_join_status text;
  replay_join_status text;
  row_count integer;
BEGIN
  PERFORM * FROM public.get_my_connection_cards();

  first_circle_id := public.create_social_circle(
    'Enabled SQL fixture',
    'Controlled rollout idempotency validation',
    'monthly',
    8,
    'approval',
    'members',
    'Respect the community rules',
    'production-pack-enabled-circle'
  );
  replay_circle_id := public.create_social_circle(
    'Enabled SQL fixture',
    'Controlled rollout idempotency validation',
    'monthly',
    8,
    'approval',
    'members',
    'Respect the community rules',
    'production-pack-enabled-circle'
  );

  IF first_circle_id IS NULL OR first_circle_id <> replay_circle_id THEN
    RAISE EXCEPTION 'Circle creation is not idempotent after controlled enable';
  END IF;

  PERFORM * FROM public.set_discovery_preference(
    'native:enabled-security-fixture',
    'native',
    'less_like_this',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  );

  SELECT count(*) INTO row_count
  FROM public.discovery_preferences
  WHERE user_id = auth.uid()
    AND canonical_identity = 'native:enabled-security-fixture';

  IF row_count <> 1 THEN
    RAISE EXCEPTION 'Recommender preference did not persist after controlled enable';
  END IF;

  hub_id := '33333333-3333-4333-8333-333333333333';

  first_join_status := public.request_virtual_hub_join(
    hub_id,
    true,
    'production-pack-enabled-hub-join'
  );
  replay_join_status := public.request_virtual_hub_join(
    hub_id,
    true,
    'production-pack-enabled-hub-join'
  );

  IF first_join_status <> 'active' OR replay_join_status <> first_join_status THEN
    RAISE EXCEPTION 'Hub join controlled enable/idempotency failed: %, %', first_join_status, replay_join_status;
  END IF;
END
$controlled_enable_checks$;

RESET ROLE;
ROLLBACK;
