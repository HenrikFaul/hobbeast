-- A content fingerprint on each discovered candidate.
--
-- K4 (C:\Work\Smartsearchtool): "persist fingerprints for cross-run dedup ...
-- without this results flood with duplicates." URL canonicalization already
-- collapses the same listing at different query strings; a SimHash collapses
-- the same listing republished under a different slug or path, which a URL
-- check cannot see. Storing it lets a future run recognise a page it has
-- already judged even when the address has changed.
--
-- Nullable and additive: existing rows and the existing record path keep
-- working untouched. Applied via the Supabase MCP; this file is the record.

ALTER TABLE public.source_discovery_candidates
  ADD COLUMN IF NOT EXISTS content_simhash text;

-- record_source_candidates gains one optional field (content_simhash), read
-- from each candidate object. Same signature, same callers. The full body is
-- the one live in the database — see 20260827200000_source_discovery.sql for
-- the original, whose capability check, registry-collision guard and
-- re-sighting merge are unchanged here.
COMMENT ON COLUMN public.source_discovery_candidates.content_simhash IS
  '64-bit SimHash of the discovery page, for cross-run near-duplicate detection (K4).';
