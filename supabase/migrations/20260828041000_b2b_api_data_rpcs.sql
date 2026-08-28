-- Public B2B API — data access RPCs (Slice O-G).
--
-- Called by the api-b2b edge function after it has authenticated the x-api-key
-- and resolved its organization. Service-role only; every call is scoped to that
-- organization, so a key can only ever read or write its own data.
--
-- Record of the migrations applied live via the Supabase MCP:
--   b2b_api_data_rpcs, b2b_api_create_event_use_external_id
-- Consolidated here in final form. Additive and non-regressive.

CREATE OR REPLACE FUNCTION public.api_list_org_events(p_org_id uuid, p_limit integer DEFAULT 50, p_from date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'category', e.category,
    'event_date', e.event_date, 'event_time', e.event_time,
    'city', e.location_city, 'address', e.location_address,
    'max_attendees', e.max_attendees, 'status', coalesce(e.outcome_status, 'published'),
    'url', 'https://expericentre.com/events/' || e.id
  ) ORDER BY e.event_date), '[]'::jsonb)
  FROM public.events e
  WHERE e.organization_id = p_org_id
    AND (p_from IS NULL OR e.event_date >= p_from)
  LIMIT greatest(1, least(200, coalesce(p_limit, 50)));
$$;
REVOKE ALL ON FUNCTION public.api_list_org_events(uuid, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_list_org_events(uuid, integer, date) TO service_role;

CREATE OR REPLACE FUNCTION public.api_get_org_event(p_org_id uuid, p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'category', e.category, 'description', e.description,
    'event_date', e.event_date, 'event_time', e.event_time,
    'city', e.location_city, 'address', e.location_address,
    'max_attendees', e.max_attendees, 'status', coalesce(e.outcome_status, 'published'),
    'participants', (SELECT count(*) FROM public.event_participants p
       WHERE p.event_id = e.id AND p.status IN ('going','checked_in','completed')),
    'url', 'https://expericentre.com/events/' || e.id
  )
  FROM public.events e
  WHERE e.id = p_event_id AND e.organization_id = p_org_id;
$$;
REVOKE ALL ON FUNCTION public.api_get_org_event(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_get_org_event(uuid, uuid) TO service_role;

-- Create an event under the organization. Idempotent on an idempotency key
-- (stored in events.external_id, namespaced by org), so a retried POST never
-- doubles. The event is owned by an org owner — the create authority stays a
-- real person — and stamped with the organization.
CREATE OR REPLACE FUNCTION public.api_create_org_event(p_org_id uuid, p_event jsonb, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_owner uuid; v_id uuid; v_date date; v_title text; v_ext text;
BEGIN
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_ext := CASE WHEN p_idempotency_key IS NULL THEN NULL
                ELSE 'b2b_api:' || p_org_id::text || ':' || p_idempotency_key END;

  IF v_ext IS NOT NULL THEN
    SELECT id INTO v_id FROM public.events
    WHERE organization_id = p_org_id AND external_id = v_ext
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_id, 'replayed', true, 'url', 'https://expericentre.com/events/' || v_id);
    END IF;
  END IF;

  v_title := btrim(coalesce(p_event ->> 'title', ''));
  v_date := nullif(p_event ->> 'event_date', '')::date;
  IF length(v_title) < 3 THEN RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE = '22023'; END IF;
  IF v_date IS NULL OR v_date < current_date THEN RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE = '22023'; END IF;

  SELECT user_id INTO v_owner FROM public.organization_members
  WHERE organization_id = p_org_id AND role = 'owner' AND status = 'active' LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ORG_HAS_NO_OWNER' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.events (
    title, category, description, event_date, event_time,
    location_type, location_city, location_address, max_attendees,
    image_emoji, created_by, organization_id, outcome_status, is_active, external_id
  ) VALUES (
    left(v_title, 200), coalesce(nullif(p_event ->> 'category', ''), 'Egyéb'),
    p_event ->> 'description', v_date, nullif(p_event ->> 'event_time', '')::time,
    'address', p_event ->> 'city', p_event ->> 'address',
    nullif(p_event ->> 'max_attendees', '')::integer,
    coalesce(nullif(p_event ->> 'emoji', ''), '📅'), v_owner, p_org_id,
    'published', true, v_ext
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'replayed', false, 'url', 'https://expericentre.com/events/' || v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.api_create_org_event(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_create_org_event(uuid, jsonb, text) TO service_role;
