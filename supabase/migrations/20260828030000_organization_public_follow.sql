-- Slice O-C: public brand page + follow. Applied via MCP; this file is the record.
--   get_organization_public(slug)  safe public projection of a public org: brand
--                                  fields, its upcoming live events, follower
--                                  count, is_following, is_member. anon + auth.
--   follow_organization(org, bool) toggles the follow; recounts follower_count
--                                  (idempotent, self-healing).
SELECT 'see live database' AS note;
