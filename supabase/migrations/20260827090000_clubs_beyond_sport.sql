-- A club is not only a sport club.
--
-- A board-game night, a baba-mama circle, a pensioners' walking group and a
-- karate dojo are the same kind of thing: the same people, the same place,
-- every week. Only the first version of this table said "sport", so the column
-- is renamed to what it always meant - the topic - and the club types grow to
-- cover communities that have nothing to do with sport.
--
-- Applied via the Supabase MCP; this file is the record. See the migration
-- history for the full function bodies (list_clubs_public gained p_club_type
-- and p_audience, submit_club_registration and admin_upsert_club gained
-- p_audience, list_club_facets now reports topics/types/audiences).

ALTER TABLE public.clubs RENAME COLUMN sport TO topic;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS audience text[] NOT NULL DEFAULT '{}',
  -- Directory rows rot: a club folds, a federation drops it. last_seen_at is
  -- stamped by every harvest that still finds it, so a row that quietly
  -- disappeared can be told apart from one nobody has re-checked.
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_since timestamptz,
  ADD COLUMN IF NOT EXISTS directory_key text;

ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_type_check;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_type_check CHECK (club_type IN (
  'sport_club', 'team', 'hobby_club', 'community_club'
));

ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_source_check;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_source_check CHECK (source IN (
  'admin', 'directory', 'self_registered', 'derived'
));

DROP INDEX IF EXISTS public.clubs_discovery_idx;
CREATE INDEX IF NOT EXISTS clubs_discovery_idx
  ON public.clubs (review_state, is_active, topic, city);
CREATE INDEX IF NOT EXISTS clubs_directory_idx
  ON public.clubs (directory_key, last_seen_at) WHERE source = 'directory';
