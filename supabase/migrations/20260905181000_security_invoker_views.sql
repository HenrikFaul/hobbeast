-- Make the client-reachable views honour row-level security — but only the
-- three where that is provably the right thing.
--
-- Eight views in `public` run with the definer's privileges (the Postgres
-- default), which lets them read past the RLS on their base tables. Five are
-- reachable by anon/authenticated, and the Supabase advisor flags those as
-- `security_definer_view`. Flipping all five would have been a one-line
-- "fix" and two of them would have broken quietly, so each was measured
-- against live data first, as a real non-admin user, with the setting
-- toggled and restored inside one transaction.
--
--   view                            rows as definer   rows as invoker
--   public_profile_cards                        934                 1
--   the other four                                0                 0
--
-- FLIPPED (invoker semantics from now on):
--
--   public_event_safety
--     Projects event_safety_profiles with NO WHERE clause whatsoever, so today
--     any authenticated client can read EVERY event's safety profile. The base
--     table's own policy is "safety reviewer OR the event's creator", which is
--     obviously the intended audience. This narrows access to that — anything
--     that depended on the wider view was depending on the leak.
--
--   promoted_experience_candidates
--     Its predicate (feature flag + policy_status approved + inside the time
--     window + not removed) is the same shape as the base table's own
--     "Members read eligible labelled promotions" policy, so the permitted row
--     set is unchanged.
--
--   virtual_hub_discovery_cards
--     virtual_hubs' policy already grants exactly this set through its
--     "feature_enabled_for_subject('hub2') AND is_discoverable AND
--     lifecycle_state IN (recruiting, active)" branch, with admins covered by
--     the second policy.
--
-- DELIBERATELY LEFT AS DEFINER — the advisor will keep reporting these two,
-- and that is the correct outcome:
--
--   public_profile_cards
--     Measured 934 rows as definer, 1 as invoker. The view exists precisely to
--     publish a safe, narrow projection of `profiles` while the table itself
--     stays locked down. Flipping it would reduce every profile listing in the
--     app to the viewer's own card.
--
--   circle_health_dashboard
--     Already scoped to `circle.host_id = auth.uid() OR admin`, but it
--     aggregates over user_reports through LATERAL joins, and that table's RLS
--     is "your own reports OR safety reviewer". A circle host is neither, so
--     under invoker semantics open_report_count, reports_30d and
--     prior_reports_30d would silently collapse to zero on a SAFETY dashboard.
--     Under-reporting harm is worse than the lint.

ALTER VIEW public.public_event_safety SET (security_invoker = true);
ALTER VIEW public.promoted_experience_candidates SET (security_invoker = true);
ALTER VIEW public.virtual_hub_discovery_cards SET (security_invoker = true);

COMMENT ON VIEW public.public_event_safety IS
  'security_invoker=true: rows are filtered by event_safety_profiles RLS (safety reviewer or the event creator). The view itself has no WHERE clause and must never be relied on to widen access.';

COMMENT ON VIEW public.promoted_experience_candidates IS
  'security_invoker=true: promoted_experiences RLS already permits exactly this row set via its "Members read eligible labelled promotions" policy.';

COMMENT ON VIEW public.virtual_hub_discovery_cards IS
  'security_invoker=true: virtual_hubs RLS grants the same discovery set (hub2 feature + is_discoverable + lifecycle recruiting/active), with admins covered separately.';

COMMENT ON VIEW public.public_profile_cards IS
  'INTENTIONALLY security definer. It publishes a narrow, safe projection of profiles while the table stays locked down; measured 2026-09-05, security_invoker would cut a real user from 934 visible cards to 1. Do not "fix" the security_definer_view advisory here without first widening profiles RLS to cover these columns.';

COMMENT ON VIEW public.circle_health_dashboard IS
  'INTENTIONALLY security definer. Already scoped to the circle host or an admin, but it aggregates user_reports, whose RLS is "own reports or safety reviewer". Under security_invoker a host would see open_report_count and reports_30d as zero — silent under-reporting on a safety dashboard.';
