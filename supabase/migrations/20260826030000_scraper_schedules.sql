-- Admin-configurable scraper schedules.
--
-- Design choice: operators pick HOURS and WEEKDAYS in the UI instead of typing
-- cron syntax. A single pg_cron job runs the dispatcher hourly; it decides which
-- schedules are due in Europe/Budapest time and fires the GitHub workflow through
-- pg_net. last_triggered_at makes a double-fire within the same hour impossible.

CREATE TABLE IF NOT EXISTS public.scraper_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  run_at_hours smallint[] NOT NULL DEFAULT '{6,14,22}',
  days_of_week smallint[],                       -- NULL = every day; 1=Mon .. 7=Sun
  source_ids text[],                             -- NULL = automatic rotation
  sources_per_run smallint NOT NULL DEFAULT 40,
  details_per_source smallint NOT NULL DEFAULT 40,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  last_status text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scraper_schedules_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT scraper_schedules_hours_ok CHECK (
    array_length(run_at_hours, 1) BETWEEN 1 AND 24
    AND run_at_hours <@ ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]
  ),
  CONSTRAINT scraper_schedules_days_ok CHECK (
    days_of_week IS NULL OR days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT scraper_schedules_budget_ok CHECK (
    sources_per_run BETWEEN 1 AND 100 AND details_per_source BETWEEN 1 AND 100
  )
);

ALTER TABLE public.scraper_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scraper_schedules FROM anon, authenticated;

-- Admin-facing CRUD (providers.manage gated) -------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_scraper_schedules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT CASE WHEN public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'run_at_hours', s.run_at_hours,
      'days_of_week', s.days_of_week, 'source_ids', s.source_ids,
      'sources_per_run', s.sources_per_run, 'details_per_source', s.details_per_source,
      'enabled', s.enabled, 'last_triggered_at', s.last_triggered_at,
      'last_status', s.last_status
    ) ORDER BY s.created_at) FROM public.scraper_schedules s), '[]'::jsonb)
  ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_scraper_schedules() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_scraper_schedules() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_scraper_schedule(
  p_id uuid,
  p_name text,
  p_run_at_hours smallint[],
  p_days_of_week smallint[],
  p_source_ids text[],
  p_sources_per_run smallint DEFAULT 40,
  p_details_per_source smallint DEFAULT 40,
  p_enabled boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.scraper_schedules AS s (
    id, name, run_at_hours, days_of_week, source_ids,
    sources_per_run, details_per_source, enabled, created_by
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()), p_name, p_run_at_hours, p_days_of_week,
    NULLIF(p_source_ids, '{}'::text[]),
    COALESCE(p_sources_per_run, 40), COALESCE(p_details_per_source, 40),
    COALESCE(p_enabled, true), auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    run_at_hours = EXCLUDED.run_at_hours,
    days_of_week = EXCLUDED.days_of_week,
    source_ids = EXCLUDED.source_ids,
    sources_per_run = EXCLUDED.sources_per_run,
    details_per_source = EXCLUDED.details_per_source,
    enabled = EXCLUDED.enabled,
    updated_at = now()
  RETURNING s.id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_scraper_schedule(uuid, text, smallint[], smallint[], text[], smallint, smallint, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_scraper_schedule(uuid, text, smallint[], smallint[], text[], smallint, smallint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_scraper_schedule(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.scraper_schedules WHERE id = p_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_scraper_schedule(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_scraper_schedule(uuid) TO authenticated;

-- Dispatcher ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_due_scraper_schedules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'net', 'vault'
AS $$
DECLARE
  v_token text;
  v_now timestamptz := now();
  v_local timestamptz := now() AT TIME ZONE 'Europe/Budapest';
  v_hour smallint := EXTRACT(HOUR FROM v_local)::smallint;
  v_dow smallint := EXTRACT(ISODOW FROM v_local)::smallint;
  v_fired integer := 0;
  r record;
  v_inputs jsonb;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets WHERE name = 'github_workflow_token' LIMIT 1;
  IF v_token IS NULL THEN
    RAISE WARNING 'run_due_scraper_schedules: dispatch token missing';
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.scraper_schedules
    WHERE enabled
      AND v_hour = ANY(run_at_hours)
      AND (days_of_week IS NULL OR v_dow = ANY(days_of_week))
      -- Never fire twice inside the same local hour.
      AND (last_triggered_at IS NULL OR last_triggered_at < date_trunc('hour', v_now))
  LOOP
    v_inputs := jsonb_build_object(
      'sources', r.sources_per_run::text,
      'details', r.details_per_source::text
    );
    IF r.source_ids IS NOT NULL AND array_length(r.source_ids, 1) > 0 THEN
      v_inputs := v_inputs || jsonb_build_object('only', array_to_string(r.source_ids, ','));
    END IF;

    PERFORM net.http_post(
      url := 'https://api.github.com/repos/HenrikFaul/hobbeast/actions/workflows/event-scraper.yml/dispatches',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Accept', 'application/vnd.github+json',
        'User-Agent', 'hobbeast-scheduler',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('ref', 'main', 'inputs', v_inputs)
    );

    UPDATE public.scraper_schedules
    SET last_triggered_at = v_now, last_status = 'dispatched', updated_at = v_now
    WHERE id = r.id;
    v_fired := v_fired + 1;
  END LOOP;

  RETURN v_fired;
END;
$$;
REVOKE ALL ON FUNCTION public.run_due_scraper_schedules() FROM public, anon, authenticated;

-- Hourly dispatcher tick.
SELECT cron.unschedule('scraper-schedule-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scraper-schedule-dispatch');
SELECT cron.schedule('scraper-schedule-dispatch', '2 * * * *', 'SELECT public.run_due_scraper_schedules();');

-- Seed the previously hard-coded GitHub cron as an editable schedule.
INSERT INTO public.scraper_schedules (name, run_at_hours, days_of_week, source_ids, sources_per_run, details_per_source)
SELECT 'Napi automatikus begyűjtés', ARRAY[6,14,22]::smallint[], NULL, NULL, 40, 40
WHERE NOT EXISTS (SELECT 1 FROM public.scraper_schedules);
