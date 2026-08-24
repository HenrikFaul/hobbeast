-- safeupdate compatibility: the hosted PostgREST connection path loads pg-safeupdate,
-- which rejects UPDATE/DELETE statements that carry no top-level WHERE clause.
CREATE OR REPLACE FUNCTION public.refresh_external_supply_freshness()
 RETURNS TABLE(event_rows integer, place_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_event_rows integer := 0;
  v_place_rows integer := 0;
BEGIN
  UPDATE public.external_events
  SET freshness_state = CASE
        WHEN last_verified_at IS NULL THEN 'unknown'
        WHEN last_verified_at >= now() - interval '24 hours' THEN 'fresh'
        WHEN last_verified_at >= now() - interval '72 hours' THEN 'aging'
        ELSE 'stale'
      END,
      import_state = CASE
        WHEN import_state IN ('cancelled', 'rejected', 'review') THEN import_state
        WHEN last_verified_at < now() - interval '72 hours' THEN 'stale'
        ELSE 'active'
      END
  WHERE is_active = true;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  UPDATE public.places_local_catalog
  SET freshness_state = CASE
        WHEN last_verified_at IS NULL THEN 'unknown'
        WHEN last_verified_at >= now() - interval '7 days' THEN 'fresh'
        WHEN last_verified_at >= now() - interval '30 days' THEN 'aging'
        ELSE 'stale'
      END,
      import_state = CASE
        WHEN import_state IN ('rejected', 'review') THEN import_state
        WHEN last_verified_at < now() - interval '30 days' THEN 'stale'
        ELSE 'active'
      END
  WHERE true;
  GET DIAGNOSTICS v_place_rows = ROW_COUNT;

  RETURN QUERY SELECT v_event_rows, v_place_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_virtual_hubs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile RECORD;
  v_hobby text;
  v_hub_id uuid;
BEGIN
  -- Clear existing members (rebuild)
  DELETE FROM virtual_hub_members WHERE true;

  -- For each profile with hobbies
  FOR v_profile IN
    SELECT user_id, hobbies, city FROM profiles WHERE hobbies IS NOT NULL AND array_length(hobbies, 1) > 0
  LOOP
    FOREACH v_hobby IN ARRAY v_profile.hobbies
    LOOP
      -- Upsert hub
      INSERT INTO virtual_hubs (hobby_category, city)
      VALUES (v_hobby, v_profile.city)
      ON CONFLICT (hobby_category, hobby_subcategory, hobby_activity, city)
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_hub_id;

      -- Add member
      INSERT INTO virtual_hub_members (hub_id, user_id)
      VALUES (v_hub_id, v_profile.user_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Update member counts
  UPDATE virtual_hubs SET member_count = (
    SELECT count(*) FROM virtual_hub_members WHERE hub_id = virtual_hubs.id
  ) WHERE true;
END;
$function$;;
