-- Events had no country dimension at all. Every "show me Hungarian programmes"
-- or "show me foreign ones" question was therefore unanswerable, and the city
-- chips in the UI were the only geography the product had -- which is why the
-- listing showed Praha and Wien as if they were peers of Budapest.
--
-- The country is DERIVED, not guessed: source_payload->>'source_id' is present
-- on 6550 of 6564 future events (99.8%) and joins straight to the registry row
-- that produced them, which already carries a vetted country_code. Measured
-- before writing this: HU 3343, PL 948, CZ 862, AT 521, SI 453, DE 277, SK 146,
-- and 13 rows with no source id at all (those also have no city).
--
-- Stored rather than joined at read time: the listing is the busiest path in the
-- product and should not pay a per-row join for something that never changes
-- after ingest.

ALTER TABLE public.external_events
  ADD COLUMN IF NOT EXISTS country_code text;

COMMENT ON COLUMN public.external_events.country_code IS
  'ISO 3166-1 alpha-2 of the event''s country, derived at ingest from the feed source that produced it. NULL only when the source is unknown.';

UPDATE public.external_events e
SET country_code = s.country_code
FROM public.external_event_feed_sources s
WHERE s.source_id = e.source_payload->>'source_id'
  AND s.country_code IS NOT NULL
  AND e.country_code IS DISTINCT FROM s.country_code;

-- The handful with no source id: fall back to the nationwide marker some feeds
-- write into location_city, which is unambiguous where it appears.
UPDATE public.external_events e
SET country_code = m.cc
FROM (VALUES
  ('országos','HU'), ('orszagos','HU'),
  ('polska','PL'),
  ('slovenija','SI'),
  ('celoslovensky','SK'), ('celoslovenský','SK'),
  ('celostátní (celá čr)','CZ'), ('celostatni (cela cr)','CZ'), ('česko','CZ'), ('cesko','CZ'),
  ('deutschland','DE'), ('österreich','AT'), ('osterreich','AT')
) AS m(label, cc)
WHERE e.country_code IS NULL
  AND lower(btrim(coalesce(e.location_city, ''))) = m.label;

CREATE INDEX IF NOT EXISTS external_events_country_date_idx
  ON public.external_events (country_code, event_date)
  WHERE is_active AND import_state = 'active';
