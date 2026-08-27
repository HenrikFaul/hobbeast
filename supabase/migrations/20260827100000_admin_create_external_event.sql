-- A programme entered from a post the operator read.
--
-- A social page post cannot be collected: logged out the platform serves
-- nothing, and fetching it with a member's own account is against its terms
-- and risks that account. The source wizard already detects a social URL and
-- refuses it, pointing at the organiser's own site instead.
--
-- What a person CAN lawfully do is read the post they were shown and pass it
-- on. admin_create_external_event() is that path: reviewed by a human, never
-- published automatically, and stamped external_source = 'manual' so it stays
-- distinguishable from collected supply for ever.
--
-- Two guards exist because the catalogue's own availability gate would
-- otherwise accept the row and then never show it: the date has to be in the
-- future, and the link has to be https.
--
-- Applied via the Supabase MCP; this file is the record.
ALTER TABLE public.external_events DROP CONSTRAINT IF EXISTS external_events_external_source_check;
ALTER TABLE public.external_events ADD CONSTRAINT external_events_external_source_check
  CHECK (external_source = ANY (ARRAY[
    'ticketmaster'::text, 'universe'::text, 'tickettailor'::text,
    'seatgeek'::text, 'feed'::text, 'scraper'::text, 'manual'::text
  ]));
