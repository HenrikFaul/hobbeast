-- Prompt 07 remediation: readiness-gated events must not become discoverable
-- before the audited readiness publication RPC succeeds.
--
-- Rollback: disable `organizer_readiness_enforcement`, then restore the
-- preceding insert trigger function and drop the lifecycle guard trigger and
-- function. Existing draft events must be reviewed explicitly before any
-- rollback activation; never bulk-publish them as part of rollback.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_new_event_readiness_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  subject_id uuid := COALESCE(NEW.organizer_id, NEW.created_by);
  readiness_enabled boolean := false;
BEGIN
  IF subject_id IS NOT NULL THEN
    readiness_enabled := public.feature_enabled_for_subject(
      'organizer_readiness_enforcement',
      subject_id
    );
  END IF;

  -- These fields are server-owned. Do not trust caller-provided lifecycle or
  -- readiness values on insert.
  NEW.organizer_readiness_required := readiness_enabled;
  NEW.readiness_enforcement_version := CASE
    WHEN readiness_enabled THEN 'organizer-readiness-v2'
    ELSE NULL
  END;

  IF readiness_enabled THEN
    NEW.outcome_status := 'draft';
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_new_event_readiness_requirement()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_event_readiness_lifecycle_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- PostgREST mutations run as anon/authenticated. The approved lifecycle RPCs
  -- are SECURITY DEFINER and therefore execute the guarded UPDATE as their
  -- trusted owner. This keeps ordinary detail edits available while lifecycle
  -- transitions remain atomic and audited.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.organizer_readiness_required IS DISTINCT FROM OLD.organizer_readiness_required
       OR NEW.readiness_enforcement_version IS DISTINCT FROM OLD.readiness_enforcement_version THEN
      RAISE EXCEPTION 'EVENT_READINESS_FIELDS_SERVER_OWNED' USING ERRCODE = '42501';
    END IF;

    IF OLD.organizer_readiness_required
       AND (
         NEW.outcome_status IS DISTINCT FROM OLD.outcome_status
         OR NEW.is_active IS DISTINCT FROM OLD.is_active
       ) THEN
      RAISE EXCEPTION 'EVENT_READINESS_LIFECYCLE_RPC_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_event_readiness_lifecycle_boundary()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_event_readiness_lifecycle_boundary ON public.events;
CREATE TRIGGER trg_enforce_event_readiness_lifecycle_boundary
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_readiness_lifecycle_boundary();

COMMENT ON FUNCTION public.mark_new_event_readiness_requirement() IS
  'Server-owned readiness insert boundary: gated events are created as inactive drafts and remain undiscoverable.';
COMMENT ON FUNCTION public.enforce_event_readiness_lifecycle_boundary() IS
  'Blocks direct readiness/lifecycle mutations; trusted audited SECURITY DEFINER event lifecycle RPCs remain authoritative.';

COMMIT;
