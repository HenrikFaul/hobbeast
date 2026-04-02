-- Waitlist auto-promote: when a going participant is cancelled/no_show, promote oldest waitlisted
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_id uuid;
  v_next_user_id uuid;
  v_max_attendees int;
  v_going_count int;
BEGIN
  -- Only fire when status changes TO cancelled or no_show FROM going
  IF OLD.status = 'going' AND NEW.status IN ('cancelled', 'no_show') THEN
    -- Get event capacity
    SELECT max_attendees INTO v_max_attendees FROM events WHERE id = NEW.event_id;
    
    -- Count current going participants (excluding the one being cancelled)
    SELECT count(*) INTO v_going_count
    FROM event_participants
    WHERE event_id = NEW.event_id AND status = 'going' AND id != NEW.id;
    
    -- If there's room, promote the oldest waitlisted
    IF v_max_attendees IS NULL OR v_going_count < v_max_attendees THEN
      SELECT id, user_id INTO v_next_id, v_next_user_id
      FROM event_participants
      WHERE event_id = NEW.event_id AND status = 'waitlist'
      ORDER BY joined_at ASC
      LIMIT 1;
      
      IF v_next_id IS NOT NULL THEN
        UPDATE event_participants
        SET status = 'going', status_updated_at = now()
        WHERE id = v_next_id;
        
        -- Audit the cancellation
        INSERT INTO participation_audits (participation_id, event_id, actor_user_id, action, metadata)
        VALUES (NEW.id, NEW.event_id, NEW.user_id, NEW.status, jsonb_build_object('auto_promoted', v_next_id));
        
        -- Audit the promotion
        INSERT INTO participation_audits (participation_id, event_id, actor_user_id, action, metadata)
        VALUES (v_next_id, NEW.event_id, NULL, 'auto_promoted_from_waitlist', jsonb_build_object('freed_by', NEW.user_id));
        
        -- Create notification for promoted user
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
          v_next_user_id,
          'waitlist_promoted',
          'Felkerültél az eseményre!',
          'Egy hely felszabadult és automatikusan beléptettünk.',
          jsonb_build_object('event_id', NEW.event_id)
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_auto_promote_waitlist ON event_participants;
CREATE TRIGGER trg_auto_promote_waitlist
  AFTER UPDATE OF status ON event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_promote_waitlist();

-- Organizer message delivery function
CREATE OR REPLACE FUNCTION public.deliver_organizer_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
  v_event_title text;
BEGIN
  -- Only fire when delivery_state changes to 'sending'
  IF NEW.delivery_state = 'sending' AND (OLD.delivery_state IS DISTINCT FROM 'sending') THEN
    -- Get event title
    SELECT title INTO v_event_title FROM events WHERE id = NEW.event_id;
    
    -- Create notifications for all going participants
    FOR v_participant IN
      SELECT user_id FROM event_participants
      WHERE event_id = NEW.event_id
        AND status IN ('going', 'waitlist')
        AND (NEW.audience_filter = 'all'
             OR (NEW.audience_filter = 'going' AND status = 'going')
             OR (NEW.audience_filter = 'waitlist' AND status = 'waitlist'))
    LOOP
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_participant.user_id,
        'organizer_message',
        COALESCE(NEW.subject, 'Üzenet a szervezőtől'),
        NEW.body,
        jsonb_build_object('event_id', NEW.event_id, 'message_id', NEW.id, 'event_title', v_event_title)
      );
    END LOOP;
    
    -- Mark as sent
    NEW.delivery_state := 'sent';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to event_messages
DROP TRIGGER IF EXISTS trg_deliver_organizer_message ON event_messages;
CREATE TRIGGER trg_deliver_organizer_message
  BEFORE UPDATE OF delivery_state ON event_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_organizer_message();

-- venue_sync_runs table for tracking seed runs
CREATE TABLE IF NOT EXISTS public.venue_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'manual',
  cities_covered text[] NOT NULL DEFAULT '{}',
  total_upserted int NOT NULL DEFAULT 0,
  errors text[] DEFAULT '{}',
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read venue sync runs"
  ON public.venue_sync_runs FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can manage venue sync runs"
  ON public.venue_sync_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);