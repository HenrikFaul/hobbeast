# Sprint program status

Current ordered production-pack resume point: **Prompts 01–15 source complete; v1.11.0 Hungarian event-feed ingestion is implemented and locally release-gated, with every imported source pending, disabled and subject to explicit legal + robots review before activation.**

v1.11.0 (2026-08-25): imported the 185-row Hungarian source workbook as a deterministic,
fail-closed candidate registry; added RSS, Atom, ICS, Schema.org Event and bounded HTML
normalization; exact-host SSRF and live robots controls; quarantine, quality, deduplication and
cancellation handling; HMAC/replay-safe scheduling contracts; and an auditable Admin Feedek
surface. The existing event providers, native events, routes, search taxonomy and strong
marketing copy remain intact. Local release evidence passes 68 Vitest files / 376 tests, all 16
fresh-database fixtures, production build, performance budget and 14 Playwright scenarios. No
source is bulk-approved or scheduled by the release.

v1.9.7 (2026-08-24): removed `.env` from tracking while preserving it locally; verified the
historically exposed GeoData server credential is rejected; moved the deployed Edge integration
to the current server-side key; synchronized GitHub Actions with the current Hobbeast project;
closed all high/critical dependency advisories; replaced the broken Playwright template import;
and moved the release runbook to the real GitHub `main` → Vercel production path. The duplicate
`hobbeast-un8i` Vercel context was also synchronized and rebuilt so it no longer leaves the same
commit red while the canonical project is green. Mapy/AWS browser-key restrictions remain
recorded provider hardening, not an unreported private-secret claim.

v1.9.1 (2026-08-24): new hosted Supabase project provisioned (old ones were deleted); all 93
migrations applied with verified integrity; production data restored (933 users with working
passwords); two login-breaking restore defects fixed (GoTrue NULL tokens, dual signup trigger);
frontend re-pointed; production build gate passes; 6/26 Edge Functions deployed
(event-operations, notification-preferences, discovery-feedback, delete-account,
admin-user-profile-update, mass-create-users). Remaining: 20 function deployments +
operator config (provider secrets, Auth SMTP/Site URL, Vercel env, AWS key rotation).

v1.9.0 (2026-08-23) closed the program's central evidence gap: `bun run db:verify` restores the
2026-06-18 production dump (933 users) into a disposable PostgreSQL 18 cluster, replays the full
migration chain (51 applied + 2 reconciled over the dump's 39-entry ledger) and passes all
15 SQL acceptance fixtures, in both restore and fresh modes. The replay surfaced and
`20260823010000_production_rls_reassertion_and_profile_identity.sql` repaired live schema drift:
RLS disabled on 5 policy-bearing tables, anon write grants, a `USING (true)` profiles read
policy, direct participant-write bypass policies, a leaky trip-plan policy, contradictory CHECK
constraints, the missing waitlist auto-promote trigger and a type bug in `complete_event_atomic`.
Remaining HOLDs are operator-owned: hosted re-import + migration apply, `.env` untracking +
credential rotation, Deno/Edge runtime tests, Playwright E2E, legal/launch approvals.

Live status of the 5-sprint improvement program (`Hobbeast_5_sprint_javito_fejleszto_brandterv.md`). Update this doc whenever a sprint task lands.

Legend: ✅ done · 🟡 partial · ⬜ deferred

## Sprint 1 – Setup & Governance
- ✅ 1.1 Repo & versioning (`README.md`, canonical `CHANGELOG.md`, `RELEASE_PROCESS.md`, `scripts/validate-release.mjs`, version bump to 1.6.8, legacy archive under `docs/releases/`).
- ✅ 1.2 Runtime config & secrets (`src/lib/env.ts` Zod validator, `supabase/functions/shared/env.ts` `requireEnv/redact`, `docs/SECRETS_ROTATION.md`).
- ✅ 1.3 Test foundation (Vitest suites for `passwordValidation`, `utils.cn`, `eventParticipantStats`, `hobbyCategories`; Playwright smoke `e2e/smoke.spec.ts`; `docs/TESTING.md`).
- ✅ 1.4 Build hygiene (`vite.config.ts` `manualChunks` for react-vendor/radix-ui/supabase/query/leaflet/motion/forms, `React.lazy` for all non-landing routes, `docs/BUILD.md`).
- ✅ 1.5 Edge function env-helper adoption. Shared helpers migrated to `requireEnv`: `supabase/functions/shared/providerFetch.ts` (`SUPABASE_SERVICE_ROLE_KEY`) and `supabase/functions/sync-local-places/batchRunner.ts` (`GEOAPIFY_API_KEY`, `TOMTOM_API_KEY`). New Edge Functions must use `requireEnv` — see `supabase/functions/shared/env.ts`.

## Sprint 2 – Address Manager & Places
- ✅ 2.a Duplicate `_shared` folder consolidation: deleted `supabase/functions/address-manager-shared/` (unused) and `supabase/functions/sync-local-places/_shared/` (unused, carried stale 60/50 defaults).
- ✅ 2.b Characterization test for `place-search` response normalization (`src/lib/__tests__/placeSearch.test.ts`).
- ✅ 2.c `sync-local-places` clamp phantom fixed as a side effect of 2.a — only the top-level `constants.ts` (6000/6000) remains and clamp stays `1 .. 1_000_000`.
- 🟡 2.d `AdminEventbrite.tsx` split — v1.7.3: 15 pure helpers + `ExternalEventList` extracted into `src/components/admin/adminEventbriteHelpers.tsx`. Main file 1410 → 982 LOC. Behavior byte-identical. Per-provider card split (Eventbrite / Ticketmaster / SeatGeek / Places) still pending characterization tests.


## Sprint 3 – Organizer & Admin Core
- 🟡 v1.7.3: `MetricCard` + `InfoPill` extracted from `OrganizerDashboard.tsx` into `src/pages/organizer/StatCards.tsx`. Deep refactor (wizard-step components, `AdminUsers` hub-tab split) still deferred — active bulk-user/hub flows must not regress without characterization tests.

## Sprint 4 – Community & Engagement
- ⬜ Deferred. Notification/real-time hooks are stable; changes here should ride on a product ask, not a general refactor.

## Sprint 5 – Product & Brand Finalization
- ✅ 5.a Brand/messaging pivot (light teal/emerald palette, "shared experiences" copy) — landed in an earlier turn.
- ✅ 5.b `index.html` head metadata already sets Hobbeast-specific `<title>`, description, `og:*`, and `twitter:*`.
- ✅ 5.c Bundle & asset performance — Sprint 1.4 code-splitting cut initial payload from 1.35 MB to 136 KB; v1.7.2 asset audit re-compressed `src/assets/hero-community.jpg` (215 KB → 200 KB, quality 82, stripped metadata) and removed the unused duplicate `public/hobbeast-logo.png`. Hero `<img>` now declares intrinsic `width`/`height` plus `decoding="async"` and `fetchPriority="high"` to prevent CLS and prioritize the LCP element.

## v2 audit backlog (from `Hobbeast_friss_repoaudit_es_hatralevo_5_sprintes_fejlesztesi_terv_v2.md`)

- ✅ v1.7.4 P0 hardening (Mapy key removed, `?redirect` sanitizer, OAuth origin fix, EventDetail try/catch, legacy `/organize` route).
- ✅ v1.7.5 CI + docs pass: `.github/workflows/ci.yml`, `docs/SECURITY_DEFINER_AUDIT.md`, `docs/MULTI_SUPABASE_CONTRACT.md`, `docs/DEP_UPGRADE_PLAN.md`.
- ⬜ Secret rotation (Mapy / Geoapify / TomTom / Eventbrite / Ticketmaster) — operator action in provider consoles.
- ⬜ SECURITY DEFINER Round B — one migration per High-risk function; template in the audit doc.
- ✅ Multi-Supabase runtime assertion module — source landed in v1.7.6; v1.8.4 adds a
  production-build fail-closed target-ref check. Current tracked env mismatch still blocks release.
- ⬜ Dep majors (Zod 4 → date-fns 4 → Router 7 → Tailwind 4 → Vite 6 → React 19) — one PR each, plan in `docs/DEP_UPGRADE_PLAN.md`.
- ⬜ `supabase/functions/place-search/index.ts` (1455 LOC) refactor — blocked on characterization tests.
- ⬜ Notification / community domain rebuild — blocked on characterization tests.

## Production baseline pass — v1.8.0 (2026-08-20)

First step of the 15-step production prompt pack. Deliberately additive; no DB migration,
no runtime behavior change, no dependency bump.

- ✅ Secret-leak fix: `src/integrations/supabase/client.ts` no longer logs the full Supabase
  URL on project mismatch — only the project ref (public).
- ✅ `docs/PRODUCTION_READINESS_BASELINE.md` — explicit PASS / PARTIAL / BLOCKED per surface,
  with cited evidence.
- ✅ `docs/PRODUCTION_RISK_REGISTER.md` — severity-ordered P0–P3 register.
- ✅ `docs/HISTORICAL_SECRET_EXPOSURE.md` — provider-name-only exposure register; credential
  scan (tracked source + BASEREQUIREMENTS text) = 0 hits with positive control.
- ✅ `docs/TESTING.md` §3 — Edge Function characterization harness foundation (Deno);
  explicitly BLOCKED until a Deno runner is wired.
- ✅ `typecheck` script added; CI now runs `bun run typecheck`.
- ⬜ Lint (current-disk: 248 errors / 31 warnings across the wider repository)
  — tracked as R-06; requires characterization-safe per-file cleanup.
- ⬜ SECURITY DEFINER Round B execution — one approved migration per high-risk function.
- ⬜ Secret rotations (Mapy / Geoapify / TomTom / Eventbrite / Ticketmaster / SeatGeek / Lovable)
  — operator action in provider consoles.
- ⬜ Local Supabase migration dry-run / RLS persona tests — operator.
- ⬜ Playwright smoke execution — needs browser install + dev server.

## Ordered production prompt pack

### Prompt 02 — Domain architecture & safe refactor — v1.8.1 PARTIAL

- ✅ Current domain/LOC map and dependency boundaries documented.
- ✅ Four `placeSearch` pure helpers exported without behavior change; 13 characterization cases.
- ⬜ Load-bearing Edge/Admin/Organizer refactors remain behind Deno/component characterization.

### Prompt 03 — Identity/profile privacy — v1.8.2 PARTIAL / PRIVACY HOLD

- ✅ Public-profile DTO whitelist helper + 6 unit cases.
- ⬜ Runtime call-site adoption, public DB view/RPC, column-safe RLS personas, onboarding,
  deletion and block/report boundaries remain unproven. A client DTO alone is not a DB boundary.

### Prompt 04 — Social graph — v1.8.3 PARTIAL

- ✅ Pure encounter/reconnection/block/circle invariants + 17 unit cases.
- ⬜ DB/RLS/UI lifecycle remains deferred until Prompt 06 provides a verified completion signal.

### Prompt 05 — Virtual Hubs 2.0 — v1.8.4 foundation PARTIAL / RELEASE HOLD

- ✅ In-source admin auth boundary for `virtual-hubs-admin`; client-controlled cron bypass removed
  from `generate-hub-events`.
- ✅ Deterministic identity/demand/scoped-diff helper + 11 unit cases.
- ✅ Admin real/generated/unknown counts; AI qualification uses explicit real demand only and
  fails closed when `user_origin` cannot be proven.
- ✅ Destructive refresh and AI event writes fail closed in Edge/UI; hub edit does not apply a
  potentially truncated snapshot to membership state. Preview/config remain admin-only.
- ✅ Requirement Coverage Matrix and rollback: `docs/VIRTUAL_HUBS_2_FOUNDATION.md`.
- ⬜ No DB migration: canonical unique identity, duplicate reconciliation, transactional
  per-profile sync, job lock/scheduler, durable audit and RLS personas remain blocked.
- ⛔ Global P0: `.env` is tracked; credential rotation/tracking remediation is operator-owned.
- ⛔ Live Edge deployment/auth smoke and target schema evidence are NOT VERIFIED.

### Remaining ordered steps — NOT_STARTED

| Prompt | Scope | Current execution status | Entry condition |
|---|---|---|---|
| 06 | Event lifecycle and participant experience | NOT_STARTED | Prompt 05 rollback boundary closed; completion-state contract characterized |
| 07 | Organizer suite production | NOT_STARTED | Event lifecycle and organizer authorization evidence |
| 08 | Discovery, recommendation and matching | NOT_STARTED | Stable event/profile contracts and privacy-safe signals |
| 09 | External events, places and geo pipeline | NOT_STARTED | Deno/provider harness and rate-limit evidence |
| 10 | Notifications, communications and engagement | NOT_STARTED | Event lifecycle + consent/preferences contract |
| 11 | AI demand aggregation and auto-events | NOT_STARTED | Prompt 05 idempotency/job-lock migration and trust gates |
| 12 | Admin control plane and operations | NOT_STARTED | Admin audit/least-privilege foundations proven |
| 13 | Trust, safety, moderation and data protection | NOT_STARTED | Policy-owner decisions and RLS/persona harness |
| 14 | Observability, performance, accessibility and quality | NOT_STARTED | Earlier runtime surfaces available for measurable verification |
| 15 | Monetization, analytics, launch and cutover | NOT_STARTED | All P0/P1 gates closed or owner-approved with expiry |

Per the pack order, this round stops at Prompt 05. No Prompt 06 implementation was started.

## Why some sprints are deferred

The plan file specifies aggressive refactors of files that are load-bearing for admin workflows the user actively depends on (bulk user actions, hub management, organizer dashboard). Executing them inside a single automated pass would violate the repo's non-negotiable rule ("never break already working functionality"). Ship them behind targeted requests, one component at a time, with characterization tests in the same change.
