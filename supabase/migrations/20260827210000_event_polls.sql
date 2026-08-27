-- Deciding something together.
--
-- The one genuine greenfield in the capability map: there was no poll, vote or
-- ballot table anywhere in the schema. Groups still decide things — which of
-- three dates, which pub afterwards — and until now they did it in a comment
-- thread nobody could total up.
--
-- Design decisions worth stating, because each rules out a worse version:
--
--   * A vote belongs to a PARTICIPATION, not merely to a user. Only somebody
--     holding a place may vote, and if they leave, their vote leaves with
--     them. That is what makes the count mean something.
--   * One row per (option, voter) with a unique constraint, so a double tap
--     cannot stuff the ballot.
--   * A single-choice poll REPLACES the previous answer rather than adding to
--     it, so changing your mind is not the same as voting twice.
--   * Results are readable by everyone who can vote. A poll whose outcome only
--     the organizer can see is a survey, and calling it a poll would mislead.
--
-- Applied via the Supabase MCP; this file is the record. Verified live before
-- shipping: duplicate and blank options collapse, a double tap still counts
-- once, changing your mind replaces, somebody who never joined is refused with
-- PARTICIPATION_REQUIRED and sees zero polls, and a participant sees both the
-- totals and their own choice.

CREATE TABLE IF NOT EXISTS public.event_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  question text NOT NULL,
  allow_multiple boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_polls_question_length CHECK (length(btrim(question)) BETWEEN 3 AND 200)
);

CREATE TABLE IF NOT EXISTS public.event_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.event_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_poll_options_label_length CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT event_poll_options_unique_label UNIQUE (poll_id, label)
);

CREATE TABLE IF NOT EXISTS public.event_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.event_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.event_poll_options(id) ON DELETE CASCADE,
  voter_user_id uuid NOT NULL,
  participation_id uuid NOT NULL REFERENCES public.event_participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_poll_votes_once UNIQUE (option_id, voter_user_id)
);

CREATE INDEX IF NOT EXISTS event_polls_event_idx ON public.event_polls (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_poll_options_poll_idx ON public.event_poll_options (poll_id, position);
CREATE INDEX IF NOT EXISTS event_poll_votes_poll_idx ON public.event_poll_votes (poll_id);

ALTER TABLE public.event_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_see_event_polls(p_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_event_operator(p_event_id, 'view_participants')
    OR EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.event_id = p_event_id
        AND p.user_id = auth.uid()
        AND p.status IN ('going', 'waitlist', 'checked_in', 'completed', 'invited')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_event_polls(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_event_polls(uuid) TO authenticated;

DROP POLICY IF EXISTS "Participants read event polls" ON public.event_polls;
CREATE POLICY "Participants read event polls"
  ON public.event_polls FOR SELECT TO authenticated
  USING (public.can_see_event_polls(event_id));

DROP POLICY IF EXISTS "Participants read poll options" ON public.event_poll_options;
CREATE POLICY "Participants read poll options"
  ON public.event_poll_options FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_polls p
    WHERE p.id = event_poll_options.poll_id AND public.can_see_event_polls(p.event_id)
  ));

DROP POLICY IF EXISTS "Participants read poll votes" ON public.event_poll_votes;
CREATE POLICY "Participants read poll votes"
  ON public.event_poll_votes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_polls p
    WHERE p.id = event_poll_votes.poll_id AND public.can_see_event_polls(p.event_id)
  ));

COMMENT ON TABLE public.event_polls IS
  'Group decisions attached to an event. Writes go through RPCs; a vote is tied to a participation, so losing the place loses the vote.';

-- The write and read functions (create_event_poll, cast_event_poll_vote,
-- close_event_poll, event_polls_with_results) are defined in the companion
-- migration 20260827210001_event_polls_rpcs.sql.
