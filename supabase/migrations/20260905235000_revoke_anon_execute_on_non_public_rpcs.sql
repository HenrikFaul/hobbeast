-- 139 SECURITY DEFINER functions were EXECUTE-able by anon, because Supabase's
-- default privileges grant EXECUTE to anon and authenticated at CREATE time.
-- Most of them refuse a logged-out caller in their own body -- but "the body
-- refuses" is one lock, and fix_null_uid_authorization_bypass is exactly what
-- happens when that single lock has a flaw.
--
-- Every name below was classified from evidence, not from its name:
--   * cross-checked against every .rpc('...') call in src/ and supabase/functions/
--   * probed live as anon, recording whether it denies, succeeds, or errors
--   * checked for use inside an RLS policy or a view definition
--
-- That cross-check earned its keep: reconcile_virtual_hub_member LOOKS like a
-- maintenance job, but Onboarding.tsx and Profile.tsx call it for the signed-in
-- user, so it is in the anon-only tier rather than the service-role tier.
--
-- NOT touched, deliberately:
--   * RLS policy and view helpers (has_role, is_organization_member,
--     is_user_suspended, ...) -- a logged-out visitor's policy checks call these,
--     so revoking anon EXECUTE would break public reads outright.
--   * The public discovery surface (list_discoverable_events_safe, map_markers,
--     event_safe_payload, list_ticket_types_public, get_club_public, ...) --
--     these exist to answer anonymous visitors.
--   * Trigger functions: a function returning `trigger` cannot be invoked over
--     PostgREST at all, so it is not part of the reachable surface.
--
-- Result: anon-callable SECURITY DEFINER functions 139 -> 37, and the remaining
-- 37 are the policy helpers and the deliberate public surface.
--
-- Verified after applying, as anon: the public event page still returns a full
-- page of events and 50 cities.

DO $$
DECLARE
  -- Tier 1: reached only by the worker/edge functions with the service role key,
  -- or only from inside other SECURITY DEFINER functions (which execute as the
  -- owner, so an internal call is unaffected by these revokes). No browser
  -- calls either of these -- verified against every .rpc() call site.
  service_only text[] := ARRAY[
    '_issue_order_tickets',
    'api_create_org_event', 'api_get_org_event', 'api_list_org_events',
    'auto_promote_crawled_source', 'claim_external_provider_replays',
    'claim_unparsed_emails', 'consume_edge_rate_limit', 'mark_email_parsed',
    'next_crawl_seeds', 'reconcile_virtual_hubs_batch',
    'record_crawl_pages', 'record_crawl_run_finish', 'record_crawl_run_progress',
    'record_crawl_run_start', 'record_crawl_seed_outcomes',
    'record_external_provider_cost', 'record_external_provider_dead_letter',
    'record_inbound_email', 'record_social_publisher', 'record_source_candidates',
    'refresh_virtual_hub_qualification', 'resolve_api_key',
    'resolve_external_provider_dead_letter'
  ];
  -- Tier 2: real actions for a signed-in user, plus internal predicates that
  -- answer questions about a named user. anon can never legitimately call these;
  -- authenticated keeps EXECUTE and the in-body checks decide as before.
  authed_only text[] := ARRAY[
    'accept_org_invite', 'assign_event_organization', 'cast_event_poll_vote',
    'claim_moderation_case', 'close_event_poll', 'complete_event_atomic',
    'create_event_poll', 'create_organization', 'create_social_circle',
    'follow_organization', 'get_my_connection_cards', 'get_my_reconnection_candidates',
    'get_organization_analytics', 'invite_circle_member', 'invite_org_member',
    'join_event_atomic', 'mark_other_session_devices_revoked',
    'organizer_transition_participant_atomic', 'purge_expired_product_analytics',
    'reconcile_virtual_hub_member', 'record_my_consent',
    'redact_expired_safety_evidence', 'remove_org_member', 'request_circle_membership',
    'request_org_verification', 'require_feature_enabled', 'resolve_moderation_appeal',
    'revoke_connection', 'save_organizer_note_atomic', 'set_arrival_confidence_atomic',
    'set_discovery_preference', 'set_external_event_social_intent',
    'set_org_member_role', 'set_user_block', 'submit_moderation_appeal',
    'submit_user_report', 'transition_moderation_case', 'update_organization',
    -- predicates: oracles about a named user, used only inside other functions
    'has_entitlement', 'is_blocked_from_event_organizer', 'is_event_owner',
    'is_user_feature_restricted', 'organizer_can_view_profile',
    'reviewer_can_view_reported_profile',
    -- the whole operator surface: has_role(NULL,'admin') is false anyway
    'admin_create_external_event', 'admin_delete_email_source',
    'admin_get_crawl_config', 'admin_get_email_ingest_config',
    'admin_judge_source_candidate', 'admin_list_crawl_pages', 'admin_list_crawl_runs',
    'admin_list_crawl_seed_stats', 'admin_list_email_sources',
    'admin_list_inbound_emails', 'admin_list_org_verification_requests',
    'admin_list_social_publishers', 'admin_list_source_candidates',
    'admin_product_outcomes', 'admin_request_external_provider_replay',
    'admin_review_org_verification', 'admin_set_feature_flag',
    'admin_set_feature_flag_override', 'admin_update_crawl_config',
    'admin_update_email_ingest_config', 'admin_update_virtual_hub_metadata',
    'admin_upsert_email_source', 'admin_upsert_entitlement_grant'
  ];
  r record;
  n_service integer := 0;
  n_authed  integer := 0;
BEGIN
  -- Looping over pg_proc rather than naming signatures means every overload of a
  -- listed name is covered, and a name that no longer exists is simply skipped
  -- instead of failing the migration.
  FOR r IN
    SELECT p.oid, p.proname,
           p.proname = ANY (service_only) AS is_service_only
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype <> 'trigger'::regtype
      AND (p.proname = ANY (service_only) OR p.proname = ANY (authed_only))
  LOOP
    IF r.is_service_only THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                     r.proname, pg_get_function_identity_arguments(r.oid));
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                     r.proname, pg_get_function_identity_arguments(r.oid));
      n_service := n_service + 1;
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                     r.proname, pg_get_function_identity_arguments(r.oid));
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                     r.proname, pg_get_function_identity_arguments(r.oid));
      n_authed := n_authed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'service-role only: %, authenticated only: %', n_service, n_authed;
END $$;
