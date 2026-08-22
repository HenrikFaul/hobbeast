-- Prompt 08: privacy-safe, reversible discovery preference feedback.
-- Ranking itself is deterministic application code; this migration stores only
-- explicit user controls, never sensitive inferences or another user's data.
-- Rollback: disable the feedback control, export/delete history per retention,
-- revoke the RPC, then drop the two tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.discovery_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_identity text NOT NULL,
  candidate_source text NOT NULL,
  preference text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discovery_preferences_user_id_canonical_identity_key UNIQUE (user_id, canonical_identity),
  CHECK (candidate_source IN ('native', 'external', 'hub', 'circle', 'venue')),
  CHECK (preference IN ('less_like_this', 'neutral')),
  CHECK (char_length(canonical_identity) BETWEEN 3 AND 300)
);

CREATE TABLE IF NOT EXISTS public.discovery_preference_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_identity text NOT NULL,
  candidate_source text NOT NULL,
  preference text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (candidate_source IN ('native', 'external', 'hub', 'circle', 'venue')),
  CHECK (preference IN ('less_like_this', 'neutral'))
);

CREATE INDEX IF NOT EXISTS discovery_preferences_active_user_idx
  ON public.discovery_preferences (user_id, updated_at DESC)
  WHERE active = true;

ALTER TABLE public.discovery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_preference_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own discovery preferences" ON public.discovery_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read own discovery preference history" ON public.discovery_preference_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_discovery_preference(
  p_canonical_identity text,
  p_candidate_source text,
  p_preference text,
  p_idempotency_key uuid
)
RETURNS TABLE (canonical_identity text, preference text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_identity text := trim(COALESCE(p_canonical_identity, ''));
  v_existing public.discovery_preference_history%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF char_length(v_identity) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_CANDIDATE_IDENTITY' USING ERRCODE = '22023'; END IF;
  IF p_candidate_source NOT IN ('native', 'external', 'hub', 'circle', 'venue') THEN RAISE EXCEPTION 'INVALID_CANDIDATE_SOURCE' USING ERRCODE = '22023'; END IF;
  IF p_preference NOT IN ('less_like_this', 'neutral') THEN RAISE EXCEPTION 'INVALID_DISCOVERY_PREFERENCE' USING ERRCODE = '22023'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_existing FROM public.discovery_preference_history
  WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.canonical_identity, v_existing.preference, true;
    RETURN;
  END IF;

  INSERT INTO public.discovery_preferences
    (user_id, canonical_identity, candidate_source, preference, active, last_idempotency_key)
  VALUES (v_user_id, v_identity, p_candidate_source, p_preference, p_preference <> 'neutral', p_idempotency_key)
  ON CONFLICT ON CONSTRAINT discovery_preferences_user_id_canonical_identity_key DO UPDATE
    SET candidate_source = EXCLUDED.candidate_source,
        preference = EXCLUDED.preference,
        active = EXCLUDED.active,
        last_idempotency_key = EXCLUDED.last_idempotency_key,
        updated_at = now();

  INSERT INTO public.discovery_preference_history
    (user_id, canonical_identity, candidate_source, preference, idempotency_key)
  VALUES (v_user_id, v_identity, p_candidate_source, p_preference, p_idempotency_key);

  RETURN QUERY SELECT v_identity, p_preference, false;
END;
$$;

REVOKE ALL ON FUNCTION public.set_discovery_preference(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_discovery_preference(text, text, text, uuid) TO authenticated;

COMMIT;
