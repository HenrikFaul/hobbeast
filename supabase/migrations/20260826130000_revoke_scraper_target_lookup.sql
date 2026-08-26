-- The worker's targeted-run lookup was left executable by PUBLIC.
--
-- No data ever leaked: the body already returns nothing unless auth.role() is
-- 'service_role'. But a SECURITY DEFINER function that anon can call is a
-- standing invitation, and the security-definer audit is right to insist on the
-- explicit revoke.

REVOKE ALL ON FUNCTION public.list_scraper_targets_by_ids(text[]) FROM public, anon, authenticated;
