# Prompt 06–09 implementation evidence

Date: 2026-08-22  
Scope: event lifecycle and participant experience; organizer operations; discovery and recommendation; external-event/place supply.  
Execution boundary: local source implementation and isolated/static validation only. No deploy, push, hosted database change, provider activation, cron activation or live migration was performed.

## Outcome summary

The existing Hobbeast flows were extended rather than replaced. The implementation adds server-authoritative lifecycle mutations, a privacy-safe event payload boundary, organizer operations foundations, explainable deterministic discovery, provider provenance/freshness controls, and reproducible fixtures. Existing native/external event ingestion, trip planning, organizer mode and consumer navigation remain in place.

Status vocabulary in this document:

- `PASS`: implemented and directly verified at the stated layer.
- `PARTIAL`: a production-safe foundation or a substantial part exists, but a named UI/integration slice is still absent.
- `HOLD`: completion needs an environment/authority decision and was deliberately not bypassed.
- `NOT_RUN`: no execution evidence exists at that layer.

## Prompt 06 — event lifecycle and participant experience

Implemented:

- Canonical lifecycle contracts preserve the existing `outcome_status` field and extend it with `draft`, `published`, `full`, `started`, `completed`, `cancelled` and `archived`. Legacy `scheduled` and `held` values remain accepted for compatibility.
- Participant transitions cover invited/interested, going, waitlist, checked-in, completed, cancelled and no-show, with a pure transition validator used by the organizer UI.
- Join, cancel, arrival-confidence, organizer status transition, organizer note and completion operations execute through authenticated Edge actions and audited, idempotent database RPCs.
- Capacity is locked in the database. A full event places the next join on the waitlist; cancellation promotes one FIFO row. Active capacity counts going, checked-in and completed participants.
- Event completion converts only verified check-ins to completed, marks RSVP-only going participants as no-show, cancels the remaining waitlist and invokes the Prompt 04 `generate_event_encounters` RPC in the same transaction. A cancelled event cannot complete.
- Direct client mutation policies for participant rows are removed; RLS permits a user to read only their own row and an authorized event operator to read the operated event.
- The exact-location boundary is enforced server-side. `anon` and `authenticated` lose table-level `events` SELECT and receive only a safe column allowlist. Exact address/coordinates/free-text/place diagnostics/meeting instructions are available only through `event_safe_payload` after owner, participation, time-window and safety evaluation.
- `list_discoverable_events_safe` filters removed/suspended/blocked/inactive events and returns the same redacted payload contract. Event detail and the native Events feed use the safe RPCs.
- Trip-plan RLS follows the same full-precision decision; an early RSVP cannot read exact route endpoints for a private event.
- Event detail contains a structured “Mire számíthatsz?” panel: meeting information, group size, beginner suitability, intensity, equipment, accessibility, cost, expected end, host and cancellation policy. Missing values are surfaced as host tasks instead of invented content.
- Create/Edit persist the expectation, capacity, waitlist, visibility and private-location reveal-window fields.
- Participants can optionally set “egyedül érkezem” and “első Hobbeast eseményem”. The persisted visibility is host-only; buddy disclosure remains fail-closed until a durable selected-buddy relationship exists.
- Completed participants receive the private, optional post-event description/safety/return feedback form. The data model is not a public person rating.
- Events supports URL-persisted search/source/category/date/capacity/distance filters, accessible loading/error/empty states, bounded pagination, canonical source dedupe, external attribution/outbound links and stale-supply messaging.
- The organizer check-in queue persists pending mutations locally, retries delayed writes and uses the same idempotency key to prevent duplicate scans.

Primary source migration: `supabase/migrations/20260822060000_event_lifecycle_and_participation_integrity.sql`.

Acceptance evidence is encoded in `supabase/tests/prompt_06_09_integration.sql`: capacity-one concurrency semantics, same-key replay, exactly-once waitlist promotion audit, participant RLS, direct-insert denial, arrival-confidence replay, completion/no-show/cancel split, Prompt 04 encounter creation, cancelled-event suppression, and anonymous/authenticated/owner location-grant personas.

Partial:

- External events retain external ownership and outbound source integrity, but a durable Hobbeast `social attendance intent` / “find company” record and group workflow is not yet present. No native organizer authority is fabricated for external supply.
- Create/Edit does not yet implement draft autosave. This was optional in Prompt 06.

## Prompt 07 — Organizer Suite production

Implemented:

- The existing organizer dashboard is preserved and divided into Overview, Participants, Check-in, Messages, Analytics and Settings tabs.
- Selected event is query-string addressable; the existing organizer-mode and Navbar behavior is preserved.
- Participant search/filter, safe bulk transition, duplicate-resistant check-in, waitlist promotion, no-show/completion, invite-code display, organizer notes and CSV export remain available.
- Participant writes use the Prompt 06 audited RPC state machine. The UI reports partial bulk failures and keeps the remaining selections actionable.
- A local offline check-in queue provides poor-network retry without changing the idempotency key.
- Organizer analytics include RSVP, attendance, no-show, waitlist conversion and repeat-participant aggregates. Reliability is presented as an internal, explainable operational view, not a public punitive score.
- Readiness assessments cover identity, description, safety policy, venue information, capacity, cancellation, check-in and participant communication. Enforcement defaults to advisory, so existing events are not retroactively blocked.
- Incident handoff captures minimal event/type/severity/summary/owner/state data and is limited by event-operator RLS.
- Co-host/crew storage provides least-privilege flags for check-in, attendee messaging, event edit, finance visibility and moderation. `is_event_operator` is the server authority used by operations and RLS.
- Recurring series and per-occurrence scheduled/skipped/rescheduled/cancelled exceptions have independent rows, so changing one occurrence does not rewrite another occurrence or its RSVP data.

Primary source migration: `supabase/migrations/20260822070000_organizer_operations_foundation.sql`.

Partial:

- The crew and recurrence models/RLS are present, but the organizer dashboard does not yet expose full crew-grant/revoke and series/occurrence CRUD workspaces.
- Organizer messaging persists validated message history and Prompt 10 delivers status audiences. A durable `selected` recipient audience is still absent; enabling it without a recipient snapshot would risk delivering to the wrong people after the selection changes.
- Duplicate-from-template, cancel/reschedule notification and capacity-change auditing have foundations across the existing templates, lifecycle and Prompt 10 notification layer, but they are not yet one consolidated event-operations wizard.

## Prompt 08 — discovery, recommendation and matching

Implemented:

- `RecommendationCandidate` normalizes native, external, hub, circle and venue candidate sources.
- Canonical identity dedupes native/external representations before ranking.
- The baseline scorer is deterministic and multi-objective: explicit interest, time, coarse distance, availability, capacity, beginner suitability, quality/reliability, freshness, novelty and marketplace health.
- Sensitive inferences and “loneliness” signals are not represented in the scorer contract.
- Explanation chips are generated only from the current user's explicit/contextual data. Social-count reasons are excluded when consent is absent or blocked users affected the aggregate.
- Diversity reranking limits repeated source/category dominance and gives bounded exploration exposure to smaller/new hosts.
- Guest/new/rare-interest cold starts use explicit interests, location, curated beginner suitability, host quality and source/category diversity.
- “Miért látom?”, “kevésbé ilyet kérek” and undo controls use an idempotent, reversible preference RPC behind the `new_recommender` feature gate.
- The feedback Edge endpoint now reads actual request bytes, rejects oversized/malformed/non-object bodies with controlled 400 responses, allowlists actions/fields and fails closed when the flag is disabled.
- No-result discovery offers an explicit latent-demand CTA instead of inventing supply.
- Offline replay evaluation reports relevance/attendance proxy, exposure diversity, new-host exposure and blocked-signal leakage without user identifiers.
- Product analytics emit the lifecycle funnel events needed for impression → detail → RSVP → attended → repeat/circle aggregation; ranking is not optimized only for CTR.

Primary source migration: `supabase/migrations/20260822080000_discovery_feedback_and_explainability.sql`.

Partial:

- Hub-generated events already enter the native event supply. Direct social-circle next-activity and venue-opportunity candidate adapters are represented by the normalized contract but do not yet have separate production fetchers in the Events page.
- Offline evaluation is a tested library contract; an operator-facing replay comparison dashboard is not yet attached.
- Human-to-human matching remains intentionally activity/circle/reconnection scoped; no dating-style swipe surface was added.

## Prompt 09 — external events, places and geo pipeline

Implemented:

- Shared provider adapters normalize canonical external ID, source URL, provider timestamps, freshness, normalization version, fingerprint and import state.
- Ticketmaster and SeatGeek syncs use shared request bounds, timeout/retry/backoff, circuit state, checkpoint/run evidence and idempotent upsert behavior. Generic external sync and Eventbrite import preserve attribution and admin authorization.
- Provider state records enabled/kill switch, circuit status, failure count/open-until, last success/error, checkpoint and cost units. Sync runs distinguish succeeded, partial, failed, cancelled and dead-letter states with redacted failure samples.
- Cross-provider fingerprint matches queue reversible dedupe reviews. They are never automatically destructively merged.
- Freshness refresh marks old event/place supply stale and preserves stale/cancelled semantics for the UI.
- External events and local places store first seen, last verified, freshness, normalization/import state and confidence/provenance fields.
- Events remains usable when an external source fails; native supply is rendered independently and the external failure becomes a status notice.
- External URLs are restricted to safe HTTP(S) outbound links and opened with `noopener noreferrer`.
- The existing place-search, Address Manager and venue suggestion layers remain in place; request validation and provider fallback changes from the shared implementation are not bypassed.
- Provider contract fixtures cover normalization and malformed-source handling without live provider data.

Primary source migration: `supabase/migrations/20260822090000_external_supply_provenance_and_provider_state.sql`.

Partial/HOLD:

- Place/address worker leasing, retries and quota behavior remain in the pre-existing Address Manager implementation; this round did not replace it with a second job model.
- A complete provider-health dashboard spanning every event/place provider is not yet consolidated in one admin module, although provider state, sync history and redacted evidence are now durable and queryable.
- Live provider terms/licence/attribution review is `HOLD`; no source is claimed contractually approved from code evidence alone.
- The Eventbrite public-search path still has older provider-specific behavior and does not yet share every Ticketmaster/SeatGeek governance control.
- No exact home coordinate is introduced into venue balancing or ranking. A full multi-user, coarse-centroid travel-balance UI remains absent.

## RLS and authorization evidence

- Direct participant INSERT/UPDATE/DELETE policies are removed. Mutations pass through audited SECURITY DEFINER RPCs with fixed search paths and explicit grants.
- Organizer access is derived from owner/admin/least-privilege crew capability, not a client-visible tab or URL parameter.
- Post-event feedback is writable only by its completed participant and readable by that user/admin; it is not a public reputation record.
- Discovery preference and history rows are readable only by their owning user and mutable only through the allowlisted RPC.
- External provider state/runs are service-managed and admin-readable. Dedupe review mutation is admin/service controlled.
- `events` direct SELECT is revoked from `PUBLIC`, `anon` and `authenticated`, then only a safe coarse-field column allowlist is granted to anon/authenticated. Exact location and meeting fields are omitted.
- Safe event RPC callers cannot spoof another requester: authenticated calls always use `auth.uid`; only the service role may supply a requester ID.
- The SQL fixture positively checks anonymous safe-column privileges/coarse RPC output and authenticated safe-row/RPC output, and negatively checks exact-column reads for both personas.

## Rollback and kill switches

- Event lifecycle: stop Edge callers, revoke RPC execute grants, restore reviewed participant/event/trip-plan policies, export audit/feedback, then remove new constraints/tables/columns in reverse dependency order. Do not delete completion/encounter evidence automatically.
- Organizer operations: hide the new readiness/incident modules, export incident/readiness evidence, then drop occurrence, series, readiness and incident tables after dependent operations are stopped.
- Discovery: disable `new_recommender`, fall back to the legacy feed, stop feedback writes, export/delete history per retention policy, revoke the RPC and remove the preference tables.
- External supply: set provider kill switches, stop sync jobs, retain provider provenance/run/review evidence, restore the reviewed public supply policy, then remove new objects in reverse dependency order.

## Supabase generated type delta for root integration

`src/integrations/supabase/types.ts` was intentionally not edited in this workstream. Regeneration must include:

- `events`: `started_at`, `completed_at`, `cancelled_at`, `archived_at`, `cancellation_reason`, `meeting_instructions`, `expected_end_at`, `beginner_friendly`, `activity_intensity`, `equipment_required`, `accessibility_info`, `cost_details`, `cancellation_policy`, `private_location_reveal_hours`, `venue_validation_status`, `host_responsibility_accepted_at`; expanded lifecycle values in `outcome_status`.
- `event_participants`: `completed_at`, `no_show_marked_at`, `arriving_alone`, `first_hobbeast_event`, `arrival_visibility`, `last_mutation_key`; expanded participant status values.
- Tables: `event_crew_roles`, `event_operation_audits`, `post_event_feedback`, `organizer_readiness_assessments`, `event_series`, `event_series_occurrences`, `organizer_incident_handoffs`, `discovery_preferences`, `discovery_preference_history`, `external_provider_state`, `external_provider_sync_runs`, `external_event_dedupe_reviews`.
- RPCs: `is_event_operator`, `event_location_precision`, `event_safe_payload`, `list_discoverable_events_safe`, `public_event_participant_counts`, `join_event_atomic`, `cancel_own_participation_atomic`, `set_arrival_confidence_atomic`, `organizer_transition_participant_atomic`, `save_organizer_note_atomic`, `complete_event_atomic`, `set_discovery_preference`, `refresh_external_supply_freshness`, `queue_external_event_dedupe_reviews`.
- `external_events`: `first_seen_at`, `last_verified_at`, `freshness_state`, `normalization_version`, `dedupe_confidence`, `canonical_fingerprint`, `import_state`, `provider_updated_at`.
- `places_local_catalog`: `source_url`, `first_seen_at`, `last_verified_at`, `freshness_state`, `normalization_version`, `import_state`, `source_confidence`.

## Validation evidence

PASS:

- `bun run typecheck` — TypeScript completed with exit code 0.
- `bun run test` — 27 files, 194 tests passed.
- `bun run build:dev` — 3,140 modules transformed; development build completed.
- Focused ESLint across Prompt 06–09 frontend/domain/test files — 0 errors. Four existing React hook dependency warnings remain in `Events.tsx` and `OrganizerDashboard.tsx`.
- Esbuild syntax transpilation — 14 Prompt 06–09 Edge/shared TypeScript files passed.
- `git diff --check` — exit code 0; only repository-wide LF/CRLF conversion warnings were emitted.
- Earlier isolated PostgreSQL apply covered migrations 06–09 plus dependent 10–15 and the pre-privacy persona/dedupe transactions. The isolated temporary database was removed afterward.

HOLD:

- `bun run build` is correctly blocked by the repository's fail-closed target assertion: configured project ref `olzvughcoqnfkdpvbwjy` does not match required `dsymdijzydaehntlmfzl`. Environment values were not changed.
- A fresh-database run of the latest exact-location column-grant delta and `supabase/tests/prompt_06_09_integration.sql` is pending the root integration database rebuild. The fixture exists and fails on first assertion/error, but this document does not promote it to PASS before that execution completes.
- The historical full-migration chain has an unrelated pre-existing baseline failure at `20260423110000_address_manager_phase1.sql` (`app_runtime_config_provider_check`). Prompt 06–09 migrations were previously tested by controlled continuation; this is not proof that an untouched historical reset is healthy.

NOT_RUN:

- Deno typecheck/test (Deno is not installed in this workspace); Edge syntax was checked with esbuild instead.
- Hosted database migration, live RLS proof, live provider calls, provider licence/TOS verification, cron/scheduler, authenticated browser/mobile/device E2E, production observability, deploy and push.

## Files owned or materially extended in this workstream

Domain/tests: `src/lib/eventLifecycle.ts`, `src/lib/eventOperations.ts`, `src/lib/organizerProduction.ts`, `src/lib/organizerCheckInQueue.ts`, `src/lib/recommendationEngine.ts`, `src/lib/discoveryFeedback.ts`, `src/lib/externalEventPipeline.ts`, `src/lib/eventParticipantStats.ts`, `src/lib/organizer.ts`, corresponding Prompt 06–09 tests, and `src/lib/external-events/{types,normalize}.ts`.

UI: `src/pages/EventDetail.tsx`, `src/pages/Events.tsx`, `src/pages/OrganizerDashboard.tsx`, `src/components/CreateEventDialog.tsx`, `src/components/EditEventDialog.tsx`, and `src/components/events/{ArrivalConfidenceCard,EventExpectationPanel,PostEventFeedbackCard}.tsx`.

Edge/provider: `supabase/functions/event-operations/index.ts`, `supabase/functions/discovery-feedback/index.ts`, `supabase/functions/shared/{userAuth,externalEventPipeline,externalProviderRuns,providerFetch,ticketmaster,seatgeek,upsertExternalEvents}.ts`, provider contract fixture, and the Eventbrite/Ticketmaster/SeatGeek/generic sync entrypoints.

Database/evidence: the four Prompt 06–09 migrations and `supabase/tests/prompt_06_09_integration.sql`.
