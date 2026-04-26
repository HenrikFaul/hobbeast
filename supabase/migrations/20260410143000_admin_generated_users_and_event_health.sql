-- v1.5.1 admin-generated users, bulk actions, and event/participant health fixes

-- Profiles: generated vs real users + activation state
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_origin text NOT NULL DEFAULT 'real';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_origin_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_origin_check CHECK (user_origin IN ('real', 'generated'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.profiles p
SET user_origin = 'generated'
FROM auth.users u
WHERE u.id = p.user_id
  AND COALESCE((u.raw_user_meta_data ->> 'is_test_user')::boolean, false) = true;

-- Events: admin-facing lifecycle / analytics fields
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS outcome_status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registrations_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancellations_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS attended_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2);
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_outcome_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_outcome_status_check CHECK (outcome_status IN ('scheduled', 'held', 'cancelled'));

-- Non-recursive event_participants policies to stop 500 recursion during event reads
DROP POLICY IF EXISTS "Participants viewable by authenticated" ON public.event_participants;
DROP POLICY IF EXISTS "Users can join events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave events" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can update participants" ON public.event_participants;
DROP POLICY IF EXISTS "Event owners can manage participant rows" ON public.event_participants;

CREATE POLICY "Participants readable by authenticated"
ON public.event_participants
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can join events"
ON public.event_participants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave own participation"
ON public.event_participants
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Event owners can update participants"
ON public.event_participants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_participants.event_id
      AND e.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_participants.event_id
      AND e.created_by = auth.uid()
  )
);

-- Keep event aggregate counters aligned with participation rows
CREATE OR REPLACE FUNCTION public.refresh_event_participation_metrics(target_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.events e
  SET
    registrations_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = target_event_id AND ep.status IN ('interested', 'going', 'waitlist', 'checked_in')), 0),
    cancellations_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = target_event_id AND ep.status IN ('cancelled', 'no_show')), 0),
    attended_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = target_event_id AND ep.status = 'checked_in'), 0),
    updated_at = now()
  WHERE e.id = target_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_event_participation_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_event_participation_metrics(COALESCE(NEW.event_id, OLD.event_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_event_participation_metrics ON public.event_participants;
CREATE TRIGGER trg_refresh_event_participation_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.event_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_event_participation_metrics();

UPDATE public.events e
SET
  registrations_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = e.id AND ep.status IN ('interested', 'going', 'waitlist', 'checked_in')), 0),
  cancellations_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = e.id AND ep.status IN ('cancelled', 'no_show')), 0),
  attended_count = COALESCE((SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = e.id AND ep.status = 'checked_in'), 0)
WHERE TRUE;

-- Ensure role helper is callable from authenticated app clients
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
