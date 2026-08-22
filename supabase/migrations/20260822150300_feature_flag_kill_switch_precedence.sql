-- Cross-prompt remediation: a global OFF/expired registration is the
-- authoritative kill switch and cannot be resurrected by a subject override.
-- Rollback: restore the preceding evaluator only if all overrides are first
-- disabled; otherwise rollback would reintroduce a kill-switch bypass.

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_feature_flag(
  _flag_key text,
  _subject_id uuid,
  _cohort text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flag_record public.feature_flags%ROWTYPE;
  override_value boolean;
  bucket bigint;
BEGIN
  SELECT * INTO flag_record
  FROM public.feature_flags
  WHERE key = _flag_key;

  IF NOT FOUND OR NOT flag_record.enabled OR flag_record.expires_at <= now() THEN
    RETURN false;
  END IF;

  SELECT enabled INTO override_value
  FROM public.feature_flag_overrides
  WHERE flag_key = _flag_key
    AND user_id = _subject_id
    AND expires_at > now();
  IF FOUND THEN
    RETURN override_value;
  END IF;

  IF cardinality(flag_record.cohorts) > 0
     AND (_cohort IS NULL OR NOT (_cohort = ANY(flag_record.cohorts))) THEN
    RETURN false;
  END IF;
  IF flag_record.eligibility_rule <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF flag_record.rollout_percentage <= 0 THEN RETURN false; END IF;
  IF flag_record.rollout_percentage >= 100 THEN RETURN true; END IF;

  bucket := mod(abs(hashtextextended(_flag_key || ':' || _subject_id::text, 0)::numeric), 100)::bigint;
  RETURN bucket < flag_record.rollout_percentage;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_feature_flag(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_feature_flag(text, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.evaluate_feature_flag(text, uuid, text) IS
  'Fail-closed evaluator: global existence, enabled state and expiry always precede subject overrides.';

COMMIT;
