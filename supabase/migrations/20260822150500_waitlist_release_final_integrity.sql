-- Cross-prompt final override: preserve the Prompt 10 notification contract,
-- release only an RSVP seat (not verified attendance), and never promote a
-- waitlisted participant after the event has actually started.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next_id uuid;
  v_next_user_id uuid;
  v_max_attendees integer;
  v_active_count integer;
  v_outcome text;
  v_waitlist_enabled boolean;
  v_starts_at timestamptz;
BEGIN
  IF OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'participant event cannot change during status transition' USING ERRCODE = '22023';
  END IF;
  IF OLD.status = 'going' AND NEW.status IN ('cancelled', 'no_show') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));
    SELECT
      max_attendees,
      outcome_status,
      coalesce(waitlist_enabled, false),
      coalesce(
        start_time,
        CASE
          WHEN event_date IS NOT NULL AND event_time IS NOT NULL
          THEN timezone('UTC', event_date + event_time)
          ELSE NULL
        END
      )
    INTO v_max_attendees, v_outcome, v_waitlist_enabled, v_starts_at
    FROM public.events
    WHERE id = NEW.event_id;

    IF NOT FOUND
       OR NOT v_waitlist_enabled
       OR v_outcome IN ('started', 'completed', 'held', 'cancelled', 'archived')
       OR (v_starts_at IS NOT NULL AND v_starts_at <= now()) THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_active_count
    FROM public.event_participants
    WHERE event_id = NEW.event_id
      AND status IN ('going', 'checked_in', 'completed');

    IF v_max_attendees IS NULL OR v_active_count < v_max_attendees THEN
      SELECT id, user_id INTO v_next_id, v_next_user_id
      FROM public.event_participants
      WHERE event_id = NEW.event_id AND status = 'waitlist'
      ORDER BY joined_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF v_next_id IS NOT NULL THEN
        UPDATE public.event_participants
        SET status = 'going', status_updated_at = now()
        WHERE id = v_next_id AND status = 'waitlist';

        INSERT INTO public.participation_audits (
          participation_id, event_id, actor_user_id, action, metadata
        ) VALUES
          (
            NEW.id, NEW.event_id, NEW.user_id, NEW.status,
            jsonb_build_object('auto_promoted_participation_id', v_next_id)
          ),
          (
            v_next_id, NEW.event_id, NULL, 'auto_promoted_from_waitlist',
            jsonb_build_object('freed_by_participation_id', NEW.id)
          );

        PERFORM public.enqueue_notification(
          v_next_user_id,
          'waitlist_promoted',
          'Felkerültél az eseményre!',
          'Felszabadult egy hely. Nézd át az esemény részleteit és jelezz, ha mégsem tudsz jönni.',
          jsonb_build_object(
            'event_id', NEW.event_id,
            'deep_link', '/events/' || NEW.event_id::text,
            'source_type', 'waitlist'
          ),
          'waitlist:' || NEW.event_id::text,
          'waitlist:' || NEW.event_id::text || ':' || v_next_id::text,
          NULL,
          'waitlist.promoted',
          1,
          now(),
          NULL,
          gen_random_uuid(),
          'in_app'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_promote_waitlist() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.auto_promote_waitlist() IS
  'Concurrency-safe FIFO promotion before event start; verified attendance never releases a waitlist seat.';

COMMIT;
