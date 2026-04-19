-- Add missing columns to event_participants that were added outside of migrations
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'going',
  ADD COLUMN IF NOT EXISTS participation_type text NOT NULL DEFAULT 'internal_rsvp',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS organizer_note text,
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS ticket_token text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
