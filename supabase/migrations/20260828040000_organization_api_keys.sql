-- Public B2B API — organization API keys (Slice O-G).
--
-- A verified organization can mint API keys to read and publish its own events
-- programmatically (see supabase/functions/api-b2b). Keys are shown once at mint
-- time and stored only as a sha256 hash + a short prefix, so a leaked database
-- row never yields a usable key. Every management RPC is gated to org admins;
-- resolve_api_key is service-role only (the edge function calls it after the
-- gateway, never the browser).
--
-- Record of the migrations applied live via the Supabase MCP:
--   organization_api_keys, b2b_api_keys_search_path_fix
-- Consolidated here in final form. Additive and non-regressive.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.organization_api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT ARRAY['events:read'::text] NOT NULL,
  created_by uuid NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- Admins may see their own keys (prefix + metadata only; the hash is never
-- exposed by an RPC). No INSERT/UPDATE/DELETE policy: all writes go through the
-- SECURITY DEFINER RPCs below, so the raw key never round-trips the client.
DROP POLICY IF EXISTS "Org admins read their API keys" ON public.organization_api_keys;
CREATE POLICY "Org admins read their API keys" ON public.organization_api_keys
  FOR SELECT USING (public.is_organization_member(organization_id, 'admin'));

-- Mint a key. Owner/admin only. Returns the full key exactly once.
CREATE OR REPLACE FUNCTION public.create_org_api_key(p_org_id uuid, p_name text, p_scopes text[] DEFAULT NULL::text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_key text; v_prefix text; v_id uuid;
BEGIN
  IF NOT public.is_organization_member(p_org_id, 'admin') THEN
    RAISE EXCEPTION 'ORG_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- hbk_live_<40 hex> — random, url-safe, unmistakable.
  v_key := 'hbk_live_' || encode(gen_random_bytes(20), 'hex');
  v_prefix := left(v_key, 16);
  INSERT INTO public.organization_api_keys (organization_id, name, key_hash, key_prefix, scopes, created_by)
  VALUES (p_org_id, coalesce(nullif(btrim(p_name), ''), 'API kulcs'),
          encode(digest(v_key, 'sha256'), 'hex'), v_prefix,
          coalesce(p_scopes, ARRAY['events:read']::text[]), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key', v_key, 'prefix', v_prefix);
END;
$function$;

-- List keys (metadata only, never the hash). Owner/admin only.
CREATE OR REPLACE FUNCTION public.list_org_api_keys(p_org_id uuid)
RETURNS TABLE(id uuid, name text, key_prefix text, scopes text[], last_used_at timestamptz, revoked_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at
  FROM public.organization_api_keys
  WHERE public.is_organization_member(p_org_id, 'admin') AND organization_id = p_org_id
  ORDER BY created_at DESC;
$function$;

-- Revoke a key. Owner/admin of the key's org only.
CREATE OR REPLACE FUNCTION public.revoke_org_api_key(p_key_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_api_keys WHERE id = p_key_id;
  IF v_org IS NULL OR NOT public.is_organization_member(v_org, 'admin') THEN
    RAISE EXCEPTION 'ORG_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organization_api_keys SET revoked_at = now() WHERE id = p_key_id;
END;
$function$;

-- Resolve a presented key to its organization + scopes. Service role only — the
-- api-b2b edge function calls this after the gateway; never the browser. Stamps
-- last_used_at. Returns NULL for an unknown or revoked key.
CREATE OR REPLACE FUNCTION public.resolve_api_key(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_row public.organization_api_keys%ROWTYPE;
BEGIN
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.organization_api_keys
  WHERE key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') AND revoked_at IS NULL;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.organization_api_keys SET last_used_at = now() WHERE id = v_row.id;
  RETURN jsonb_build_object('organization_id', v_row.organization_id, 'scopes', v_row.scopes, 'key_id', v_row.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_api_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_api_key(text) TO service_role;
