
-- Add missing columns to event_participants
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();

-- Create participation_audits table
CREATE TABLE IF NOT EXISTS public.participation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid NOT NULL REFERENCES public.event_participants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create event_messages table
CREATE TABLE IF NOT EXISTS public.event_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type text NOT NULL,
  audience_filter text NOT NULL,
  subject text,
  body text NOT NULL,
  delivery_state text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create user_reminder_preferences table
CREATE TABLE IF NOT EXISTS public.user_reminder_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_event_reminders boolean NOT NULL DEFAULT true,
  reminder_hours_before integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.participation_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reminder_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for participation_audits
CREATE POLICY "Owners can read audits on owned events" ON public.participation_audits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = participation_audits.event_id AND e.created_by = auth.uid()));

CREATE POLICY "Owners can write audits on owned events" ON public.participation_audits
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = participation_audits.event_id AND e.created_by = auth.uid()));

-- RLS policies for event_messages
CREATE POLICY "Owners can read messages on owned events" ON public.event_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_messages.event_id AND e.created_by = auth.uid()));

CREATE POLICY "Owners can write messages on owned events" ON public.event_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_messages.event_id AND e.created_by = auth.uid()));

-- RLS policies for user_reminder_preferences
CREATE POLICY "Users can read own reminder preferences" ON public.user_reminder_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminder preferences" ON public.user_reminder_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminder preferences" ON public.user_reminder_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
