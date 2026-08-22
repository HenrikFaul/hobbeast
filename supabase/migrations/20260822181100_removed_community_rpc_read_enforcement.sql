-- P1 follow-up: SECURITY DEFINER community reads must honor active resource
-- takedowns just like the underlying RLS policies. This source is append-only;
-- no hosted migration or scheduler is changed by this file.

BEGIN;

-- A removed community cannot gain or reactivate membership. Terminal
-- transitions remain available so a user can still leave or an operator can
-- finish removing an existing membership.
CREATE OR REPLACE FUNCTION public.guard_removed_community_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resource_type text;
  resource_id uuid;
  membership_status text;
  row_payload jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'social_circle_members' THEN
    resource_type := 'circle';
    resource_id := NULLIF(row_payload ->> 'circle_id', '')::uuid;
  ELSIF TG_TABLE_NAME = 'virtual_hub_members' THEN
    resource_type := 'hub';
    resource_id := NULLIF(row_payload ->> 'hub_id', '')::uuid;
  END IF;
  membership_status := NULLIF(row_payload ->> 'membership_status', '');

  IF resource_type IS NULL OR resource_id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_REMOVED' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed(resource_type, resource_id::text)
     AND (
       TG_OP = 'INSERT'
       OR membership_status IS NULL
       OR membership_status NOT IN ('declined', 'left', 'removed')
     ) THEN
    RAISE EXCEPTION 'RESOURCE_REMOVED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_removed_community_membership()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_circle_detail(_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  circle_row public.social_circles%ROWTYPE;
  member_cards jsonb := '[]'::jsonb;
  shared_interest_cards jsonb := '[]'::jsonb;
  pending_cards jsonb := '[]'::jsonb;
  next_event jsonb;
  can_view_members boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO circle_row FROM public.social_circles WHERE id = _circle_id;
  IF NOT FOUND
    OR public.is_resource_removed('circle', _circle_id::text)
    OR public.is_blocked_between(auth.uid(), circle_row.host_id)
    OR NOT (
      circle_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_circle_member(_circle_id)
      OR (public.feature_enabled_for_subject('circles', auth.uid()) AND circle_row.visibility IN ('members', 'public'))
    ) THEN
    RAISE EXCEPTION 'Circle is unavailable' USING ERRCODE = '42501';
  END IF;
  can_view_members := circle_row.host_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_circle_member(_circle_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'display_name', nullif(btrim(profile.display_name), ''),
    'avatar_url', profile.avatar_url,
    'city', CASE WHEN profile.location_precision = 'city' THEN profile.city END,
    'role', member.role,
    'joined_at', member.joined_at
  ) ORDER BY member.role, profile.display_name), '[]'::jsonb)
  INTO member_cards
  FROM public.social_circle_members member
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE member.circle_id = _circle_id
    AND member.membership_status = 'active'
    AND can_view_members
    AND (profile.user_id = auth.uid() OR profile.profile_visibility IN ('members', 'public'))
    AND NOT public.is_blocked_between(auth.uid(), member.user_id);

  IF can_view_members THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', shared.label,
      'member_count', shared.member_count
    ) ORDER BY shared.member_count DESC, shared.label), '[]'::jsonb)
    INTO shared_interest_cards
    FROM (
      SELECT min(btrim(hobby.hobby)) AS label,
        count(DISTINCT member.user_id)::integer AS member_count
      FROM public.social_circle_members member
      JOIN public.profiles profile ON profile.user_id = member.user_id
      CROSS JOIN LATERAL unnest(coalesce(profile.hobbies, '{}'::text[])) hobby(hobby)
      WHERE member.circle_id = _circle_id
        AND member.membership_status = 'active'
        AND profile.interests_visibility IN ('members', 'public')
        AND (profile.user_id = auth.uid() OR profile.profile_visibility IN ('members', 'public'))
        AND NOT public.is_blocked_between(auth.uid(), member.user_id)
        AND btrim(hobby.hobby) <> ''
      GROUP BY lower(btrim(hobby.hobby))
      HAVING count(DISTINCT member.user_id) >= 2
      ORDER BY count(DISTINCT member.user_id) DESC, min(btrim(hobby.hobby))
      LIMIT 8
    ) shared;
  END IF;

  IF circle_row.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'user_id', member.user_id,
      'display_name', nullif(btrim(profile.display_name), ''),
      'avatar_url', profile.avatar_url,
      'requested_at', member.updated_at,
      'rules_acknowledged', member.rules_consented_at IS NOT NULL
    ) ORDER BY member.updated_at), '[]'::jsonb)
    INTO pending_cards
    FROM public.social_circle_members member
    JOIN public.profiles profile ON profile.user_id = member.user_id
    WHERE member.circle_id = _circle_id
      AND member.membership_status = 'requested'
      AND NOT public.is_blocked_between(circle_row.host_id, member.user_id);
  END IF;

  SELECT jsonb_build_object(
    'event_id', event.id,
    'title', event.title,
    'event_date', event.event_date,
    'event_time', event.event_time,
    'city', event.location_city
  ) INTO next_event
  FROM public.social_circle_events linked
  JOIN public.events event ON event.id = linked.event_id
  WHERE linked.circle_id = _circle_id
    AND event.is_active
    AND NOT public.is_resource_removed('event', event.id::text)
    AND (event.event_date IS NULL OR event.event_date >= current_date)
    AND (can_view_members OR coalesce(event.visibility_type, 'public') = 'public')
  ORDER BY event.event_date NULLS LAST, event.event_time NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'circle_id', circle_row.id,
    'name', circle_row.name,
    'purpose', circle_row.purpose,
    'cadence', circle_row.cadence,
    'capacity', circle_row.capacity,
    'membership_policy', circle_row.membership_policy,
    'lifecycle_state', circle_row.lifecycle_state,
    'venue_preference', circle_row.venue_preference,
    'safety_rules', circle_row.safety_rules,
    'host_id', circle_row.host_id,
    'members', member_cards,
    'shared_interests', shared_interest_cards,
    'pending_requests', pending_cards,
    'next_event', next_event
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_virtual_hub_cards()
RETURNS TABLE (
  id uuid,
  hobby_category text,
  city text,
  purpose text,
  host_id uuid,
  host_display_name text,
  host_avatar_url text,
  join_policy text,
  lifecycle_state text,
  member_count integer,
  membership_status text,
  pending_join_count integer,
  qualification_score integer,
  qualification_reasons jsonb,
  beginner_friendly boolean,
  welcome_message text,
  community_rules text,
  activity_freshness_at timestamptz,
  can_claim_host boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    hub.id,
    hub.hobby_category,
    hub.city,
    hub.purpose,
    hub.host_id,
    CASE WHEN hub.host_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR host_profile.profile_visibility IN ('members', 'public')
      THEN nullif(btrim(host_profile.display_name), '') END,
    CASE WHEN hub.host_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR host_profile.profile_visibility IN ('members', 'public')
      THEN host_profile.avatar_url END,
    hub.join_policy,
    hub.lifecycle_state,
    hub.real_member_count,
    own_membership.membership_status,
    CASE WHEN hub.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
      THEN (
        SELECT count(*)::integer
        FROM public.virtual_hub_members pending
        WHERE pending.hub_id = hub.id AND pending.membership_status = 'pending'
      ) ELSE 0 END,
    hub.qualification_score,
    hub.qualification_reasons,
    hub.beginner_friendly,
    hub.welcome_message,
    hub.community_rules,
    hub.activity_freshness_at,
    hub.host_id IS NULL
      AND own_membership.membership_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.profiles own_profile
        WHERE own_profile.user_id = auth.uid() AND own_profile.user_origin = 'real'
      )
      AND EXISTS (
        SELECT 1 FROM public.events organized
        WHERE organized.created_by = auth.uid()
          AND organized.outcome_status IN ('completed', 'held')
          AND NOT public.is_resource_removed('event', organized.id::text)
      )
  FROM public.virtual_hubs hub
  LEFT JOIN public.virtual_hub_members own_membership
    ON own_membership.hub_id = hub.id AND own_membership.user_id = auth.uid()
  LEFT JOIN public.profiles host_profile ON host_profile.user_id = hub.host_id
  WHERE public.feature_enabled_for_subject('hub2', auth.uid())
    AND hub.lifecycle_state <> 'archived'
    AND NOT public.is_resource_removed('hub', hub.id::text)
    AND NOT public.is_blocked_between(auth.uid(), hub.host_id)
    AND (
      (hub.is_discoverable AND hub.lifecycle_state IN ('recruiting', 'active'))
      OR hub.host_id = auth.uid()
      OR own_membership.membership_status IN ('pending', 'active')
      OR public.has_role(auth.uid(), 'admin')
    )
  ORDER BY
    (own_membership.membership_status = 'active') DESC,
    hub.qualification_score DESC,
    hub.real_member_count DESC,
    hub.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_pending_requests(_hub_id uuid)
RETURNS TABLE (
  moderation_item_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  requested_at timestamptz,
  policy_acknowledged boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs
    WHERE id = _hub_id
      AND NOT public.is_resource_removed('hub', id::text)
      AND (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    item.id,
    member.user_id,
    nullif(btrim(profile.display_name), ''),
    profile.avatar_url,
    CASE WHEN profile.location_precision = 'city' THEN profile.city END,
    item.created_at,
    member.policy_acknowledged_at IS NOT NULL
  FROM public.virtual_hub_moderation_items item
  JOIN public.virtual_hub_members member
    ON member.hub_id = item.hub_id AND member.user_id = item.subject_user_id
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE item.hub_id = _hub_id
    AND item.item_type = 'join_request'
    AND item.status IN ('open', 'in_review')
    AND member.membership_status = 'pending'
    AND NOT public.is_blocked_between(auth.uid(), member.user_id)
  ORDER BY item.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_welcome(_hub_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  host_card jsonb;
  next_event jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO hub_row FROM public.virtual_hubs WHERE id = _hub_id;
  IF NOT FOUND OR hub_row.lifecycle_state = 'archived'
    OR public.is_resource_removed('hub', _hub_id::text)
    OR public.is_blocked_between(auth.uid(), hub_row.host_id)
    OR NOT (
      hub_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.virtual_hub_members
        WHERE hub_id = _hub_id AND user_id = auth.uid()
          AND membership_status IN ('pending', 'active')
      )
      OR (hub_row.is_discoverable AND hub_row.lifecycle_state IN ('recruiting', 'active'))
    ) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'user_id', profile.user_id,
    'display_name', nullif(btrim(profile.display_name), ''),
    'avatar_url', profile.avatar_url,
    'city', CASE WHEN profile.location_precision = 'city' THEN profile.city END
  ) INTO host_card
  FROM public.profiles profile
  WHERE profile.user_id = hub_row.host_id
    AND (
      profile.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR profile.profile_visibility IN ('members', 'public')
    );

  SELECT jsonb_build_object(
    'event_id', event.id,
    'title', event.title,
    'start_at', coalesce(
      event.start_time,
      (event.event_date + coalesce(event.event_time, time '00:00'))::timestamptz
    ),
    'city', coalesce(event.location_city, event.place_city),
    'beginner_friendly', event.beginner_friendly
  ) INTO next_event
  FROM public.events event
  WHERE event.is_active
    AND NOT public.is_resource_removed('event', event.id::text)
    AND event.beginner_friendly IS TRUE
    AND (event.start_time > now() OR (event.start_time IS NULL AND event.event_date >= current_date))
    AND (hub_row.city IS NULL OR lower(btrim(hub_row.city)) = lower(btrim(coalesce(event.location_city, event.place_city, ''))))
    AND (
      lower(btrim(event.category)) IN (
        lower(btrim(hub_row.hobby_category)),
        lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
      )
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(event.tags, '{}'::text[])) tag
        WHERE lower(btrim(tag)) IN (
          lower(btrim(hub_row.hobby_category)),
          lower(btrim(coalesce(hub_row.hobby_activity, hub_row.hobby_category)))
        )
      )
    )
    AND (
      coalesce(event.visibility_type, 'public') = 'public'
      OR hub_row.host_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.virtual_hub_members member
        WHERE member.hub_id = _hub_id AND member.user_id = auth.uid()
          AND member.membership_status = 'active'
      )
    )
  ORDER BY coalesce(
    event.start_time,
    (event.event_date + coalesce(event.event_time, time '00:00'))::timestamptz
  )
  LIMIT 1;

  RETURN jsonb_build_object(
    'hub_id', hub_row.id,
    'purpose', hub_row.purpose,
    'welcome_message', hub_row.welcome_message,
    'community_rules', hub_row.community_rules,
    'host', host_card,
    'next_beginner_event', next_event,
    'privacy_note', 'Only a coarse city and explicitly public host card are shown.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circle_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_virtual_hub_cards() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_virtual_hub_pending_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_virtual_hub_welcome(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_circle_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_virtual_hub_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_pending_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_welcome(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_circle_detail(uuid) IS
  'Privacy-bounded Circle detail; active moderation takedowns fail closed, including linked event reads.';
COMMENT ON FUNCTION public.get_my_virtual_hub_cards() IS
  'Privacy-bounded Hub cards; active moderation takedowns are never returned.';
COMMENT ON FUNCTION public.get_virtual_hub_welcome(uuid) IS
  'Privacy-bounded Hub welcome card with nonremoved, actual future beginner-event selection.';

COMMIT;
