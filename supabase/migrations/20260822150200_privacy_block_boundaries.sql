-- P0 privacy boundary hardening for participant cards and community discovery.
-- Append-only follow-up to Prompts 03-06, 13 and 15. This migration preserves
-- every public RPC/view result shape while removing raw-profile and bilateral
-- block leaks from organizer, Circle and Hub 2 surfaces.

BEGIN;

-- Raw profile rows contain private account, location and moderation fields.
-- Organizers and safety reviewers must use purpose-built, allowlisted contracts
-- instead of gaining SELECT access to the complete row. The existing owner and
-- admin policies remain intact.
DROP POLICY IF EXISTS "Profiles visible to owner reviewer or event organizer" ON public.profiles;

-- Keep the established four-column contract, but authorize every call through
-- the canonical per-event capability boundary and suppress participants across
-- a block in either direction. The event_id predicate prevents cross-event
-- participant enumeration by otherwise valid operators.
CREATE OR REPLACE FUNCTION public.get_event_participant_cards(_event_id uuid)
RETURNS TABLE (user_id uuid, display_name text, avatar_url text, city text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_event_operator(_event_id, 'view_participants') THEN
    RAISE EXCEPTION 'Event participant access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    CASE WHEN p.location_precision = 'city' THEN p.city ELSE NULL END
  FROM public.event_participants ep
  JOIN public.profiles p ON p.user_id = ep.user_id
  WHERE ep.event_id = _event_id
    AND NOT public.is_blocked_between(auth.uid(), p.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_participant_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_participant_cards(uuid) TO authenticated;

-- A normal active member may inspect non-blocked members of the same Circle,
-- but a bilateral block removes the other member from that surface. A subject
-- always retains access to their own membership row; admins retain the existing
-- operational exception.
DROP POLICY IF EXISTS "Circle members view memberships" ON public.social_circle_members;
DROP POLICY IF EXISTS "Circle members view flagged memberships" ON public.social_circle_members;
DROP POLICY IF EXISTS "Circle members view nonblocked memberships" ON public.social_circle_members;
CREATE POLICY "Circle members view nonblocked memberships"
ON public.social_circle_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (
    public.feature_enabled_for_subject('circles', auth.uid())
    AND public.is_circle_member(circle_id)
    AND NOT public.is_blocked_between(auth.uid(), user_id)
  )
);

-- Circle discovery and member access must not reveal a host's Circle across a
-- block in either direction. Self-host access is unaffected because the block
-- helper deliberately returns false for identical users.
DROP POLICY IF EXISTS "Circles respect configured visibility" ON public.social_circles;
DROP POLICY IF EXISTS "Circles respect flag and operational visibility" ON public.social_circles;
DROP POLICY IF EXISTS "Circles respect flags and host blocks" ON public.social_circles;
CREATE POLICY "Circles respect flags and host blocks"
ON public.social_circles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT public.is_blocked_between(auth.uid(), host_id)
    AND (
      created_by = auth.uid()
      OR host_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.social_circle_members own_membership
        WHERE own_membership.circle_id = social_circles.id
          AND own_membership.user_id = auth.uid()
      )
      OR (
        public.feature_enabled_for_subject('circles', auth.uid())
        AND (visibility = 'public' OR visibility = 'members' OR public.is_circle_member(id))
      )
    )
  )
);

-- Apply the same host-block boundary to the underlying Hub table. This closes
-- direct PostgREST reads as well as consumers that do not use the discovery
-- view. Existing admin operations retain visibility.
DROP POLICY IF EXISTS "Discoverable hubs are visible to members" ON public.virtual_hubs;
DROP POLICY IF EXISTS "Flagged hubs are visible to members" ON public.virtual_hubs;
DROP POLICY IF EXISTS "Hubs respect flags and host blocks" ON public.virtual_hubs;
CREATE POLICY "Hubs respect flags and host blocks"
ON public.virtual_hubs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    NOT public.is_blocked_between(auth.uid(), host_id)
    AND (
      host_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.virtual_hub_members m
        WHERE m.hub_id = virtual_hubs.id
          AND m.user_id = auth.uid()
          AND m.membership_status = 'active'
      )
      OR (
        public.feature_enabled_for_subject('hub2', auth.uid())
        AND is_discoverable
        AND lifecycle_state IN ('recruiting', 'active')
      )
    )
  )
);

-- Views execute with their owner privileges unless explicitly configured as
-- security invokers. Keep the explicit predicate in the allowlisted discovery
-- contract so the block boundary does not depend on base-table RLS semantics.
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
  AND (public.has_role(auth.uid(), 'admin') OR NOT public.is_blocked_between(auth.uid(), h.host_id))
  AND h.is_discoverable
  AND h.lifecycle_state IN ('recruiting', 'active')
  AND (h.activity_freshness_at IS NULL OR h.activity_freshness_at > now() - interval '120 days');

REVOKE ALL ON public.virtual_hub_discovery_cards FROM PUBLIC, anon;
GRANT SELECT ON public.virtual_hub_discovery_cards TO authenticated;

-- A guessed or previously observed Hub id must not bypass discovery privacy.
-- Preserve the existing return type, validation, idempotency and moderation
-- behavior while denying joins across a bilateral block with the host.
CREATE OR REPLACE FUNCTION public.request_virtual_hub_join(
  _hub_id uuid,
  _acknowledge_rules boolean,
  _idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Idempotency key required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO hub_row
  FROM public.virtual_hubs
  WHERE id = _hub_id
    AND lifecycle_state <> 'archived';

  IF NOT FOUND OR hub_row.join_policy IN ('automatic', 'invite_only') THEN
    RAISE EXCEPTION 'Hub does not accept direct join requests' USING ERRCODE = '22023';
  END IF;
  IF public.is_blocked_between(auth.uid(), hub_row.host_id) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;
  IF hub_row.community_rules IS NOT NULL AND NOT _acknowledge_rules THEN
    RAISE EXCEPTION 'Community rules must be acknowledged' USING ERRCODE = '22023';
  END IF;

  next_status := CASE WHEN hub_row.join_policy = 'open' THEN 'active' ELSE 'pending' END;
  INSERT INTO public.virtual_hub_members (
    hub_id, user_id, membership_status, join_source, policy_acknowledged_at, left_at, updated_at
  ) VALUES (
    _hub_id,
    auth.uid(),
    next_status,
    'open_join',
    CASE WHEN _acknowledge_rules THEN now() END,
    NULL,
    now()
  )
  ON CONFLICT (hub_id, user_id)
  DO UPDATE SET
    membership_status = EXCLUDED.membership_status,
    policy_acknowledged_at = EXCLUDED.policy_acknowledged_at,
    left_at = NULL,
    updated_at = now();

  INSERT INTO public.virtual_hub_activation_events (hub_id, user_id, stage, dedupe_key)
  VALUES (
    _hub_id,
    auth.uid(),
    CASE WHEN next_status = 'active' THEN 'joined' ELSE 'join_request' END,
    _idempotency_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  IF next_status = 'pending' THEN
    INSERT INTO public.virtual_hub_moderation_items (hub_id, item_type, subject_user_id)
    SELECT _hub_id, 'join_request', auth.uid()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.virtual_hub_moderation_items
      WHERE hub_id = _hub_id
        AND item_type = 'join_request'
        AND subject_user_id = auth.uid()
        AND status IN ('open', 'in_review')
    );
  END IF;

  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.request_virtual_hub_join(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_virtual_hub_join(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.get_event_participant_cards(uuid) IS
  'Allowlisted event-scoped participant profile cards. Requires view_participants capability and suppresses bilateral blocks.';
COMMENT ON VIEW public.virtual_hub_discovery_cards IS
  'Allowlisted Hub 2 discovery contract with global feature and bilateral host-block enforcement.';

COMMIT;
