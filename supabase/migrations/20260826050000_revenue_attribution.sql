-- Revenue attribution layer.
--
-- The platform collects 1000+ programs with ticket links and prices, but nothing
-- measured whether anyone clicks through to buy. Pillar 1 of the monetization
-- plan (5-8% marketplace commission) cannot be invoiced on unmeasured traffic.
-- This records every outbound click, attributed to the source/partner, with the
-- ticket price captured at click time.

CREATE TABLE IF NOT EXISTS public.outbound_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id uuid NOT NULL REFERENCES public.external_events(id) ON DELETE CASCADE,
  source_id text,
  user_id uuid,
  surface text NOT NULL DEFAULT 'unknown',
  target_url text,
  price_min numeric,
  currency text,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_clicks_surface_ok CHECK (surface IN ('event_card', 'event_detail', 'unknown'))
);

CREATE INDEX IF NOT EXISTS outbound_clicks_source_idx ON public.outbound_clicks (source_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS outbound_clicks_event_idx ON public.outbound_clicks (external_event_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS outbound_clicks_dedupe_idx ON public.outbound_clicks (external_event_id, user_id, clicked_at DESC);

ALTER TABLE public.outbound_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_clicks FROM anon, authenticated;

-- Record an outbound click. The CLIENT ONLY sends the event id and the surface;
-- source, price and target URL are read server-side from external_events so a
-- caller cannot forge partner attribution or ticket value. Repeat clicks by the
-- same user on the same event within 30 seconds collapse into one.
CREATE OR REPLACE FUNCTION public.track_outbound_click(
  p_external_event_id uuid,
  p_surface text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_event record;
  v_user uuid := auth.uid();
  v_surface text := CASE WHEN p_surface IN ('event_card', 'event_detail') THEN p_surface ELSE 'unknown' END;
BEGIN
  SELECT id, external_id, external_url, price_min, currency
    INTO v_event
  FROM public.external_events
  WHERE id = p_external_event_id AND is_active
  LIMIT 1;

  IF v_event.id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outbound_clicks
    WHERE external_event_id = v_event.id
      AND user_id IS NOT DISTINCT FROM v_user
      AND clicked_at > now() - interval '30 seconds'
  ) THEN
    RETURN true;
  END IF;

  INSERT INTO public.outbound_clicks (
    external_event_id, source_id, user_id, surface, target_url, price_min, currency
  ) VALUES (
    v_event.id,
    NULLIF(split_part(COALESCE(v_event.external_id, ''), ':', 1), ''),
    v_user, v_surface, v_event.external_url, v_event.price_min, v_event.currency
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.track_outbound_click(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_outbound_click(uuid, text) TO anon, authenticated;

-- Partner performance: the sales and investor artifact. Per source it reports
-- live programs, outbound clicks, distinct interested members, the ticket value
-- behind those clicks (GMV proxy) and the commission range from the monetization
-- plan. Commission figures are POTENTIAL, not booked revenue.
CREATE OR REPLACE FUNCTION public.admin_partner_performance(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
BEGIN
  IF NOT public.admin_has_capability(auth.uid(), 'providers.manage') THEN
    RAISE EXCEPTION 'CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'window_days', v_days,
    'totals', (
      SELECT jsonb_build_object(
        'clicks', count(*),
        'distinct_events', count(DISTINCT external_event_id),
        'distinct_members', count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL),
        'ticket_value_huf', COALESCE(sum(price_min) FILTER (WHERE currency IN ('HUF', 'Ft')), 0),
        'priced_clicks', count(*) FILTER (WHERE price_min IS NOT NULL AND price_min > 0)
      )
      FROM public.outbound_clicks WHERE clicked_at >= v_since
    ),
    'partners', (
      SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'clicks')::int DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'source_id', s.source_id,
          'publisher_name', s.publisher_name,
          'city', s.city,
          'live_programs', (
            SELECT count(*) FROM public.external_events e
            WHERE e.external_source = 'scraper' AND e.is_active
              AND e.event_date >= current_date
              AND e.external_id LIKE s.source_id || ':%'
          ),
          'clicks', COALESCE(c.clicks, 0),
          'distinct_members', COALESCE(c.members, 0),
          'ticket_value_huf', COALESCE(c.value_huf, 0),
          'commission_low_huf', round(COALESCE(c.value_huf, 0) * 0.05),
          'commission_high_huf', round(COALESCE(c.value_huf, 0) * 0.08)
        ) AS p
        FROM public.external_event_feed_sources s
        LEFT JOIN (
          SELECT source_id,
                 count(*) AS clicks,
                 count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS members,
                 sum(price_min) FILTER (WHERE currency IN ('HUF', 'Ft')) AS value_huf
          FROM public.outbound_clicks
          WHERE clicked_at >= v_since
          GROUP BY source_id
        ) c ON c.source_id = s.source_id
        WHERE s.scrape_enabled
          AND (COALESCE(c.clicks, 0) > 0 OR EXISTS (
            SELECT 1 FROM public.external_events e
            WHERE e.external_source = 'scraper' AND e.is_active
              AND e.event_date >= current_date
              AND e.external_id LIKE s.source_id || ':%'
          ))
      ) partners
    ),
    'top_events', (
      SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'clicks')::int DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'title', e.title,
          'event_date', e.event_date,
          'clicks', count(oc.*),
          'price_min', e.price_min,
          'currency', e.currency
        ) AS t
        FROM public.outbound_clicks oc
        JOIN public.external_events e ON e.id = oc.external_event_id
        WHERE oc.clicked_at >= v_since
        GROUP BY e.id, e.title, e.event_date, e.price_min, e.currency
        ORDER BY count(oc.*) DESC
        LIMIT 15
      ) top
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', d.day, 'clicks', d.clicks, 'ticket_value_huf', d.value_huf
      ) ORDER BY d.day DESC), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', clicked_at)::date AS day,
               count(*) AS clicks,
               COALESCE(sum(price_min) FILTER (WHERE currency IN ('HUF', 'Ft')), 0) AS value_huf
        FROM public.outbound_clicks
        WHERE clicked_at >= v_since
        GROUP BY 1
      ) d
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_partner_performance(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_partner_performance(integer) TO authenticated;
