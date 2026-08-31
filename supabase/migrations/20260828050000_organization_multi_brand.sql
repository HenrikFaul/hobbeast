-- O-I: multiple brands under one organization.
--
-- A "brand" is simply an organization with a parent. Every existing surface —
-- public page, follow, verification, analytics, API keys, event attachment —
-- already works per-organization, so a brand reuses all of it for free. The one
-- new idea: the parent's team operates its brands, which is a single ADDITIVE
-- branch on is_organization_member (it only ever grants more access, never less;
-- a top-level org with no parent is unaffected). Proven live: a brand is created
-- with its parent set and its creator as owner; a parent admin operates the brand
-- with zero direct membership (editor/admin yes, owner no); an outsider is
-- refused; existing direct ownership is unchanged.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS parent_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_organizations_parent ON public.organizations(parent_organization_id)
  WHERE parent_organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_organization_member(p_org_id uuid, p_min_role text DEFAULT 'viewer'::text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND CASE p_min_role
        WHEN 'owner'  THEN m.role = 'owner'
        WHEN 'admin'  THEN m.role IN ('owner', 'admin')
        WHEN 'editor' THEN m.role IN ('owner', 'admin', 'editor')
        WHEN 'checkin' THEN m.role IN ('owner', 'admin', 'editor', 'checkin')
        ELSE m.role IN ('owner', 'admin', 'editor', 'checkin', 'viewer')
      END
  )
  OR EXISTS (
    -- Additive brand branch: a member of the parent org, at a given role, operates
    -- each of its brands at that role.
    SELECT 1
    FROM public.organizations b
    JOIN public.organization_members pm ON pm.organization_id = b.parent_organization_id
    WHERE b.id = p_org_id
      AND b.parent_organization_id IS NOT NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND CASE p_min_role
        WHEN 'owner'  THEN pm.role = 'owner'
        WHEN 'admin'  THEN pm.role IN ('owner', 'admin')
        WHEN 'editor' THEN pm.role IN ('owner', 'admin', 'editor')
        WHEN 'checkin' THEN pm.role IN ('owner', 'admin', 'editor', 'checkin')
        ELSE pm.role IN ('owner', 'admin', 'editor', 'checkin', 'viewer')
      END
  );
$function$;

-- Create a brand under a top-level organization. Admin+ of the parent only.
CREATE OR REPLACE FUNCTION public.create_brand(p_parent_org_id uuid, p_name text, p_kind text DEFAULT 'community'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slug text; v_base text; v_id uuid; v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_organization_member(p_parent_org_id, 'admin') THEN
    RAISE EXCEPTION 'ORG_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = p_parent_org_id AND parent_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'BRAND_CANNOT_HAVE_BRANDS' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) < 2 THEN RAISE EXCEPTION 'NAME_TOO_SHORT' USING ERRCODE = '22023'; END IF;

  v_base := lower(btrim(p_name));
  v_base := translate(v_base, 'áàâäãéèêëíìîïóòôöõőúùûüűñç', 'aaaaaeeeeiiiioooooouuuuunc');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(regexp_replace(v_base, '(^-+|-+$)', '', 'g'), '-');
  IF length(v_base) < 2 THEN v_base := 'marka'; END IF;
  v_base := left(v_base, 40);
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1; v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO public.organizations (slug, name, kind, created_by, parent_organization_id)
  VALUES (v_slug, btrim(p_name), coalesce(nullif(p_kind, ''), 'community'), auth.uid(), p_parent_org_id)
  RETURNING id INTO v_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
  VALUES (v_id, auth.uid(), 'owner', 'active', now());

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_organization_brands(p_parent_org_id uuid)
RETURNS TABLE(id uuid, slug text, name text, kind text, logo_url text, verification_status text, follower_count integer, events_total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT b.id, b.slug, b.name, b.kind, b.logo_url, b.verification_status, b.follower_count,
         (SELECT count(*) FROM public.events e WHERE e.organization_id = b.id)
  FROM public.organizations b
  WHERE b.parent_organization_id = p_parent_org_id
    AND public.is_organization_member(p_parent_org_id, 'viewer')
  ORDER BY b.name;
$function$;

-- list_my_organizations now carries parent_organization_id and also includes
-- brands reachable through parent-admin membership. Return-type change → drop first.
DROP FUNCTION IF EXISTS public.list_my_organizations();
CREATE FUNCTION public.list_my_organizations()
RETURNS TABLE(id uuid, slug text, name text, kind text, logo_url text, verification_status text, my_role text, member_status text, follower_count integer, parent_organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.id, o.slug, o.name, o.kind, o.logo_url, o.verification_status,
         m.role, m.status, o.follower_count, o.parent_organization_id
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status IN ('active', 'invited')
  UNION
  SELECT b.id, b.slug, b.name, b.kind, b.logo_url, b.verification_status,
         pm.role, 'active', b.follower_count, b.parent_organization_id
  FROM public.organizations b
  JOIN public.organization_members pm ON pm.organization_id = b.parent_organization_id
  WHERE b.parent_organization_id IS NOT NULL
    AND pm.user_id = auth.uid() AND pm.status = 'active' AND pm.role IN ('owner', 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.organization_members dm WHERE dm.organization_id = b.id AND dm.user_id = auth.uid())
  ORDER BY name;
$function$;