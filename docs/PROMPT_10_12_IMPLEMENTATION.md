# Prompt 10–12 implementation evidence

Date: 2026-08-22  
Scope: notifications and communication automation; AI demand aggregation and event proposals; admin control plane and operations.  
Execution boundary: source implementation only. No deploy, push, hosted database mutation, cron/provider activation or live migration was performed.

## Prompt 10 — notifications, communication and engagement

Implemented:

- Canonical typed notification taxonomy with category, priority, preference and safe deep-link metadata, including `new_device` account-safety delivery.
- Central `enqueue_notification` database guard with real-user-only delivery, simulated/unknown account exclusion, social block checks through `user_blocks`, target freshness, opt-outs, channel gates, frequency cap, quiet hours, digest deferral, expiry and recipient-scoped deduplication.
- Versioned/localizable notification templates and external channel attempt ledger with bounded retry/dead-letter state.
- In-app queue release worker and candidate workers for lifecycle reminders, feedback, organizer reminders, qualified hubs, audited mutual reconnections and dormant circles.
- First session-device registration creates `account_activity_events.event_type = new_device` and one deduplicated critical notification; later heartbeats remain `session_seen`.
- Waitlist promotion remains concurrency locked and now preserves Prompt 06 lifecycle, `waitlist_enabled`, immutable event and active-capacity invariants while routing delivery through the canonical notification guard.
- Organizer messages support `all`, `going`, `waitlist`, `checked_in`, `no_show` and `completed` audiences with exact status filtering. Arbitrary `selected` recipients remain intentionally unsupported without a durable recipient model.
- Event reschedule/cancellation and favorite-category triggers use the canonical queue.
- Authenticated preference Edge API with an allowlisted mutation contract; category/channel toggles, quiet hours, digest and cap UI.
- Notification Bell now has safe navigation, realtime replay dedupe, day grouping, loading/empty/error/stale states, keyboard Escape handling and accessible labels.

Source migration: `20260822100000_notification_platform_foundation.sql`.

## Prompt 11 — AI demand aggregation and event proposals

Implemented:

- Pure demand qualification engine using aggregate real-member, recent-activity, explicit-interest, availability-overlap, upcoming-supply, cooldown and organizer-capacity signals.
- Generated and unknown-origin users never qualify as real demand. K-anonymity has a hard minimum of five.
- Prompt-bound data is sanitized and reduced to coarse aggregate snapshots without member IDs, email, session IDs or precise user location.
- Strict structured proposal validation, unsafe-content rejection and deterministic fallback generation when the provider is absent, unavailable, malformed or incomplete.
- Idempotent generation runs, global running lock, stale-run recovery, daily proposal/token budgets, model/template/schema provenance and fallback evidence.
- Durable proposal workflow: `draft -> review -> approved -> published`, plus explicit rejection/cancellation paths and immutable transition audit.
- Organizer assignment and responsibility acceptance are separate from admin approval.
- Publish is an atomic database operation and requires all gates: approved state, assigned organizer, organizer acceptance, moderation passed, venue verified, future time and bounded capacity.
- Published events retain `ai_proposal_id` and `source_origin = ai_proposal`. No direct or automatic publish path exists.
- `ai_proposals` Prompt 15 feature flag is evaluated server-side for creation/publishing; its seeded default is disabled. The proposal config also defaults to `kill_switch = true`, `proposal_generation_enabled = false`, and enforces `auto_publish_enabled = false` at database level.
- Admin proposal UI is attached to the existing Auto Events surface. A standalone organizer proposal inbox is implemented for integration into the organizer dashboard.

Source migration: `20260822110000_ai_event_proposal_workflow.sql`.

## Prompt 12 — admin control plane and operations

Implemented:

- Operator roles: support, moderator, content ops, organizer ops, finance ops, security admin and super admin.
- Server-authoritative capability registry and role-to-capability matrix. New Edge actions use `admin_has_capability`; client visibility is not authority.
- Current legacy admins are compatibility-backfilled as super admins. New super-admin grants are break-glass only, expire within four hours and require a distinct approved four-eyes request. New security-admin grants also require approval and an expiry.
- Immutable redacted audit log with actor, role snapshot, capability, action, target, safe before/after evidence, reason, request/correlation/idempotency IDs, approval, outcome, error code and seven-year retention marker.
- Four-eyes request/decision foundation. Approval never executes a mutation by itself.
- Unified operations inbox with severity, SLA, owner, state, optimistic version, immutable history, related safe entities and allowlisted internal admin links.
- Inbox aggregation covers notification failures/dead letters, stalled AI proposals, provider failures, external-event dedupe review, high no-show signals, moderation cases and financial exceptions. Later Prompt 13/15 tables are read through runtime-safe dynamic checks.
- Server-authorized operations transition, refresh, masked user search, audit access logging, approval and role-management APIs.
- PII-minimal user search returns immutable user ID plus masked display name and allowlisted operational fields; search access records only a query fingerprint and result count.
- Standalone Admin Operations cockpit provides health, provider state, SLA inbox and reason-gated audit access with loading, empty and failure states.
- Feature-flag storage is not duplicated. Prompt 15 owns `feature_flags`, environment/rollout/owner/expiry/audit contracts.

Source migration: `20260822120000_admin_control_plane_foundation.sql`.

## RLS, authorization and retention

- Notification recipients can select only delivered, due, non-expired own rows and update only `is_read`.
- Preference writes are authenticated and allowlisted by the Edge contract.
- Notification provider attempts and queue mutations are service-role-only; user-facing triggers execute through reviewed SECURITY DEFINER functions with fixed search paths and explicit grants/revokes.
- AI proposal tables are service-managed. Admins can read; assigned organizers can read their proposals and audit, and can only accept/decline through the organizer RPC.
- AI audit and admin audit/history tables have no client mutation grant.
- Admin control-plane APIs authenticate the user, then check a stored capability for each action. Legacy `admin` is not sufficient for new privileged actions unless an active operator role grants the capability.
- Admin audit records carry a seven-year retention marker. Notification/proposal operational data is retained as workflow evidence; physical purge scheduling requires an approved production retention job and is not silently activated here.

## Rollback and kill switches

- Notification dispatch: stop external dispatch/release workers first; existing delivered rows remain. New triggers/functions/tables can then be removed in reverse dependency order.
- AI proposals: disable Prompt 15 `ai_proposals`, set the proposal kill switch, stop proposal workers, and leave existing published events/audit intact until an explicit data decision. Rollback does not require automatic deletion of proposal-derived events.
- Admin control plane: revoke Edge/RPC access, stop inbox refresh, export immutable audit evidence, then drop the new functions/tables in reverse dependency order. Existing legacy admin roles are not removed.

## Supabase generated type delta (root integration)

`src/integrations/supabase/types.ts` was intentionally not edited. Regeneration must include:

- `notifications`: category, channel, priority, deep_link, dedupe_key, event_key, template_key/version, delivery_status, suppression_reason, scheduled/expires/sent/delivered/read timestamps, actor/source/correlation/attempt/error fields; notification type includes `new_device`.
- `notification_preferences`: organizer/community/recommendation/transactional/marketing, in-app/email/push, quiet-hours, timezone, digest and frequency-cap fields.
- Tables: `notification_templates`, `notification_delivery_attempts`.
- `account_activity_events.event_type`: `new_device`.
- `auto_event_config`: proposal enable/kill/auto-publish and qualification, cooldown, budget, model/template/timeout fields.
- Tables: `ai_event_generation_runs`, `ai_event_proposals`, `ai_event_proposal_audit_events`.
- `events`: `ai_proposal_id`, `source_origin`.
- Tables: `admin_capabilities`, `admin_role_capabilities`, `admin_operator_roles`, `admin_audit_log`, `admin_approval_requests`, `operations_inbox_items`, `operations_inbox_history`.
- RPCs: `enqueue_notification`, `release_due_in_app_notifications`, `record_notification_delivery_attempt`, notification worker RPCs, `organizer_accept_ai_event_proposal`, `admin_transition_ai_event_proposal`, `admin_publish_ai_event_proposal`, `admin_has_capability`, `admin_record_audit_event`, approval/role/operations RPCs and `refresh_operations_inbox`.

## Validation evidence

PASS:

- `bun run test -- notificationPlatform aiDemandEngine adminControlPlane socialGraph virtualHubEngine` — 5 files, 65 tests passed.
- `bun run typecheck` — passed.
- Focused ESLint on all changed Prompt 10–12 frontend/domain/test files — passed.
- Esbuild syntax transpilation of all new/changed Prompt 10–12 Edge TypeScript entrypoints/shared helpers — passed.
- `git diff --check` on the owned Prompt 10–12 file set — passed (only existing Windows LF/CRLF conversion warnings).

HOLD:

- `bun run build` was correctly blocked by the repository's fail-closed Supabase target assertion: the expected project ref is `dsymdijzydaehntlmfzl`, while the current local `VITE_*` URL/project ref resolves to `olzvughcoqnfkdpvbwjy`. Environment values were not changed.
- `AdminOperations` still needs its final Admin route/tab integration after concurrent admin-tab work is merged.
- `OrganizerAiProposalInbox` still needs placement in the Organizer Dashboard after concurrent Prompt 06–09 work is merged.
- Email/push provider selection, credentials, actual dispatch and scheduler ownership are not configured; only the durable queue/attempt/retry contract is implemented.
- The legacy `selected` organizer-message audience is not enabled because no durable selected-recipient model exists.
- Legacy admins were compatibility-backfilled without expiry. Production should review and replace these with named least-privilege role grants before enforcing break-glass-only super-admin policy.

NOT_RUN:

- Deno typecheck (Deno is not installed in this workspace); Edge syntax was checked with esbuild instead.
- Local Supabase migration apply / database lint (no isolated local Supabase stack was available).
- Hosted database migration, provider call, cron, authenticated browser, organizer/admin end-to-end and production RLS proof.
- Deploy, push and live data mutation.
