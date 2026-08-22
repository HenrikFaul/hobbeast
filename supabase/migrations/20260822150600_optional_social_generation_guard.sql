-- Cross-prompt isolation: completing an event is core lifecycle behavior and
-- must not fail merely because the optional Connections rollout is disabled.
-- Encounter generation becomes an authorized no-op until the subject is in
-- the server-side rollout; completion and attendance evidence stay intact.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_event_encounters(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.events event
    WHERE event.id = _event_id
      AND event.outcome_status IN ('completed', 'held')
      AND (
        event.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR coalesce(auth.role(), '') = 'service_role'
      )
  ) THEN
    RAISE EXCEPTION 'Completed event organizer access required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.feature_enabled_for_subject('connections', auth.uid()) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.event_encounters (
    event_id,
    user_low_id,
    user_high_id,
    confidence_status,
    attendance_verified,
    eligible_at,
    expires_at
  )
  SELECT
    _event_id,
    participant_a.user_id,
    participant_b.user_id,
    'eligible',
    true,
    now(),
    now() + interval '30 days'
  FROM public.event_participants participant_a
  JOIN public.event_participants participant_b
    ON participant_b.event_id = participant_a.event_id
   AND participant_a.user_id::text < participant_b.user_id::text
  WHERE participant_a.event_id = _event_id
    AND participant_a.status IN ('checked_in', 'completed')
    AND participant_b.status IN ('checked_in', 'completed')
    AND participant_a.checked_in_at IS NOT NULL
    AND participant_b.checked_in_at IS NOT NULL
    AND NOT public.is_blocked_between(participant_a.user_id, participant_b.user_id)
  ON CONFLICT (event_id, user_low_id, user_high_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_event_encounters(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_event_encounters(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.generate_event_encounters(uuid) IS
  'Authorized completion hook; returns zero without failing when Connections is outside the subject rollout.';

COMMIT;
