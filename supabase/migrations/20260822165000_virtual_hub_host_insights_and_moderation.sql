-- Prompt 05 premium second pass: privacy-safe host funnel insights and a
-- least-privilege Hub moderation runtime. Join approval keeps its specialized
-- RPC; this migration handles reports and reactivation review without exposing
-- reporter identity or report free text.
-- Rollback: revoke/drop the three new RPCs and restore the prior moderation
-- policy/table grants. Existing queue rows remain valid.

DROP POLICY IF EXISTS "Hub hosts manage moderation items"
  ON public.virtual_hub_moderation_items;
DROP POLICY IF EXISTS "Hub hosts read moderation items"
  ON public.virtual_hub_moderation_items;
CREATE POLICY "Hub hosts read moderation items"
  ON public.virtual_hub_moderation_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.virtual_hubs hub
      WHERE hub.id = hub_id AND hub.host_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.virtual_hub_moderation_items
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_host_insights(_hub_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hub_row public.virtual_hubs%ROWTYPE;
  discovery_count integer := 0;
  preview_count integer := 0;
  join_request_count integer := 0;
  joined_count integer := 0;
  first_activity_count integer := 0;
  first_attendance_count integer := 0;
  repeat_activity_count integer := 0;
  new_members_30d integer := 0;
  open_moderation_count integer := 0;
  k_threshold constant integer := 3;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed('hub', _hub_id::text) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO hub_row
  FROM public.virtual_hubs hub
  WHERE hub.id = _hub_id
    AND (hub.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'discovery')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'preview')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'join_request')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'joined')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'first_activity')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'first_attendance')::integer,
    count(DISTINCT activation.user_id) FILTER (WHERE activation.stage = 'repeat_activity')::integer
  INTO
    discovery_count, preview_count, join_request_count, joined_count,
    first_activity_count, first_attendance_count, repeat_activity_count
  FROM public.virtual_hub_activation_events activation
  WHERE activation.hub_id = _hub_id
    AND activation.occurred_at >= now() - interval '90 days'
    AND activation.user_id IS NOT NULL;

  SELECT count(*)::integer INTO new_members_30d
  FROM public.virtual_hub_members member
  JOIN public.profiles profile ON profile.user_id = member.user_id
  WHERE member.hub_id = _hub_id
    AND member.membership_status = 'active'
    AND profile.user_origin = 'real'
    AND member.joined_at >= now() - interval '30 days';

  SELECT count(*)::integer INTO open_moderation_count
  FROM public.virtual_hub_moderation_items item
  WHERE item.hub_id = _hub_id AND item.status IN ('open', 'in_review');

  RETURN jsonb_build_object(
    'hub_id', hub_row.id,
    'window_days', 90,
    'suppression_threshold', k_threshold,
    'funnel', jsonb_build_object(
      'discovery', CASE WHEN discovery_count >= k_threshold THEN discovery_count END,
      'preview', CASE WHEN preview_count >= k_threshold THEN preview_count END,
      'join_request', CASE WHEN join_request_count >= k_threshold THEN join_request_count END,
      'joined', CASE WHEN joined_count >= k_threshold THEN joined_count END,
      'first_activity', CASE WHEN first_activity_count >= k_threshold THEN first_activity_count END,
      'first_attendance', CASE WHEN first_attendance_count >= k_threshold THEN first_attendance_count END,
      'repeat_activity', CASE WHEN repeat_activity_count >= k_threshold THEN repeat_activity_count END
    ),
    'new_real_members_30d', new_members_30d,
    'open_moderation_count', open_moderation_count,
    'qualification_score', hub_row.qualification_score,
    'qualification_reasons', hub_row.qualification_reasons,
    'activity_freshness_at', hub_row.activity_freshness_at,
    'archive_eligible_at', hub_row.archive_eligible_at,
    'privacy_note', 'Counts below three distinct users are suppressed.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_virtual_hub_moderation_queue(_hub_id uuid)
RETURNS TABLE (
  moderation_item_id uuid,
  item_type text,
  status text,
  subject_user_id uuid,
  subject_display_name text,
  report_category text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.virtual_hubs hub
    WHERE hub.id = _hub_id
      AND (hub.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed('hub', _hub_id::text) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    item.id,
    item.item_type,
    item.status,
    CASE
      WHEN item.subject_user_id IS NULL
        OR public.is_blocked_between(auth.uid(), item.subject_user_id)
      THEN NULL ELSE item.subject_user_id
    END,
    CASE
      WHEN item.subject_user_id IS NULL
        OR public.is_blocked_between(auth.uid(), item.subject_user_id)
      THEN NULL ELSE NULLIF(btrim(profile.display_name), '')
    END,
    report.category,
    item.created_at
  FROM public.virtual_hub_moderation_items item
  LEFT JOIN public.profiles profile ON profile.user_id = item.subject_user_id
  LEFT JOIN public.user_reports report ON report.id = item.report_id
  WHERE item.hub_id = _hub_id
    AND item.item_type <> 'join_request'
    AND item.status IN ('open', 'in_review')
  ORDER BY item.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_virtual_hub_moderation_item(
  _moderation_item_id uuid,
  _action text,
  _reason text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item_row public.virtual_hub_moderation_items%ROWTYPE;
  hub_row public.virtual_hubs%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('review', 'resolve', 'dismiss')
    OR char_length(btrim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 500
    OR char_length(btrim(coalesce(_idempotency_key, ''))) NOT BETWEEN 8 AND 240 THEN
    RAISE EXCEPTION 'Invalid moderation resolution' USING ERRCODE = '22023';
  END IF;
  next_status := CASE _action
    WHEN 'review' THEN 'in_review'
    WHEN 'resolve' THEN 'resolved'
    ELSE 'dismissed'
  END;

  SELECT * INTO item_row
  FROM public.virtual_hub_moderation_items item
  WHERE item.id = _moderation_item_id
  FOR UPDATE;
  IF NOT FOUND OR item_row.item_type = 'join_request' THEN
    RAISE EXCEPTION 'Moderation item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO hub_row
  FROM public.virtual_hubs hub
  WHERE hub.id = item_row.hub_id
    AND (hub.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub host access required' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed('hub', item_row.hub_id::text) THEN
    RAISE EXCEPTION 'Hub is unavailable' USING ERRCODE = '42501';
  END IF;
  IF item_row.resolution_key = _idempotency_key
    AND item_row.status = next_status THEN
    RETURN jsonb_build_object(
      'status', item_row.status,
      'item_type', item_row.item_type,
      'idempotent_replay', true
    );
  END IF;
  IF item_row.status NOT IN ('open', 'in_review') THEN
    RAISE EXCEPTION 'Moderation item is already closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.virtual_hub_moderation_items
  SET status = next_status,
      assigned_to = auth.uid(),
      resolution_note = btrim(_reason),
      resolution_key = _idempotency_key,
      resolved_at = CASE WHEN next_status IN ('resolved', 'dismissed') THEN now() END,
      updated_at = now()
  WHERE id = item_row.id;

  IF item_row.item_type = 'reactivation_review' AND _action = 'resolve' THEN
    IF item_row.subject_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.virtual_hub_members member
      WHERE member.hub_id = item_row.hub_id
        AND member.user_id = item_row.subject_user_id
        AND member.membership_status = 'active'
    ) THEN
      RAISE EXCEPTION 'Active Hub membership required' USING ERRCODE = '42501';
    END IF;
    UPDATE public.virtual_hubs
    SET lifecycle_state = 'recruiting',
        is_discoverable = true,
        reactivation_requested_at = coalesce(reactivation_requested_at, now()),
        archive_eligible_at = NULL,
        updated_at = now()
    WHERE id = item_row.hub_id AND lifecycle_state IN ('latent', 'inactive');
  END IF;

  INSERT INTO public.virtual_hub_admin_audit_events (
    actor_id, hub_id, action, before_state, after_state, reason, idempotency_key
  ) VALUES (
    auth.uid(), item_row.hub_id, 'moderation_item_' || _action,
    jsonb_build_object('item_id', item_row.id, 'status', item_row.status),
    jsonb_build_object(
      'item_id', item_row.id,
      'status', next_status,
      'item_type', item_row.item_type
    ),
    btrim(_reason), _idempotency_key
  ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'status', next_status,
    'item_type', item_row.item_type,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_virtual_hub_host_insights(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_virtual_hub_moderation_queue(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_virtual_hub_moderation_item(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_host_insights(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_hub_moderation_queue(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_virtual_hub_moderation_item(uuid, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_virtual_hub_host_insights(uuid) IS
  'Host/admin aggregate Hub funnel with k=3 suppression, freshness, qualification and queue load.';
COMMENT ON FUNCTION public.resolve_virtual_hub_moderation_item(uuid, text, text, text) IS
  'Idempotent host/admin triage for Hub reports and reactivation reviews. Join approval remains a separate least-privilege command.';
