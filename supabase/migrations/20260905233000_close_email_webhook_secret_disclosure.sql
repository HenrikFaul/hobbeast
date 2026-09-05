-- A live credential disclosure: get_email_webhook_secret() returned the email
-- ingest webhook secret to ANY caller holding the public anon key.
--
-- The function was SECURITY DEFINER with no guard whatsoever, and Supabase's
-- default privileges grant EXECUTE to anon and authenticated at CREATE time.
-- The 20260828011000 migration DOCUMENTED the intent -- "service role; the
-- webhook reads this to verify callers" -- but never enforced it. Verified live
-- as anon before this change: a 64-character secret came back.
--
-- Two independent locks, because either alone has failed us before:
--   1. an in-body service_role check, the same shape resolve_api_key uses, so
--      the function is safe even if a future migration re-grants EXECUTE;
--   2. the revoke, naming anon and authenticated explicitly -- REVOKE FROM
--      PUBLIC alone is a no-op against Supabase's direct role grants.
--
-- Nothing breaks: the only caller in the codebase is supabase/functions/
-- email-inbound/index.ts, which builds its client with the service role key.
--
-- Verified after applying: anon and authenticated have no EXECUTE, service_role
-- does; an anon JWT claim is refused with SERVICE_ROLE_REQUIRED (42501) even
-- when the privilege check is bypassed; service_role still reads the secret.

CREATE OR REPLACE FUNCTION public.get_email_webhook_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_secret text;
BEGIN
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT webhook_secret INTO v_secret FROM public.email_ingest_config WHERE id = true;
  RETURN v_secret;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_email_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_webhook_secret() TO service_role;
