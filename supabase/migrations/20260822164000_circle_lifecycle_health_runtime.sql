-- Prompt 04 premium second pass: correct, privacy-bounded Circle health metrics
-- and fail-closed lifecycle transitions. Metrics are group-level and never
-- infer a member's psychological or health state.
-- Rollback: restore the prior view/function definitions; no data table is added.

CREATE OR REPLACE VIEW public.circle_health_dashboard
WITH (security_barrier = true)
AS
SELECT
  circle.id AS circle_id,
  circle.name,
  circle.host_id,
  coalesce(member_stats.active_members, 0) AS active_members,
  coalesce(member_stats.new_members_30d, 0) AS new_members_30d,
  coalesce(event_stats.event_count, 0) AS event_count,
  coalesce(repeat_stats.returning_attendees, 0) AS returning_attendees,
  coalesce(event_stats.no_show_rate, 0) AS no_show_rate,
  coalesce(report_stats.open_report_count, 0) AS open_report_count,
  greatest(circle.updated_at, coalesce(event_stats.last_event_activity_at, circle.updated_at)) AS last_activity_at,
  coalesce(event_stats.events_30d, 0) AS events_30d,
  event_stats.next_event_at,
  coalesce(report_stats.reports_30d, 0) AS reports_30d,
  coalesce(report_stats.prior_reports_30d, 0) AS prior_reports_30d,
  coalesce(member_stats.pending_requests, 0) AS pending_requests,
  coalesce(member_stats.pending_requests, 0) + coalesce(report_stats.open_report_count, 0) AS host_load,
  CASE
    WHEN event_stats.last_held_event_at IS NULL THEN 'no_events'
    WHEN event_stats.last_held_event_at >= now() - CASE circle.cadence
      WHEN 'weekly' THEN interval '14 days'
      WHEN 'biweekly' THEN interval '30 days'
      WHEN 'monthly' THEN interval '60 days'
      ELSE interval '90 days'
    END THEN 'on_track'
    ELSE 'attention'
  END AS cadence_status,
  CASE WHEN coalesce(member_stats.active_members, 0) = 0 THEN 0::numeric
    ELSE round(
      coalesce(repeat_stats.returning_attendees, 0)::numeric
      / member_stats.active_members::numeric,
      4
    )
  END AS returning_rate
FROM public.social_circles circle
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE member.membership_status = 'active')::integer AS active_members,
    count(*) FILTER (
      WHERE member.membership_status = 'active'
        AND member.joined_at > now() - interval '30 days'
    )::integer AS new_members_30d,
    count(*) FILTER (WHERE member.membership_status = 'requested')::integer AS pending_requests
  FROM public.social_circle_members member
  WHERE member.circle_id = circle.id
) member_stats ON true
LEFT JOIN LATERAL (
  SELECT
    count(DISTINCT linked.event_id)::integer AS event_count,
    count(DISTINCT linked.event_id) FILTER (
      WHERE coalesce(event.start_time, event.event_date::timestamptz)
        >= now() - interval '30 days'
    )::integer AS events_30d,
    coalesce(
      count(*) FILTER (WHERE participant.status = 'no_show')::numeric
        / NULLIF(count(*) FILTER (
          WHERE participant.status IN ('completed', 'checked_in', 'no_show')
        ), 0),
      0
    ) AS no_show_rate,
    max(event.updated_at) AS last_event_activity_at,
    max(coalesce(event.start_time, event.event_date::timestamptz)) FILTER (
      WHERE participant.status IN ('checked_in', 'completed')
         OR event.outcome_status IN ('held', 'completed')
    ) AS last_held_event_at,
    min(coalesce(event.start_time, event.event_date::timestamptz)) FILTER (
      WHERE event.is_active
        AND coalesce(event.outcome_status, 'scheduled') NOT IN ('cancelled', 'held', 'completed')
        AND coalesce(event.start_time, event.event_date::timestamptz) >= now()
    ) AS next_event_at
  FROM public.social_circle_events linked
  JOIN public.events event ON event.id = linked.event_id
  LEFT JOIN public.event_participants participant ON participant.event_id = linked.event_id
  WHERE linked.circle_id = circle.id
) event_stats ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS returning_attendees
  FROM (
    SELECT participant.user_id
    FROM public.social_circle_events linked
    JOIN public.event_participants participant ON participant.event_id = linked.event_id
    WHERE linked.circle_id = circle.id
      AND participant.status IN ('checked_in', 'completed')
    GROUP BY participant.user_id
    HAVING count(DISTINCT linked.event_id) >= 2
  ) repeat_member
) repeat_stats ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (
      WHERE report.status IN ('submitted', 'triaged', 'investigating')
    )::integer AS open_report_count,
    count(*) FILTER (
      WHERE report.created_at >= now() - interval '30 days'
    )::integer AS reports_30d,
    count(*) FILTER (
      WHERE report.created_at >= now() - interval '60 days'
        AND report.created_at < now() - interval '30 days'
    )::integer AS prior_reports_30d
  FROM public.user_reports report
  WHERE report.context_type = 'circle' AND report.context_id = circle.id
) report_stats ON true
WHERE (circle.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  AND NOT public.is_resource_removed('circle', circle.id::text);

REVOKE ALL ON public.circle_health_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.circle_health_dashboard TO authenticated;

CREATE OR REPLACE FUNCTION public.get_circle_health(_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  health_row public.circle_health_dashboard%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed('circle', _circle_id::text) THEN
    RAISE EXCEPTION 'Circle is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO health_row
  FROM public.circle_health_dashboard dashboard
  WHERE dashboard.circle_id = _circle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle host access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'circle_id', health_row.circle_id,
    'active_members', health_row.active_members,
    'new_members_30d', health_row.new_members_30d,
    'event_count', health_row.event_count,
    'events_30d', health_row.events_30d,
    'returning_attendees', health_row.returning_attendees,
    'returning_rate', health_row.returning_rate,
    'no_show_rate', health_row.no_show_rate,
    'open_report_count', health_row.open_report_count,
    'reports_30d', health_row.reports_30d,
    'prior_reports_30d', health_row.prior_reports_30d,
    'pending_requests', health_row.pending_requests,
    'host_load', health_row.host_load,
    'cadence_status', health_row.cadence_status,
    'last_activity_at', health_row.last_activity_at,
    'next_event_at', health_row.next_event_at,
    'generated_at', now(),
    'privacy_note', 'Only aggregate, non-diagnostic Circle operations metrics are returned.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_social_circle(
  _circle_id uuid,
  _next_state text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _next_state NOT IN ('draft', 'recruiting', 'active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'Invalid Circle lifecycle state' USING ERRCODE = '22023';
  END IF;
  IF NOT public.feature_enabled_for_subject('circles', auth.uid())
    AND _next_state NOT IN ('paused', 'archived')
    AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Circle feature is unavailable' USING ERRCODE = '42501';
  END IF;
  IF public.is_resource_removed('circle', _circle_id::text)
    AND _next_state <> 'archived' THEN
    RAISE EXCEPTION 'Circle is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT circle.lifecycle_state INTO current_state
  FROM public.social_circles circle
  WHERE circle.id = _circle_id
    AND (circle.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circle host access required' USING ERRCODE = '42501';
  END IF;
  IF current_state = _next_state THEN
    RETURN;
  END IF;
  IF NOT (
    (current_state = 'draft' AND _next_state IN ('recruiting', 'archived'))
    OR (current_state = 'recruiting' AND _next_state IN ('draft', 'active', 'archived'))
    OR (current_state = 'active' AND _next_state IN ('paused', 'archived'))
    OR (current_state = 'paused' AND _next_state IN ('active', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Invalid Circle lifecycle transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_circles
  SET lifecycle_state = _next_state,
      archived_at = CASE WHEN _next_state = 'archived' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = _circle_id;

  INSERT INTO public.social_graph_audit_events (
    actor_id, entity_type, entity_id, event_type, metadata
  ) VALUES (
    auth.uid(), 'circle', _circle_id, 'circle_state_transitioned',
    jsonb_build_object(
      'from', current_state,
      'to', _next_state,
      'reason', left(coalesce(_reason, ''), 500),
      'source', 'circle_lifecycle_runtime'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circle_health(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_social_circle(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_circle_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_social_circle(uuid, text, text)
  TO authenticated;

COMMENT ON VIEW public.circle_health_dashboard IS
  'Host/admin-only aggregate Circle health: cadence, repeat attendance, no-show, reports and operational host load without member profiling.';
COMMENT ON FUNCTION public.get_circle_health(uuid) IS
  'Privacy-bounded aggregate Circle health DTO for the host runtime dashboard.';
