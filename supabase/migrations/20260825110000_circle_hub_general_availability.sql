-- Circle and Virtual Hub 2.0 general availability.
--
-- The community runtime, authorization boundaries and fail-closed UI already
-- evaluate these canonical flags. General availability therefore changes only
-- the audited registry configuration; it does not bypass RLS, mutation guards,
-- block/takedown checks or lifecycle rules.
--
-- Operational rollback / kill switch (through the audited admin control plane):
-- set `enabled = false` and `rollout_percentage = 0` for either flag. The
-- evaluator checks global OFF before any per-user override, so an old override
-- cannot resurrect a disabled surface.

BEGIN;

DO $activate_circle_and_hub$
DECLARE
  rollout_expires_at constant timestamptz := '2027-08-31T23:59:59Z';
  flag_row public.feature_flags%ROWTYPE;
  activated_count integer := 0;
BEGIN
  FOR flag_row IN
    SELECT *
    FROM public.feature_flags
    WHERE key IN ('circles', 'hub2')
    ORDER BY key
    FOR UPDATE
  LOOP
    activated_count := activated_count + 1;

    INSERT INTO public.feature_flag_audit_log (
      flag_key,
      change_scope,
      actor_id,
      enabled_before,
      enabled_after,
      rollout_before,
      rollout_after,
      config_before,
      config_after,
      reason,
      correlation_id,
      idempotency_key
    ) VALUES (
      flag_row.key,
      'flag',
      NULL,
      flag_row.enabled,
      true,
      flag_row.rollout_percentage,
      100,
      jsonb_build_object(
        'cohorts', flag_row.cohorts,
        'eligibility_rule', flag_row.eligibility_rule,
        'owner', flag_row.owner,
        'expires_at', flag_row.expires_at
      ),
      jsonb_build_object(
        'cohorts', ARRAY[]::text[],
        'eligibility_rule', '{}'::jsonb,
        'owner', flag_row.owner,
        'expires_at', greatest(flag_row.expires_at, rollout_expires_at)
      ),
      'User-requested Circle and Hub general availability; existing kill switch and authorization boundaries retained',
      'release-v1.12-community-general-availability',
      'release-v1.12-community-general-availability:' || flag_row.key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  IF activated_count <> 2 THEN
    RAISE EXCEPTION 'Circle/Hub activation requires both canonical feature flags; found %', activated_count;
  END IF;

  UPDATE public.feature_flags
  SET enabled = true,
      rollout_percentage = 100,
      cohorts = ARRAY[]::text[],
      eligibility_rule = '{}'::jsonb,
      expires_at = greatest(expires_at, rollout_expires_at),
      updated_at = now()
  WHERE key IN ('circles', 'hub2');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle/Hub activation did not update the canonical feature flag registry';
  END IF;
END;
$activate_circle_and_hub$;

COMMIT;
