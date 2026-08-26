-- Sport clubs and teams: a karate dojo, a rowing club, a hiking club.
--
-- Not a virtual_hub (those are auto-generated online hobby hubs, scored for
-- qualification) and not a social_circle (a small private group of people who
-- already know each other). A club is a real-world organisation with an
-- address, a training schedule and an open door — it exists whether or not
-- Hobbeast does.
--
-- Which is exactly why "joining" here does NOT claim to make anyone a member.
-- Hobbeast cannot enrol you at Budapest Evezős Egyesület; only the club can.
-- What it can do is carry your interest to them and show you the way in. Same
-- honesty rule as the companion plans in v1.28.0: never impersonate the thing
-- you are linking to.

CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  club_type text NOT NULL DEFAULT 'sport_club',
  sport text,
  categories text[] NOT NULL DEFAULT '{}',
  description text,
  country_code text NOT NULL DEFAULT 'HU',
  city text,
  district text,
  postal_code text,
  address text,
  location_lat double precision,
  location_lon double precision,
  website_url text,
  facebook_url text,
  contact_email text,
  contact_phone text,
  logo_url text,
  training_info text,
  membership_info text,
  beginner_friendly boolean,
  accepts_new_members boolean NOT NULL DEFAULT true,
  -- The user who registered or later claimed the club. NULL for a club that
  -- came from a public directory and nobody has claimed yet.
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  source text NOT NULL DEFAULT 'admin',
  source_url text,
  review_state text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clubs_type_check CHECK (club_type IN ('sport_club', 'team', 'hobby_club')),
  CONSTRAINT clubs_source_check CHECK (source IN ('admin', 'directory', 'self_registered')),
  CONSTRAINT clubs_review_state_check CHECK (review_state IN ('pending', 'approved', 'rejected')),
  CONSTRAINT clubs_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT clubs_slug_shape CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,120}$'),
  CONSTRAINT clubs_description_len CHECK (description IS NULL OR char_length(description) <= 4000),
  CONSTRAINT clubs_website_shape CHECK (website_url IS NULL OR website_url ~ '^https?://[^[:space:]]+$'),
  CONSTRAINT clubs_facebook_shape CHECK (facebook_url IS NULL OR facebook_url ~ '^https?://[^[:space:]]+$'),
  CONSTRAINT clubs_email_shape CHECK (contact_email IS NULL OR contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS clubs_discovery_idx
  ON public.clubs (review_state, is_active, sport, city);
CREATE INDEX IF NOT EXISTS clubs_owner_idx ON public.clubs (owner_id);
CREATE INDEX IF NOT EXISTS clubs_name_idx ON public.clubs (lower(name));

CREATE TABLE IF NOT EXISTS public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  -- 'interested' = told the club they would like to come along.
  -- 'member'     = says they already train there.
  -- 'left'       = withdrawn; kept so the club does not see a silent drop.
  status text NOT NULL DEFAULT 'interested',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_members_role_check CHECK (role IN ('member', 'manager')),
  CONSTRAINT club_members_status_check CHECK (status IN ('interested', 'member', 'left')),
  CONSTRAINT club_members_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT club_members_unique UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS club_members_club_idx
  ON public.club_members (club_id) WHERE status <> 'left';

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

-- Reads go through the SECURITY DEFINER functions below. Direct table access
-- is limited to what the caller already owns.
DROP POLICY IF EXISTS "Owners read own club" ON public.clubs;
CREATE POLICY "Owners read own club"
  ON public.clubs FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members read own club membership" ON public.club_members;
CREATE POLICY "Members read own club membership"
  ON public.club_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.feature_flags (key, enabled, rollout_percentage, cohorts, eligibility_rule, owner, expires_at, description)
VALUES (
  'clubs_directory', true, 100, '{}', '{}'::jsonb, 'product',
  timestamptz '2027-12-31 23:59:59+00',
  'Sport clubs and teams: public directory, self-registration and interest signals.'
)
ON CONFLICT (key) DO NOTHING;

-- The unaccent extension is not guaranteed on this project, so the fold is
-- spelled out. It only has to handle Hungarian.
CREATE OR REPLACE FUNCTION public.unaccent_fallback(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT translate(
    coalesce(p_value, ''),
    'áéíóöőúüűÁÉÍÓÖŐÚÜŰ',
    'aeiooouuuAEIOOOUUU'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Slug helper. Hungarian accents fold to ASCII so the URL is typeable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_slug(p_name text, p_city text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT left(
    trim(BOTH '-' FROM regexp_replace(
      lower(unaccent_fallback(btrim(coalesce(p_name, '')) ||
        CASE WHEN coalesce(btrim(p_city), '') <> '' THEN ' ' || btrim(p_city) ELSE '' END)),
      '[^a-z0-9]+', '-', 'g'
    )),
    100
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Public directory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_clubs_public(
  p_sport text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 48,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  WITH bounds AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100) AS page_limit,
           LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS page_offset
  ), candidates AS (
    SELECT c.*
    FROM public.clubs c, bounds b
    WHERE c.is_active = true
      AND c.review_state = 'approved'
      AND (p_sport IS NULL OR c.sport = p_sport)
      AND (p_city IS NULL OR c.city = p_city)
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR public.unaccent_fallback(lower(c.name)) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
        OR public.unaccent_fallback(lower(coalesce(c.sport, ''))) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
        OR public.unaccent_fallback(lower(coalesce(c.city, ''))) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
      )
    ORDER BY c.name
    OFFSET (SELECT page_offset FROM bounds)
    LIMIT (SELECT page_limit + 1 FROM bounds)
  ), numbered AS (
    SELECT c.*, row_number() OVER (ORDER BY c.name) AS rn FROM candidates c
  ), page AS (
    SELECT n.* FROM numbered n, bounds b WHERE n.rn <= b.page_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'club_type', p.club_type,
      'sport', p.sport,
      'categories', p.categories,
      'city', p.city,
      'district', p.district,
      'postal_code', p.postal_code,
      'website_url', p.website_url,
      'facebook_url', p.facebook_url,
      'logo_url', p.logo_url,
      'beginner_friendly', p.beginner_friendly,
      'accepts_new_members', p.accepts_new_members,
      'claimed', p.owner_id IS NOT NULL,
      'interested_count', (
        SELECT count(*) FROM public.club_members m
        JOIN public.profiles pr ON pr.user_id = m.user_id AND pr.is_active = true
        WHERE m.club_id = p.id AND m.status <> 'left'
      )
    ) ORDER BY p.name), '[]'::jsonb),
    'offset', (SELECT page_offset FROM bounds),
    'has_more', (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds),
    'next_offset', CASE
      WHEN (SELECT count(*) FROM numbered) > (SELECT page_limit FROM bounds)
      THEN (SELECT page_offset + page_limit FROM bounds) ELSE NULL END
  )
  FROM page p;
$fn$;

REVOKE ALL ON FUNCTION public.list_clubs_public(text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.list_clubs_public(text, text, text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_public(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_club public.clubs%ROWTYPE;
  v_count integer := 0;
  v_my_status text;
BEGIN
  SELECT * INTO v_club FROM public.clubs
  WHERE slug = p_slug AND is_active = true AND review_state = 'approved';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_count
  FROM public.club_members m
  JOIN public.profiles pr ON pr.user_id = m.user_id AND pr.is_active = true
  WHERE m.club_id = v_club.id AND m.status <> 'left';

  IF v_user_id IS NOT NULL THEN
    SELECT status INTO v_my_status FROM public.club_members
    WHERE club_id = v_club.id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_club.id,
    'slug', v_club.slug,
    'name', v_club.name,
    'club_type', v_club.club_type,
    'sport', v_club.sport,
    'categories', v_club.categories,
    'description', v_club.description,
    'city', v_club.city,
    'district', v_club.district,
    'postal_code', v_club.postal_code,
    'address', v_club.address,
    'location_lat', v_club.location_lat,
    'location_lon', v_club.location_lon,
    'website_url', v_club.website_url,
    'facebook_url', v_club.facebook_url,
    'contact_email', v_club.contact_email,
    'contact_phone', v_club.contact_phone,
    'logo_url', v_club.logo_url,
    'training_info', v_club.training_info,
    'membership_info', v_club.membership_info,
    'beginner_friendly', v_club.beginner_friendly,
    'accepts_new_members', v_club.accepts_new_members,
    'claimed', v_club.owner_id IS NOT NULL,
    'is_owner', v_user_id IS NOT NULL AND v_club.owner_id = v_user_id,
    'source', v_club.source,
    'source_url', v_club.source_url,
    'interested_count', v_count,
    'my_status', v_my_status
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_club_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_club_public(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_club_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT jsonb_build_object(
    'sports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('sport', s.sport, 'clubs', s.clubs) ORDER BY s.clubs DESC, s.sport)
      FROM (
        SELECT sport, count(*) AS clubs FROM public.clubs
        WHERE is_active AND review_state = 'approved' AND sport IS NOT NULL
        GROUP BY sport
      ) s
    ), '[]'::jsonb),
    'cities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('city', c.city, 'clubs', c.clubs) ORDER BY c.clubs DESC, c.city)
      FROM (
        SELECT city, count(*) AS clubs FROM public.clubs
        WHERE is_active AND review_state = 'approved' AND city IS NOT NULL
        GROUP BY city ORDER BY count(*) DESC LIMIT 40
      ) c
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM public.clubs WHERE is_active AND review_state = 'approved')
  );
$fn$;

REVOKE ALL ON FUNCTION public.list_club_facets() FROM public;
GRANT EXECUTE ON FUNCTION public.list_club_facets() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interest. Deliberately NOT enrolment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_club_membership(
  p_club_id uuid,
  p_status text DEFAULT 'interested',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('interested', 'member', 'left') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  IF NOT public.evaluate_feature_flag('clubs_directory', v_user_id, NULL) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = v_user_id AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'USER_SUSPENDED' USING ERRCODE = '42501';
  END IF;

  SELECT slug INTO v_slug FROM public.clubs
  WHERE id = p_club_id AND is_active = true AND review_state = 'approved';
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'CLUB_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.club_members (club_id, user_id, status, note)
  VALUES (p_club_id, v_user_id, p_status, NULLIF(btrim(coalesce(p_note, '')), ''))
  ON CONFLICT (club_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        note = COALESCE(EXCLUDED.note, club_members.note),
        updated_at = now();

  RETURN public.get_club_public(v_slug);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_club_membership(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_club_membership(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Self-registration by the club itself. Lands as 'pending'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_club_registration(
  p_name text,
  p_sport text,
  p_city text,
  p_club_type text DEFAULT 'sport_club',
  p_description text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_website_url text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_training_info text DEFAULT NULL,
  p_membership_info text DEFAULT NULL,
  p_beginner_friendly boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_slug text;
  v_id uuid;
  v_suffix integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.evaluate_feature_flag('clubs_directory', v_user_id, NULL) THEN
    RAISE EXCEPTION 'FEATURE_DISABLED' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_name, ''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = '22023';
  END IF;
  IF p_club_type NOT IN ('sport_club', 'team', 'hobby_club') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;
  -- One pending registration per person at a time keeps the review queue from
  -- being flooded from a single account.
  IF (SELECT count(*) FROM public.clubs
      WHERE owner_id = v_user_id AND review_state = 'pending') >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_PENDING' USING ERRCODE = '22023';
  END IF;

  v_slug := public.club_slug(p_name, p_city);
  IF v_slug IS NULL OR v_slug = '' THEN v_slug := 'klub'; END IF;
  WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := left(public.club_slug(p_name, p_city), 90) || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.clubs (
    slug, name, club_type, sport, city, postal_code, address, description,
    website_url, facebook_url, contact_email, contact_phone,
    training_info, membership_info, beginner_friendly,
    owner_id, claimed_at, source, review_state
  ) VALUES (
    v_slug, btrim(p_name), p_club_type, NULLIF(btrim(coalesce(p_sport, '')), ''),
    NULLIF(btrim(coalesce(p_city, '')), ''), NULLIF(btrim(coalesce(p_postal_code, '')), ''),
    NULLIF(btrim(coalesce(p_address, '')), ''), NULLIF(btrim(coalesce(p_description, '')), ''),
    NULLIF(btrim(coalesce(p_website_url, '')), ''), NULLIF(btrim(coalesce(p_facebook_url, '')), ''),
    NULLIF(btrim(coalesce(p_contact_email, '')), ''), NULLIF(btrim(coalesce(p_contact_phone, '')), ''),
    NULLIF(btrim(coalesce(p_training_info, '')), ''), NULLIF(btrim(coalesce(p_membership_info, '')), ''),
    p_beginner_friendly, v_user_id, now(), 'self_registered', 'pending'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.club_members (club_id, user_id, role, status)
  VALUES (v_id, v_user_id, 'manager', 'member')
  ON CONFLICT (club_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug, 'review_state', 'pending');
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_club_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_club_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_clubs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name, 'sport', c.sport, 'city', c.city,
    'review_state', c.review_state, 'is_active', c.is_active,
    'role', m.role, 'status', m.status,
    'interested_count', (
      SELECT count(*) FROM public.club_members x
      JOIN public.profiles pr ON pr.user_id = x.user_id AND pr.is_active = true
      WHERE x.club_id = c.id AND x.status <> 'left'
    )
  ) ORDER BY c.name), '[]'::jsonb)
  FROM public.club_members m
  JOIN public.clubs c ON c.id = m.club_id
  WHERE m.user_id = auth.uid() AND m.status <> 'left';
$fn$;

REVOKE ALL ON FUNCTION public.list_my_clubs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_my_clubs() TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_clubs(
  p_review_state text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::jsonb),
    'counts', (
      SELECT jsonb_object_agg(review_state, n) FROM (
        SELECT review_state, count(*) AS n FROM public.clubs GROUP BY review_state
      ) s
    )
  ) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'club_type', c.club_type,
      'sport', c.sport, 'city', c.city, 'district', c.district,
      'postal_code', c.postal_code, 'address', c.address,
      'website_url', c.website_url, 'facebook_url', c.facebook_url,
      'contact_email', c.contact_email, 'contact_phone', c.contact_phone,
      'training_info', c.training_info, 'membership_info', c.membership_info,
      'description', c.description, 'beginner_friendly', c.beginner_friendly,
      'accepts_new_members', c.accepts_new_members,
      'source', c.source, 'source_url', c.source_url,
      'review_state', c.review_state, 'review_note', c.review_note,
      'is_active', c.is_active, 'claimed', c.owner_id IS NOT NULL,
      'created_at', c.created_at,
      'interested_count', (
        SELECT count(*) FROM public.club_members m WHERE m.club_id = c.id AND m.status <> 'left'
      )
    ) AS row
    FROM public.clubs c
    WHERE (p_review_state IS NULL OR c.review_state = p_review_state)
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR public.unaccent_fallback(lower(c.name)) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
        OR public.unaccent_fallback(lower(coalesce(c.city, ''))) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
        OR public.unaccent_fallback(lower(coalesce(c.sport, ''))) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
      )
    ORDER BY c.created_at DESC
    OFFSET LEAST(GREATEST(COALESCE(p_offset, 0), 0), 100000)
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ) rows;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_clubs(text, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clubs(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_club(
  p_club_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.admin_has_capability(v_actor, 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs
     SET review_state = p_decision,
         review_note = NULLIF(btrim(coalesce(p_note, '')), ''),
         reviewed_by = v_actor,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLUB_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('id', p_club_id, 'review_state', p_decision);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_review_club(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_club(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_club(
  p_name text,
  p_sport text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_club_type text DEFAULT 'sport_club',
  p_description text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_website_url text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_training_info text DEFAULT NULL,
  p_membership_info text DEFAULT NULL,
  p_beginner_friendly boolean DEFAULT NULL,
  p_accepts_new_members boolean DEFAULT true,
  p_review_state text DEFAULT 'approved',
  p_is_active boolean DEFAULT true,
  p_club_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_slug text;
  v_id uuid := p_club_id;
  v_suffix integer := 0;
BEGIN
  IF NOT public.admin_has_capability(v_actor, 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_name, ''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    v_slug := public.club_slug(p_name, p_city);
    IF v_slug IS NULL OR v_slug = '' THEN v_slug := 'klub'; END IF;
    WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = v_slug) LOOP
      v_suffix := v_suffix + 1;
      v_slug := left(public.club_slug(p_name, p_city), 90) || '-' || v_suffix::text;
    END LOOP;

    INSERT INTO public.clubs (
      slug, name, club_type, sport, city, postal_code, address, description,
      website_url, facebook_url, contact_email, contact_phone,
      training_info, membership_info, beginner_friendly, accepts_new_members,
      source, review_state, is_active, reviewed_by, reviewed_at
    ) VALUES (
      v_slug, btrim(p_name), p_club_type, NULLIF(btrim(coalesce(p_sport, '')), ''),
      NULLIF(btrim(coalesce(p_city, '')), ''), NULLIF(btrim(coalesce(p_postal_code, '')), ''),
      NULLIF(btrim(coalesce(p_address, '')), ''), NULLIF(btrim(coalesce(p_description, '')), ''),
      NULLIF(btrim(coalesce(p_website_url, '')), ''), NULLIF(btrim(coalesce(p_facebook_url, '')), ''),
      NULLIF(btrim(coalesce(p_contact_email, '')), ''), NULLIF(btrim(coalesce(p_contact_phone, '')), ''),
      NULLIF(btrim(coalesce(p_training_info, '')), ''), NULLIF(btrim(coalesce(p_membership_info, '')), ''),
      p_beginner_friendly, COALESCE(p_accepts_new_members, true),
      'admin', COALESCE(p_review_state, 'approved'), COALESCE(p_is_active, true), v_actor, now()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.clubs SET
      name = btrim(p_name),
      club_type = p_club_type,
      sport = NULLIF(btrim(coalesce(p_sport, '')), ''),
      city = NULLIF(btrim(coalesce(p_city, '')), ''),
      postal_code = NULLIF(btrim(coalesce(p_postal_code, '')), ''),
      address = NULLIF(btrim(coalesce(p_address, '')), ''),
      description = NULLIF(btrim(coalesce(p_description, '')), ''),
      website_url = NULLIF(btrim(coalesce(p_website_url, '')), ''),
      facebook_url = NULLIF(btrim(coalesce(p_facebook_url, '')), ''),
      contact_email = NULLIF(btrim(coalesce(p_contact_email, '')), ''),
      contact_phone = NULLIF(btrim(coalesce(p_contact_phone, '')), ''),
      training_info = NULLIF(btrim(coalesce(p_training_info, '')), ''),
      membership_info = NULLIF(btrim(coalesce(p_membership_info, '')), ''),
      beginner_friendly = p_beginner_friendly,
      accepts_new_members = COALESCE(p_accepts_new_members, true),
      review_state = COALESCE(p_review_state, review_state),
      is_active = COALESCE(p_is_active, is_active),
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CLUB_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_club(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, text, boolean, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_club(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, text, boolean, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_club_members(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'display_name', COALESCE(NULLIF(btrim(pr.display_name), ''), 'Hobbeast tag'),
      'role', m.role,
      'status', m.status,
      'created_at', m.created_at
    ) ORDER BY m.created_at DESC)
    FROM public.club_members m
    JOIN public.profiles pr ON pr.user_id = m.user_id
    WHERE m.club_id = p_club_id AND m.status <> 'left'
  ), '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_club_members(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_club_members(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Directory harvest. Service-role only: this is how scripts/harvest-sport-clubs
-- loads a public federation or club-finder directory.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_directory_clubs(p_clubs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_item jsonb;
  v_slug text;
  v_suffix integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_clubs, '[]'::jsonb)) LOOP
    v_name := btrim(coalesce(v_item->>'name', ''));
    CONTINUE WHEN char_length(v_name) < 2;

    -- Already known by name+city? Fill gaps, never overwrite curated text.
    UPDATE public.clubs SET
      sport = COALESCE(sport, NULLIF(btrim(coalesce(v_item->>'sport', '')), '')),
      postal_code = COALESCE(postal_code, NULLIF(btrim(coalesce(v_item->>'postal_code', '')), '')),
      website_url = COALESCE(website_url, NULLIF(btrim(coalesce(v_item->>'website_url', '')), '')),
      facebook_url = COALESCE(facebook_url, NULLIF(btrim(coalesce(v_item->>'facebook_url', '')), '')),
      source_url = COALESCE(source_url, NULLIF(btrim(coalesce(v_item->>'source_url', '')), '')),
      updated_at = now()
    WHERE public.unaccent_fallback(lower(name)) = public.unaccent_fallback(lower(v_name))
      AND COALESCE(public.unaccent_fallback(lower(city)), '')
          = COALESCE(public.unaccent_fallback(lower(NULLIF(btrim(coalesce(v_item->>'city', '')), ''))), '');

    IF FOUND THEN
      v_updated := v_updated + 1;
      CONTINUE;
    END IF;

    v_slug := public.club_slug(v_name, v_item->>'city');
    IF v_slug IS NULL OR v_slug = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = v_slug) LOOP
      v_suffix := v_suffix + 1;
      v_slug := left(public.club_slug(v_name, v_item->>'city'), 90) || '-' || v_suffix::text;
    END LOOP;

    INSERT INTO public.clubs (
      slug, name, club_type, sport, city, postal_code,
      website_url, facebook_url, source, source_url, review_state, is_active
    ) VALUES (
      v_slug, v_name, COALESCE(NULLIF(v_item->>'club_type', ''), 'sport_club'),
      NULLIF(btrim(coalesce(v_item->>'sport', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'city', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'postal_code', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'website_url', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'facebook_url', '')), ''),
      'directory', NULLIF(btrim(coalesce(v_item->>'source_url', '')), ''),
      -- A directory entry is a fact about the world, not a claim by the club.
      -- It goes live because the source is a public federation listing, but it
      -- stays unclaimed until somebody from the club takes it over.
      'approved', true
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ingest_directory_clubs(jsonb) FROM public, anon, authenticated;
