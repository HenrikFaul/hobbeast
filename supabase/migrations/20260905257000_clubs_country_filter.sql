-- Klubok országszűrője.
--
-- A klublista ugyanazt a CountryFilterBar-t kapja, mint az eseménylista, ezért
-- ugyanazt a két RPC-alakot kell tudnia: egy "milyen országok vannak" hívást és
-- egy p_countries paramétert a listázón.
--
-- Ma minden klub magyar (2741/2741), tehát a szűrő kimenete változatlan marad —
-- ez szándékos: a felület egységes lesz, a viselkedés viszont nem mozdul, amíg
-- nincs külföldi klub. A country_code alapértelmezése 'HU', így egy jövőbeli
-- import sem tud NULL-lal kiesni minden szűrt nézetből.
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'HU';

CREATE INDEX IF NOT EXISTS clubs_country_code_idx
  ON public.clubs (country_code)
  WHERE is_active = true;

-- Milyen országokban van klubunk. A számláló kulcsa szándékosan 'events', hogy
-- az alak egy az egyben egyezzen a list_event_countries()-szel, és a közös
-- CountryFilterBar-nak ne kelljen külön ág a klubokra.
CREATE OR REPLACE FUNCTION public.list_club_countries()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'country_code', t.cc, 'events', t.clubs, 'cities', t.cities
         ) ORDER BY t.clubs DESC, t.cc), '[]'::jsonb)
  FROM (
    SELECT coalesce(c.country_code, 'HU') AS cc,
           count(*)::bigint AS clubs,
           count(DISTINCT c.city) AS cities
    FROM public.clubs c
    WHERE c.is_active = true AND c.review_state = 'approved'
    GROUP BY 1
  ) t;
$function$;

-- A revoke nevesíti az anon-t, mert a "FROM PUBLIC" önmagában no-op lenne.
REVOKE ALL ON FUNCTION public.list_club_countries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_club_countries() TO anon, authenticated, service_role;

-- A régi aláírást ELDOBJUK, nem hagyjuk az új mellett. A PostgREST a paraméterek
-- NEVE alapján old fel túlterhelést; két olyan változat, ami ugyanazt a névhalmazt
-- elfogadja, futásidejű "could not choose the best candidate function" hibát ad —
-- ami csak élesben derülne ki, teszten nem.
DROP FUNCTION IF EXISTS public.list_clubs_public(text, text, text, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.list_clubs_public(
  p_topic     text    DEFAULT NULL,
  p_city      text    DEFAULT NULL,
  p_search    text    DEFAULT NULL,
  p_limit     integer DEFAULT 48,
  p_offset    integer DEFAULT 0,
  p_club_type text    DEFAULT NULL,
  p_audience  text    DEFAULT NULL,
  p_countries text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH bounds AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 48), 1), 100) AS page_limit,
           LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS page_offset
  ), candidates AS (
    SELECT c.*
    FROM public.clubs c, bounds b
    WHERE c.is_active = true
      AND c.review_state = 'approved'
      AND (p_topic IS NULL OR c.topic = p_topic)
      AND (p_city IS NULL OR c.city = p_city)
      AND (p_club_type IS NULL OR c.club_type = p_club_type)
      AND (p_audience IS NULL OR p_audience = ANY(c.audience))
      -- Az ország nélküli klub magyarnak számít, ami ma mindegyikre igaz; a
      -- coalesce nélkül egy jövőbeli NULL sor csendben eltűnne minden szűrt
      -- nézetből.
      AND (
        p_countries IS NULL OR array_length(p_countries, 1) IS NULL
        OR coalesce(c.country_code, 'HU') = ANY (p_countries)
      )
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR public.unaccent_fallback(lower(c.name)) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
        OR public.unaccent_fallback(lower(coalesce(c.topic, ''))) LIKE '%' || public.unaccent_fallback(lower(btrim(p_search))) || '%'
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
      'id', p.id, 'slug', p.slug, 'name', p.name, 'club_type', p.club_type,
      'topic', p.topic, 'audience', p.audience, 'categories', p.categories,
      'city', p.city, 'district', p.district, 'postal_code', p.postal_code,
      'country_code', coalesce(p.country_code, 'HU'),
      'website_url', p.website_url, 'facebook_url', p.facebook_url,
      'logo_url', p.logo_url, 'beginner_friendly', p.beginner_friendly,
      'accepts_new_members', p.accepts_new_members,
      'training_info', p.training_info,
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
$function$;

REVOKE ALL ON FUNCTION public.list_clubs_public(text, text, text, integer, integer, text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_clubs_public(text, text, text, integer, integer, text, text, text[])
  TO anon, authenticated, service_role;
