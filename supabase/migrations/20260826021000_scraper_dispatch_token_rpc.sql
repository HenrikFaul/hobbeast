-- Service-role-only accessor for the GitHub dispatch token stored in Vault as
-- 'github_workflow_token'. Used by the scraper-control edge function; the token
-- never leaves the backend. Replace the secret with a fine-grained PAT when
-- possible: SELECT vault.update_secret(id, '<new-token>') on the vault secret.
CREATE OR REPLACE FUNCTION public.get_scraper_dispatch_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'vault'
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'github_workflow_token' LIMIT 1);
END;
$$;
REVOKE ALL ON FUNCTION public.get_scraper_dispatch_token() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_scraper_dispatch_token() TO service_role;
