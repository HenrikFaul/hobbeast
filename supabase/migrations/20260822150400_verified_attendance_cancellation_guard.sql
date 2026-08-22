-- Cross-prompt lifecycle remediation: participant self-cancellation is valid
-- only before attendance is verified. checked_in/completed/no_show records are
-- organizer/audit evidence and must not free a seat or rewrite attendance.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_own_participation_atomic(
  p_event_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE (participation_id uuid, participation_status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participation public.event_participants%ROWTYPE;
  v_previous_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  SELECT * INTO v_participation
  FROM public.event_participants
  WHERE event_id = p_event_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_participation.status = 'cancelled' THEN
    RETURN QUERY SELECT v_participation.id, v_participation.status, true;
    RETURN;
  END IF;
  IF v_participation.status NOT IN ('going', 'waitlist') THEN
    RAISE EXCEPTION 'VERIFIED_ATTENDANCE_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  v_previous_status := v_participation.status;
  UPDATE public.event_participants
  SET status = 'cancelled',
      status_updated_at = now(),
      last_mutation_key = p_idempotency_key
  WHERE id = v_participation.id
  RETURNING * INTO v_participation;

  INSERT INTO public.participation_audits (
    participation_id, event_id, action, actor_user_id, metadata
  ) VALUES (
    v_participation.id,
    p_event_id,
    'cancelled_by_participant',
    v_user_id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'previous_status', v_previous_status)
  );
  INSERT INTO public.event_operation_audits (
    event_id, participation_id, actor_user_id, action,
    previous_state, next_state, idempotency_key
  ) VALUES (
    p_event_id, v_participation.id, v_user_id, 'participant_cancel',
    v_previous_status, 'cancelled', p_idempotency_key
  )
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING;

  RETURN QUERY SELECT v_participation.id, v_participation.status, false;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_participation_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_participation_atomic(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_own_participation_atomic(uuid, uuid) IS
  'Idempotent pre-attendance cancellation. Verified/no-show/completed attendance is immutable to the participant.';

COMMIT;
