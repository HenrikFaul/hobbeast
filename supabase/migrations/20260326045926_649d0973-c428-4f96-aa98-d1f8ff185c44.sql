
-- Add place_* columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS place_source text,
  ADD COLUMN IF NOT EXISTS place_source_ids jsonb,
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS place_categories text[],
  ADD COLUMN IF NOT EXISTS place_category_confidence double precision,
  ADD COLUMN IF NOT EXISTS place_address text,
  ADD COLUMN IF NOT EXISTS place_city text,
  ADD COLUMN IF NOT EXISTS place_postcode text,
  ADD COLUMN IF NOT EXISTS place_country text,
  ADD COLUMN IF NOT EXISTS place_lat double precision,
  ADD COLUMN IF NOT EXISTS place_lon double precision,
  ADD COLUMN IF NOT EXISTS place_distance_m integer,
  ADD COLUMN IF NOT EXISTS place_diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS place_details jsonb;

-- Add organizer columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility_type text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS participation_type text DEFAULT 'open';

-- Add organizer columns to event_participants table
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'going',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS organizer_note text,
  ADD COLUMN IF NOT EXISTS invite_code text;

-- Create organizer_messages table
CREATE TABLE IF NOT EXISTS public.organizer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'custom_message',
  audience_filter text NOT NULL DEFAULT 'all',
  subject text,
  body text NOT NULL,
  delivery_state text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event owners can manage messages" ON public.organizer_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = organizer_messages.event_id AND events.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = organizer_messages.event_id AND events.created_by = auth.uid()));

CREATE POLICY "Participants can view messages" ON public.organizer_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM event_participants WHERE event_participants.event_id = organizer_messages.event_id AND event_participants.user_id = auth.uid()));

-- Create organizer_audit_log table
CREATE TABLE IF NOT EXISTS public.organizer_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizer_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event owners can view audit log" ON public.organizer_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = organizer_audit_log.event_id AND events.created_by = auth.uid()));

CREATE POLICY "Event owners can insert audit log" ON public.organizer_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = organizer_audit_log.event_id AND events.created_by = auth.uid()));

-- Create places_cache table
CREATE TABLE IF NOT EXISTS public.places_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  provider text NOT NULL,
  response_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage places cache" ON public.places_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
