-- Prompt 15 cross-domain runtime guards. This migration turns the canonical
-- registry into server-side kill switches; UI state is never the authority.
-- It intentionally preserves opt-out/revoke/archive and service-role repair
-- operations while blocking new user-facing activation when a flag is OFF.

BEGIN;

CREATE OR REPLACE FUNCTION public.feature_enabled_for_subject(
  _flag_key text,
  _subject_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subject_cohort text;
BEGIN
  IF _subject_id IS NULL THEN RETURN false; END IF;
  subject_cohort := CASE WHEN public.has_role(_subject_id, 'admin') THEN 'internal' ELSE NULL END;
  RETURN public.evaluate_feature_flag(_flag_key, _subject_id, subject_cohort);
EXCEPTION WHEN OTHERS THEN
  -- Missing/invalid flag state must never become an implicit allow.
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_feature_enabled(
  _flag_key text,
  _subject_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.feature_enabled_for_subject(_flag_key, _subject_id) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED:%', _flag_key USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.feature_enabled_for_subject(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_feature_enabled(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_enabled_for_subject(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.require_feature_enabled(text, uuid) TO authenticated, service_role;

-- SECURITY DEFINER read RPCs bypass table RLS, so preserve their public names
-- behind guarded wrappers and revoke the renamed implementation entrypoints.
ALTER FUNCTION public.get_my_reconnection_candidates()
  RENAME TO get_my_reconnection_candidates_unflagged;
REVOKE ALL ON FUNCTION public.get_my_reconnection_candidates_unflagged()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_my_reconnection_candidates()
RETURNS TABLE (
  encounter_id uuid,
  event_id uuid,
  event_title text,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  interests text[],
  confidence_status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_feature_enabled('connections', auth.uid());
  RETURN QUERY SELECT * FROM public.get_my_reconnection_candidates_unflagged();
END;
$$;

ALTER FUNCTION public.get_my_connection_cards()
  RENAME TO get_my_connection_cards_unflagged;
REVOKE ALL ON FUNCTION public.get_my_connection_cards_unflagged()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_my_connection_cards()
RETURNS TABLE (
  connection_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  interests text[],
  connected_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_feature_enabled('connections', auth.uid());
  RETURN QUERY SELECT * FROM public.get_my_connection_cards_unflagged();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reconnection_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_connection_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_reconnection_candidates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_connection_cards() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_social_feature_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb := to_jsonb(NEW);
  old_payload jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  flag_key text;
  must_gate boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'event_encounters' THEN
    flag_key := 'connections';
    must_gate := TG_OP = 'INSERT'
      OR (payload ->> 'confidence_status') IN ('mutual', 'connected')
         AND (old_payload ->> 'confidence_status') IS DISTINCT FROM (payload ->> 'confidence_status');
  ELSIF TG_TABLE_NAME = 'reconnection_preferences' THEN
    flag_key := 'connections';
    must_gate := (payload ->> 'decision') = 'interested' AND (payload ->> 'revoked_at') IS NULL;
  ELSIF TG_TABLE_NAME = 'connections' THEN
    flag_key := 'connections';
    must_gate := (payload ->> 'status') = 'active'
      AND (TG_OP = 'INSERT' OR (old_payload ->> 'status') IS DISTINCT FROM (payload ->> 'status'));
  ELSIF TG_TABLE_NAME = 'social_circles' THEN
    flag_key := 'circles';
    must_gate := TG_OP = 'INSERT'
      OR (payload ->> 'lifecycle_state') IN ('recruiting', 'active')
         AND (old_payload ->> 'lifecycle_state') IS DISTINCT FROM (payload ->> 'lifecycle_state');
  ELSIF TG_TABLE_NAME = 'social_circle_members' THEN
    flag_key := 'circles';
    must_gate := (payload ->> 'membership_status') IN ('invited', 'requested', 'active')
      AND (TG_OP = 'INSERT' OR (old_payload ->> 'membership_status') IS DISTINCT FROM (payload ->> 'membership_status'));
  ELSIF TG_TABLE_NAME = 'social_circle_events' THEN
    flag_key := 'circles';
    must_gate := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'circle_suggestions' THEN
    flag_key := 'circles';
    must_gate := TG_OP = 'INSERT'
      OR (payload ->> 'status') IN ('inviting', 'accepted')
         AND (old_payload ->> 'status') IS DISTINCT FROM (payload ->> 'status');
  END IF;

  IF must_gate THEN PERFORM public.require_feature_enabled(flag_key, auth.uid()); END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_social_feature_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS feature_guard_event_encounters ON public.event_encounters;
CREATE TRIGGER feature_guard_event_encounters BEFORE INSERT OR UPDATE ON public.event_encounters
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_reconnection_preferences ON public.reconnection_preferences;
CREATE TRIGGER feature_guard_reconnection_preferences BEFORE INSERT OR UPDATE ON public.reconnection_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_connections ON public.connections;
CREATE TRIGGER feature_guard_connections BEFORE INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_social_circles ON public.social_circles;
CREATE TRIGGER feature_guard_social_circles BEFORE INSERT OR UPDATE ON public.social_circles
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_social_circle_members ON public.social_circle_members;
CREATE TRIGGER feature_guard_social_circle_members BEFORE INSERT OR UPDATE ON public.social_circle_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_social_circle_events ON public.social_circle_events;
CREATE TRIGGER feature_guard_social_circle_events BEFORE INSERT ON public.social_circle_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_circle_suggestions ON public.circle_suggestions;
CREATE TRIGGER feature_guard_circle_suggestions BEFORE INSERT OR UPDATE ON public.circle_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.guard_social_feature_mutation();

-- RLS remains the direct table-read boundary. Owners/members retain narrow
-- operational access while public/discovery visibility is killed by the flag.
DROP POLICY IF EXISTS "Encounter participants can view safe encounters" ON public.event_encounters;
CREATE POLICY "Encounter participants can view flagged safe encounters" ON public.event_encounters
  FOR SELECT TO authenticated
  USING (
    public.feature_enabled_for_subject('connections', auth.uid())
    AND auth.uid() IN (user_low_id, user_high_id)
    AND NOT public.is_blocked_between(auth.uid(), CASE WHEN user_low_id = auth.uid() THEN user_high_id ELSE user_low_id END)
  );

DROP POLICY IF EXISTS "Connection participants can view active relationships" ON public.connections;
CREATE POLICY "Connection participants view flagged active relationships" ON public.connections
  FOR SELECT TO authenticated
  USING (
    public.feature_enabled_for_subject('connections', auth.uid())
    AND auth.uid() IN (user_low_id, user_high_id)
    AND NOT public.is_blocked_between(auth.uid(), CASE WHEN user_low_id = auth.uid() THEN user_high_id ELSE user_low_id END)
  );

DROP POLICY IF EXISTS "Circles respect configured visibility" ON public.social_circles;
CREATE POLICY "Circles respect flag and operational visibility" ON public.social_circles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR created_by = auth.uid()
    OR host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.social_circle_members own_membership
      WHERE own_membership.circle_id = id AND own_membership.user_id = auth.uid()
    )
    OR (
      public.feature_enabled_for_subject('circles', auth.uid())
      AND (visibility = 'public' OR visibility = 'members' OR public.is_circle_member(id))
    )
  );

DROP POLICY IF EXISTS "Circle members view memberships" ON public.social_circle_members;
CREATE POLICY "Circle members view flagged memberships" ON public.social_circle_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (public.feature_enabled_for_subject('circles', auth.uid()) AND public.is_circle_member(circle_id))
  );

DROP POLICY IF EXISTS "Circle members view linked events" ON public.social_circle_events;
CREATE POLICY "Circle members view flagged linked events" ON public.social_circle_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.social_circles c WHERE c.id = circle_id AND c.host_id = auth.uid())
    OR (public.feature_enabled_for_subject('circles', auth.uid()) AND public.is_circle_member(circle_id))
  );

CREATE OR REPLACE FUNCTION public.guard_hub_feature_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb := to_jsonb(NEW);
  old_payload jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  must_gate boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'virtual_hubs' THEN
    must_gate := TG_OP = 'INSERT'
      OR ((payload ->> 'is_discoverable')::boolean AND COALESCE((old_payload ->> 'is_discoverable')::boolean, false) = false)
      OR ((payload ->> 'lifecycle_state') IN ('recruiting', 'active')
          AND (old_payload ->> 'lifecycle_state') IS DISTINCT FROM (payload ->> 'lifecycle_state'));
  ELSIF TG_TABLE_NAME = 'virtual_hub_members' THEN
    must_gate := (payload ->> 'membership_status') IN ('pending', 'active')
      AND (TG_OP = 'INSERT' OR (old_payload ->> 'membership_status') IS DISTINCT FROM (payload ->> 'membership_status'));
  ELSIF TG_TABLE_NAME = 'virtual_hub_activation_events' THEN
    must_gate := TG_OP = 'INSERT';
  END IF;
  IF must_gate THEN PERFORM public.require_feature_enabled('hub2', auth.uid()); END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_hub_feature_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS feature_guard_virtual_hubs ON public.virtual_hubs;
CREATE TRIGGER feature_guard_virtual_hubs BEFORE INSERT OR UPDATE ON public.virtual_hubs
  FOR EACH ROW EXECUTE FUNCTION public.guard_hub_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_virtual_hub_members ON public.virtual_hub_members;
CREATE TRIGGER feature_guard_virtual_hub_members BEFORE INSERT OR UPDATE ON public.virtual_hub_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_hub_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_virtual_hub_activation_events ON public.virtual_hub_activation_events;
CREATE TRIGGER feature_guard_virtual_hub_activation_events BEFORE INSERT ON public.virtual_hub_activation_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_hub_feature_mutation();

DROP POLICY IF EXISTS "Discoverable hubs are visible to members" ON public.virtual_hubs;
CREATE POLICY "Flagged hubs are visible to members" ON public.virtual_hubs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.virtual_hub_members m
      WHERE m.hub_id = id AND m.user_id = auth.uid() AND m.membership_status = 'active'
    )
    OR (
      public.feature_enabled_for_subject('hub2', auth.uid())
      AND is_discoverable AND lifecycle_state IN ('recruiting', 'active')
    )
  );

CREATE OR REPLACE VIEW public.virtual_hub_discovery_cards
WITH (security_barrier = true)
AS
SELECT
  h.id,
  h.hobby_category,
  h.hobby_subcategory,
  h.hobby_activity,
  h.city,
  h.purpose,
  h.host_id,
  h.join_policy,
  h.lifecycle_state,
  h.real_member_count AS member_count,
  h.activity_freshness_at,
  h.welcome_message,
  h.community_rules
FROM public.virtual_hubs h
WHERE (public.has_role(auth.uid(), 'admin') OR public.feature_enabled_for_subject('hub2', auth.uid()))
  AND h.is_discoverable
  AND h.lifecycle_state IN ('recruiting', 'active')
  AND (h.activity_freshness_at IS NULL OR h.activity_freshness_at > now() - interval '120 days');

REVOKE ALL ON public.virtual_hub_discovery_cards FROM PUBLIC;
GRANT SELECT ON public.virtual_hub_discovery_cards TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_recommender_feature_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb := to_jsonb(NEW);
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  -- Neutral is a user opt-out/reset and therefore remains available while OFF.
  IF (payload ->> 'preference') <> 'neutral' THEN
    PERFORM public.require_feature_enabled('new_recommender', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_recommender_feature_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS feature_guard_discovery_preferences ON public.discovery_preferences;
CREATE TRIGGER feature_guard_discovery_preferences BEFORE INSERT OR UPDATE ON public.discovery_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_recommender_feature_mutation();
DROP TRIGGER IF EXISTS feature_guard_discovery_preference_history ON public.discovery_preference_history;
CREATE TRIGGER feature_guard_discovery_preference_history BEFORE INSERT ON public.discovery_preference_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_recommender_feature_mutation();

COMMIT;

-- Rollback: disable flags first, then drop feature_guard_* triggers, restore the
-- preceding RLS/view definitions, drop guarded wrapper functions, rename the
-- *_unflagged implementations to their original names, and drop guard helpers.
