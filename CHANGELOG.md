# Changelog

All notable changes to **Hobbeast** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical append snippets and upload READMEs from earlier release cycles are preserved under [`docs/releases/`](./docs/releases/). The pre-Hobbeast (Pubapp era) history is archived as [`docs/releases/changelog.legacy.md`](./docs/releases/changelog.legacy.md).

---

## [Unreleased]

---

## [1.9.1] — 2026-08-24

**The Expericentre/Hobbeast site is live again.** The retired Supabase projects
(`dsymdijzydaehntlmfzl` canonical, `olzvughcoqnfkdpvbwjy` Lovable) no longer exist; a new
hosted project **`bqdvqmpwccsxumzijspj`** ("Hobbeast", eu-central-1, ~10 USD/month,
user-approved) now carries the full schema, the restored production data and the first
Edge Functions. Login is proven end-to-end.

### Hosted execution (first time in the program)
- All **93 migrations applied** to the new project via a pg_net bootstrap: the database
  fetched each migration from the public GitHub repo (per-file md5 verified against local
  git blobs), executed them server-side in ordered batches, and recorded the ledger.
  Result: 129 public tables, 126 with RLS, 241 functions.
- **Production data restored**: 933 auth users + 935 identities (bcrypt hashes intact →
  old passwords keep working), 933 profiles, 11 events, 1487 deduped hubs, 2699 hub
  members — loaded through a temporary double-keyed SECURITY DEFINER gate (dropped
  immediately after), FK-safe topo order, triggers neutralized and reattached per the
  restore runbook. Row counts match the local rehearsal exactly.
- **Login verified**: GoTrue password-grant returns a session; the signup trigger creates
  enriched profiles; the browser UI (Events feed with restored Ticketmaster supply,
  Profile page) works with an authenticated session against the new project.
- **Edge Functions deployed (6/26)**: event-operations (RSVP/lifecycle),
  notification-preferences, discovery-feedback, delete-account, admin-user-profile-update,
  mass-create-users. The remaining 20 are bundled and ready (see Deferred).

### Fixed
- **GoTrue NULL-token restore defect**: restored `auth.users` rows carried NULL in the
  token columns GoTrue always writes as `''`, breaking `/token` with "Database error
  querying schema". The POST runbook step now normalizes all eight token columns.
- **Dual signup-trigger collision**: production ran `on_auth_user_created` +
  `on_auth_user_created_hobbeast`; on the migrated schema (NOT NULL `user_id` + derive
  trigger) the second insert hits a non-arbiter unique constraint. The runbook now attaches
  only the enriched `handle_new_user_profile` trigger, which covers both jobs.
- Restore runbook (`scripts/restore/`): identity-key unique index lifted around
  backfill+dedup; `20260824010000_restore_schema_parity.sql` landed in the applied chain.

### Changed
- Canonical project ref `dsymdijzydaehntlmfzl` → `bqdvqmpwccsxumzijspj` in
  `src/lib/supabaseProjects.ts`, `src/integrations/supabase/client.ts`, `vite.config.ts`,
  `supabase/config.toml`, `supabase/functions/shared/projectContract.ts`, tests, `.env`.
- `bun run build` (production) passes for the first time — the fail-closed target-ref gate
  now has a live matching project.

### Verification
- `bun run test` 323/323 PASS · `typecheck` PASS · production `build` PASS.
- Hosted smoke: password login 200 + access token; authenticated REST (own profile, hobby
  catalog) and `list_discoverable_events_safe` RPC return correct data; `event-operations`
  counts action responds; RLS restricts profile reads to own/public rows.
- Local rehearsal DB re-validated with the same batches: 15/15 SQL fixtures PASS on loaded
  production data.

### Deferred / operator notes
- **20 Edge Functions still to deploy** (bundles ready in the session scratchpad; redo via
  the same `deploy_edge_function` flow): trust-safety, admin-control-plane,
  admin-bulk-user-actions, analytics-ingest, virtual-hubs-admin, generate-hub-events,
  notification-delivery-worker, organizer-ai-proposals, ai-event-proposals, place-search,
  mapy-routing, eventbrite-import, seed-venues, sync-external-events, sync-local-places,
  sync-seatgeek-events, sync-ticketmaster-events, address-manager-discovery,
  address-manager-task-generator, address-manager-worker.
- Provider API keys (Geoapify/TomTom/Ticketmaster/SeatGeek/Eventbrite/Mapy/Gemini) are not
  set as Edge secrets — sync functions fail closed until the operator adds them.
- Auth config (Site URL, redirect URLs, SMTP for signup emails) needs the dashboard;
  the built-in sender is rate-limited. Storage avatar files were not in the DB dump —
  avatars start empty.
- Vercel (or other host) frontend env vars must be updated to the new project URL/key
  and redeployed for the public site.
- The repo is public and `.env` is tracked with the new anon key (public by design) and
  the AWS Location key — rotate the AWS key and untrack `.env` (standing P0).

---

## [1.9.0] — 2026-08-23

Runtime database evidence pass. The program's central HOLD reason — "no migration has ever
been proven against the real database" — is closed for the local layer: a reproducible harness
restores the 2026-06-18 production dump (933 users) into a disposable PostgreSQL 18 cluster,
replays the full migration chain and runs every SQL acceptance fixture. The replay exposed
production schema drift that source review could never see; a new reassertion migration
repairs it. No hosted project was touched: no deploy, no push, no live migration.

### Added
- `scripts/verify-database.mjs` + `bun run db:verify` — disposable-cluster database
  verification. `--mode=restore` (default) restores the newest dump from
  `E:/databasebackup/Hobbeast/backups` (override: `HOBBEAST_DB_DUMP`), replays every
  migration the dump ledger has not seen, then runs all 15 `supabase/tests/*.sql` fixtures;
  `--mode=fresh` proves greenfield provisioning from the repository alone.
- `supabase/tests/_local/00_roles.sql` — Supabase platform role bootstrap for vanilla
  PostgreSQL (anon/authenticated/service_role/supabase_admin/…).
- `supabase/tests/_local/pgshare/extension/` — local verification stubs for `pg_net`
  (records calls, no network), `pg_cron` (records jobs, no worker) and `supabase_vault`
  (plaintext shape, disposable clusters only), installed via PostgreSQL 18
  `extension_control_path`. The dump now restores with **0 errors**.
- `supabase/tests/_local/01_platform.sql` — fresh-mode platform scaffold: minimal
  `auth.users` + `auth.uid()/role()/jwt()`, storage buckets/objects/foldername, the
  `supabase_realtime` publication, and the hosted-style default privileges
  (API roles get blanket grants; RLS is the row boundary, migrations REVOKE selectively).
- `supabase/migrations/20260823010000_production_rls_reassertion_and_profile_identity.sql` —
  repairs live-vs-migrations drift proven by the replay (details under Security/Fixed).

### Security
- The restored production state had **RLS disabled** on `virtual_hubs`, `virtual_hub_members`,
  `notifications`, `notification_preferences` and `event_messages` while every policy written
  for them was inert, and `anon` held full write grants on 16 tables. The reassertion
  migration re-enables RLS on all five, revokes `anon` INSERT/UPDATE/DELETE/TRUNCATE on the
  affected tables, and adds the missing SELECT/INSERT self-policies
  (`notification_preferences`, `virtual_hub_members`) so re-enabling cannot lock users out.
- `profiles_select_authenticated` (`USING (true)`, live-only, never in a migration) let any
  signed-in user read every private profile column (email, address, exact coordinates,
  birth date). Dropped; own-profile/public-profile/admin policies remain, everything else
  goes through the safe DTO/RPC surfaces.
- Live-only `event_participants_{insert,update,select}_self*` policies allowed direct client
  writes that bypass the audited Prompt 06 join/cancel/transition/complete state machine.
  Dropped; reads stay covered by the Prompt 06 read policy.
- `is_virtual_hub_host(uuid,uuid)` SECURITY DEFINER helper breaks the RLS recursion between
  the hub visibility policy and the new hub-member read policy.

### Fixed
- **The migration chain itself could not replay**: `20260423193000` and `20260425100000`
  re-add `app_runtime_config_provider_check` with a pre-`db:*` allowlist that existing rows
  violate (aborting everything after them on production data), and `20260423110000` seeds
  `provider='address_manager'` rows before any migration allows that value (aborting a
  clean-chain replay — the long-documented "baseline failure"). All three constraint re-adds
  are now `NOT VALID` (same rationale as the existing `20260425150000` relax migration).
- `complete_event_atomic` crashed on the production schema whenever `expected_end_at` was
  null: `end_time`/`event_time` are bare `time` columns live and cannot join a timestamptz
  COALESCE. They now combine with `event_date` first (fixed in `20260822060000`, which is
  still unapplied everywhere).
- `event_trip_plans` schema parity: live carries NOT NULL discrete
  `start_lat/start_lon/end_lat/end_lon` columns created outside the chain; the reassertion
  migration adds/backfills them where missing so fresh environments match production.
- The dashboard-era `event_trip_plans_select_event_audience` policy was broken (references
  `events.visibility`, not in the safe column allowlist → "permission denied") and leaky
  (OR'ed past the reveal-window precision policy). Dropped; the Prompt 06 precision policy
  is the read boundary.
- `profiles.profile_visibility` carried two contradictory CHECK constraints whose
  intersection banned the documented `members` tier; the legacy constraint is dropped and
  `friends` values normalize to `members`.
- `event_participants.status` double-constraint banned `invited`/`completed`, making the
  Prompt 06 completion lifecycle unwritable on live data; the legacy allowlist is dropped in
  favour of the full contract vocabulary.
- `events.participation_type` live allowlist rejected the column's own default (`'open'`);
  re-created to accept the default plus all historical values.
- `profiles.id` (auth user id, no default) made every `INSERT (user_id, …)` fail; a
  BEFORE INSERT trigger now derives `id`/`user_id` from each other. Fixtures upsert with
  `ON CONFLICT (user_id)` because the live `handle_new_user_profile` trigger auto-creates a
  profile per auth user.
- `trg_auto_promote_waitlist` was missing on the live database (dropped outside the migration
  chain; later migrations only redefine the function). Re-attached — without this no freed
  seat ever promoted a waitlisted participant on production data.
- `supabase/tests/prompt_06_09_integration.sql` populates the live NOT NULL discrete
  coordinate columns of `event_trip_plans`; `supabase/tests/security_definer_round_b.sql`
  now asserts the Edge-mediated (service_role-only) contract of the audited
  `admin_update_user_profile` replacement instead of the retired direct-grant model.

### Verification
- `bun run db:verify` — restore mode: dump restore 0 errors; 51 migrations applied,
  2 reconciled (objects predate the dump's ledger), 39 already in the ledger;
  **15/15 SQL fixtures PASS** (capacity, waitlist FIFO, RLS personas, privacy boundaries,
  feature-flag fail-closed, four-eyes, provider dead-letter, recommendation signals).
- `bun run db:verify -- --mode=fresh` — full 92-migration greenfield replay,
  **15/15 SQL fixtures PASS**: a new environment is provisionable from the repository alone.
- `bun run test` — PASS, 59 files / 323 tests. `bun run typecheck` — PASS.
  `bun run build:dev` — PASS (3,140+ modules).
- `bun run release:validate` / `bun run security:secrets` — still fail-closed as intended:
  `.env` remains tracked (operator-owned P0) and the historical requirement-pack files still
  carry credential-like patterns.

### Deferred / still open
- Hosted re-import of the dump and applying the pending 53 migrations to a live project
  remain operator actions; the harness proves the chain, not the hosted execution.
- `.env` untracking + credential rotation (P0), Deno/Edge runtime tests, Playwright E2E,
  and the legal/launch gates from `docs/GO_NO_GO_REPORT.md` are unchanged.

---

## [1.8.4] — 2026-08-22

Virtual Hubs 2.0 foundation (Prompt 05, partial). Closes two anonymous service-role paths in
the local source candidate, separates real demand from simulated membership, and adds a tested
scoped reconciliation-plan contract. Destructive hub refresh and AI event writes are now
fail-closed in the source candidate. This is **not** a production release: no Edge Function was
deployed and no DB migration was applied. P0 `.env`/rotation, live auth, schema, RLS and
transactional reconciliation gates keep the release on HOLD.

### Security
- `virtual-hubs-admin` now calls the shared `requireAdminUser` boundary before every
  service-role action even though gateway `verify_jwt=false` remains for compatibility;
  unauthenticated/non-admin requests normalize to 401/403.
- `generate-hub-events` no longer trusts client-controlled `_cron=true`. Every action requires
  a verified admin. Automated scheduling is disabled/HOLD until a server-held signature,
  replay protection and durable job lock exist.
- Gemini calls now have a 20-second timeout and normalize timeout failures.
- Production Vite builds fail closed unless the browser `VITE_*` URL, project ID and publishable
  key are present and consistently target the canonical Supabase host. `release:validate` also
  fails while `.env` is tracked by Git or its Git-index state cannot be proven.

### Added
- `supabase/functions/shared/virtualHubEngine.ts` — deterministic hub identity normalization,
  real/generated/unknown demand counts, explainable qualification and idempotent scoped
  membership-diff planning.
- `src/lib/__tests__/virtualHubEngine.test.ts` — 11 contract cases covering identity, Unicode,
  deduplication, origin separation, qualification and add/keep/remove idempotency.
- `docs/VIRTUAL_HUBS_2_FOUNDATION.md` — impact map, two-option decision, Requirement Coverage
  Matrix, security boundary, blockers and rollback.

### Changed
- Hub admin reads use the authenticated `virtual-hubs-admin` Edge contract. The legacy global
  refresh action and UI control are blocked with `HUB_REFRESH_MIGRATION_REQUIRED`; the underlying
  direct RPC remains a DB-release blocker until its grants are remediated.
- Hub edit preserves its metadata-only legacy behavior and never applies a partial snapshot as
  full desired membership. The tested add/keep/remove planner remains inert until a transactional,
  paginated DB reconciliation exists.
- Admin list/detail show real, generated, unknown and total membership separately.
- Auto-event config and preview use one allowlisted, authenticated server contract and qualify
  only on explicit real members with a named city. If `profiles.user_origin` is missing, the
  path fails closed with `HUB_USER_ORIGIN_SCHEMA_REQUIRED`. Event writes return
  `HUB_AUTO_EVENT_IDEMPOTENCY_REQUIRED` until durable idempotency and job locking exist.

### Corrected evidence
- Current-disk Git evidence proves `.env` is tracked despite `.gitignore`; readiness, exposure
  and risk docs now invalidate the earlier env-hygiene PASS without reproducing any value.
- v1.8.2 added 6 tests, so the correct transition was 55 → 61 (not 61 → 61).

### Deferred / release blockers
- Canonical DB identity key, duplicate-safe backfill, transactional profile reconciliation,
  job lock/scheduler, durable hub audit, RLS personas and live schema verification require an
  approved append-only migration and local/staging DB evidence.
- The existing `refresh_virtual_hubs()` RPC remains destructive, directly callable under legacy
  grants, and duplicate-prone with nullable unique columns; its Edge/UI routes are disabled, but
  SECURITY DEFINER Round B remediation is not applied.
- Deno/Edge runtime, Playwright and production deployment remain NOT VERIFIED.

### Verification
- `bun run test` — PASS, 12 files / 89 tests.
- `bun run typecheck` — PASS.
- Focused Prompt 05 ESLint — PASS, 0 errors / 0 warnings.
- `bun run build:dev` — PASS, 3097 modules transformed.
- `bun run build` — expected fail-closed HOLD because current `VITE_*` points to the non-canonical
  project. A non-secret canonical-env contract canary compiled 3097 modules, proving the gate has
  both deny and allow paths; this is not a deployable artifact. `bun run release:validate` —
  expected fail-closed HOLD because `.env` is tracked.
- Full `bun run lint` — FAIL, 248 errors / 31 warnings in the wider existing debt set.

---

## [1.8.3] — 2026-08-21

Social graph & relationship lifecycle (Prompt 04). Introduces pure social-graph invariants
(encounter derivation, mutual reconnection, symmetric blocking, circle consent) with a lock-in
test suite. No runtime UI or DB change in this increment; the helper is additive and
side-effect free.

### Added
- `src/lib/socialGraph.ts` — pure functions `deriveEncounterPairs`, `resolveConnection`,
  `isBlockedBetween`, `filterBlocked`, `canAddCircleMember`, `connectionStrength`. Encodes:
  encounters derive only from checked-in participation; a connection forms only on a mutual
  yes (one-sided signals stay `pending` and never surface to the other party); a block removes
  a user from every social surface in BOTH directions; circle membership requires owner consent
  or self-join.
- `src/lib/__tests__/socialGraph.test.ts` — 17 characterization cases. Test count 61 → 78
  (net +17 new, suite passes at 78).

### Changed
- `package.json` version `1.8.2` → `1.8.3`.

### Deferred (unchanged — still require operator decisions)
- The full social-graph DB schema (friend/block/circle/encounter tables, RLS, and a completion
  trigger) is intentionally NOT created yet: the live `events` table exposes only
  `event_date`/`event_time` and has no completion/`outcome_status` column, so an
  "encounters derive from completed events" trigger cannot be verified regression-free today.
  That schema remains a deferred operator decision (Prompts 04/07/12) and lands only after the
  completion signal is added to the events model.

---

## [1.8.2] — 2026-08-21

Identity / onboarding / profile privacy pass (Prompt 03). Introduces a pure public-profile DTO
helper so private profile fields are never exposed through a full `profiles` select. No runtime
UI behavior change in this increment; the helper is additive and side-effect free.

### Added
- `src/lib/profilePrivacy.ts` — pure `buildPublicProfileDto` + `PUBLIC_PROFILE_FORBIDDEN_KEYS`.
  Whitelists only coarse, public-safe fields (`display_name`, `avatar_url`, `city`, `hobbies`,
  `gender_public`, `age_public`) and hard-excludes `email`, `phone`, `address`,
  `location_lat`, `location_lon`, `date_of_birth`, `raw_user_meta_data`.
- `src/lib/__tests__/profilePrivacy.test.ts` — 6 characterization cases: forbidden-key
  exclusion, whitelisted key shape, correct mapping, no input mutation (side-effect free),
  sparse-row defaults, and null/trim hobby normalization. Test count 61 → 61 (net +6 new,
  suite passes at 61).

### Changed
- `package.json` version `1.8.1` → `1.8.2`.

### Deferred (unchanged — still require operator decisions)
- The `Profile.tsx` `select('*')` full-record load and its `(data as any).location_lat` cast
  remain flagged for a follow-up that adopts `buildPublicProfileDto` at the call site; the pure
  helper and its lock-in test land first so the refactor is provably regression-free.
- Block/report trust primitives, progressive onboarding flow, and account-deletion policy remain
  on the roadmap (Prompts 03/05/13) and require the same characterization-first approach.

---

## [1.8.1] — 2026-08-20

Domain architecture & safe refactor (Prompt 02). Incremental characterization foundations on
the largest load-bearing module (`placeSearch.ts`); no file restructuring of the deferred
admin/organizer/events yet — those stay behind characterization per the prompt's own rule.

### Added
- `docs/DOMAIN_ARCHITECTURE.md` — current domain-boundary map, planned `src/features/*` layer,
  actual measured LOC table (prompt's older snapshot values corrected: `place-search` 1455 → 1306,
  `src/lib/placeSearch.ts` 408 → 358), Mermaid dependency diagram, and safety invariants.
- `src/lib/placeSearch.ts` — pure helpers `normalizeText`, `safeNumber`, `isValidCoordinate`,
  `coerceStringArray` now exported (behavior byte-identical; only `export` keyword added).
- `src/lib/__tests__/placeSearch.test.ts` — characterization coverage for the exported pure
  helpers: 13 new cases (trim, null/undefined coercion, non-string primitives, first-finite
  number, out-of-range coords, null-island (0,0), non-finite coords, array/string/empty/
  object category coercion). Test count 42 → 55.

### Changed
- `package.json` version `1.8.0` → `1.8.1`.

### Deferred (unchanged — still require characterization before touching)
- `supabase/functions/place-search/index.ts` (1306 LOC) — needs Deno harness (R-03).
- `src/pages/Events.tsx` (921), `src/components/admin/AdminUsers.tsx` (811),
  `src/components/CreateEventDialog.tsx` (628), per-provider split of `AdminEventbrite.tsx` (982)
  — deferred until characterization tests exist (per prompt rule: do not refactor load-bearing
  modules blind).

---

## [1.8.0] — 2026-08-20

Production baseline pass (Prompt 01 of the 15-step production prompt pack). Additive docs,
a secret-leak fix, and a `typecheck` script/CI wiring change. No DB migration, no runtime
behavior change, no dependency bump.

### Security
- `src/integrations/supabase/client.ts` — the wrong-project `console.error` no longer logs the
  full `configuredUrl` (Supabase URL). It logs only the project ref (public, safe) and the
  expected ref, matching the `supabaseProjects.ts` "never leak URL in message" contract.

### Added
- `docs/PRODUCTION_READINESS_BASELINE.md` — machine-readable readiness audit with explicit
  PASS / PARTIAL / BLOCKED status per surface and cited evidence (install, typecheck, tests,
  build, release validate).
- `docs/PRODUCTION_RISK_REGISTER.md` — severity-ordered risk register (P0–P3) with owner,
  mitigation, gate, and rollback strategy.
- `docs/HISTORICAL_SECRET_EXPOSURE.md` — provider-name-only register of known historical
  exposures and rotation status (no key values, no fingerprints). Scan evidence: 0 credential
  hits in tracked source + BASEREQUIREMENTS text files, with a positive control check.
- `docs/TESTING.md` §3 — Edge Function characterization harness foundation (Deno): required
  fixture cases (provider success/failure/timeout/malformed/empty, auth, target-ref, env),
  the extract-pure-logic pattern, and the explicit note that this gate stays BLOCKED until a
  Deno runner is wired.
- `package.json` — `typecheck` script (`tsc --noEmit`); CI now runs `bun run typecheck`
  instead of `bunx tsc --noEmit` so the documented command and CI stay consistent.

### Changed
- `package.json` version `1.7.6` → `1.8.0`.

### Deferred (unchanged — still require operator decisions)
- **Secret rotation** for Mapy / Geoapify / TomTom / Eventbrite / Ticketmaster / SeatGeek /
  Lovable in the provider consoles (see `docs/HISTORICAL_SECRET_EXPOSURE.md`).
- **SECURITY DEFINER Round B execution**: draft SQL ready; each function change ships as its
  own approved migration.
- **Dep majors** (Zod 4 → date-fns 4 → Router 7 → Tailwind 4 → Vite 6 → React 19): sequenced
  in `docs/DEP_UPGRADE_PLAN.md`, one PR each.
- **`place-search/index.ts` (1455 LOC) refactor** and **notification/community domain rebuild**:
  still blocked on the Edge Function characterization harness (foundation documented in
  `docs/TESTING.md` §3).
- **Lint**: `eslint .` reports 268 pre-existing `no-explicit-any` errors in Edge Function
  (Deno) files and `tailwind.config.ts`; not caused by this pass, tracked as R-06 in
  `docs/PRODUCTION_RISK_REGISTER.md`.

---

## [1.7.6] — 2026-07-21

Additive follow-up to v1.7.5 covering every remaining v2 audit item that could be shipped without operator decisions (no key rotation, no SQL execution, no dep bumps). Focuses on characterization-test coverage that unblocks future risky refactors, plus the multi-Supabase runtime assertion promised in the contract doc.

### Added
- `src/lib/redirect.ts` — pure `sanitizeRedirectPath` helper extracted from the inline v1.7.4 sanitizer in `src/pages/Auth.tsx`. `Auth.tsx` now delegates to it. Behavior identical.
- `src/lib/supabaseProjects.ts` — canonical `TARGET_SUPABASE_PROJECT_REF`, `extractProjectRef`, `classifyProjectRef`, `assertTargetProject`. Never returns the URL in the message; only the ref.
- Boot-time multi-Supabase assertion in `src/main.tsx`: logs a name-only `console.warn` if the frontend is bound to a project other than `dsymdijzydaehntlmfzl` (Lovable Cloud, unknown, etc.). Non-blocking.
- Characterization tests:
  - `src/lib/__tests__/redirect.test.ts` (9 cases: empty, safe path, protocol-relative, javascript:, backslash, non-slash, malformed URI, percent-encoded internal and external).
  - `src/lib/__tests__/supabaseProjects.test.ts` (8 cases including the "never leak URL in message" guard).
  - `src/lib/__tests__/adminEventbriteHelpers.test.ts` (11 cases covering `formatDbCell`, `matchesColumnFilters`, `enrichMapperRow`). These lock the pure-helper contract so the deferred per-provider card split of `AdminEventbrite.tsx` can proceed safely.
- `docs/sql/security_definer_round_b_DRAFT.sql` — draft (not applied) of the SECURITY DEFINER Round B remediation for `refresh_virtual_hubs` and the sketch for `admin_update_member_profile`. Ships as a reviewable file; execution stays behind the migration-approval flow.

### Changed
- `src/pages/Auth.tsx` — inline sanitizer removed; imports `sanitizeRedirectPath` from `@/lib/redirect`.
- `package.json` version `1.7.5` → `1.7.6`. Test count 31 → 42.

### Deferred (unchanged — still require operator decisions)
- **Secret rotation** for Mapy / Geoapify / TomTom / Eventbrite / Ticketmaster in the provider consoles. Nothing in the repo unblocks this.
- **SECURITY DEFINER Round B execution**: draft SQL is ready in `docs/sql/`, but each function change ships as its own approved migration.
- **Dep majors** (Zod 4 → date-fns 4 → Router 7 → Tailwind 4 → Vite 6 → React 19): sequenced in `docs/DEP_UPGRADE_PLAN.md`, one PR each.
- **`supabase/functions/place-search/index.ts` (1455 LOC) refactor** and **notification/community domain rebuild**: still blocked on Edge Function characterization tests (out of scope for a frontend-only test suite; needs Deno-side harness).

---


## [1.7.5] — 2026-07-21

Documentation + CI-only pass covering the low-risk half of the remaining v2 audit backlog. No runtime code, no SQL, no dep bumps in this release — those still require per-item sign-off (key rotation, migration approval, breaking upgrades) and are staged in the new docs so a future round can execute each one atomically.

### Added
- `.github/workflows/ci.yml` – quality gate on push/PR: `tsc --noEmit`, `vitest run`, `scripts/validate-release.mjs`, `vite build`. First CI gate the repo has; purely additive, does not block existing flows.
- `docs/SECURITY_DEFINER_AUDIT.md` – full inventory of every `SECURITY DEFINER` function in `supabase/migrations/`, per-function risk rating, and the exact remediation template (add `has_role(auth.uid(), 'admin')` guard, `REVOKE ... FROM PUBLIC`, one function per migration). No SQL executed; audit only.
- `docs/MULTI_SUPABASE_CONTRACT.md` – written contract for which project (Lovable Cloud `olzvugh...`, target `dsymdijzydaehntlmfzl`, geodata) each layer (frontend `.env`, Edge Functions, CLI) must point at, plus the failure signatures for misrouting.
- `docs/DEP_UPGRADE_PLAN.md` – sequenced major-upgrade plan (Zod 4 → date-fns 4 → Router 7 → Tailwind 4 → Vite 6 → React 19) with per-step verification gate and rollback rule ("one major per PR").

### Changed
- `package.json` version `1.7.4` → `1.7.5`.

### Deferred (still — decisions required from operator)
- **Secret rotation** for Mapy / Geoapify / TomTom / Eventbrite / Ticketmaster: must be done in each provider's console; the repo already reads from env only (v1.7.4), no code change unblocks this.
- **SECURITY DEFINER remediation migrations** (Round B in the audit): one migration per High-risk function, needs approval per migration.
- **Multi-Supabase runtime assertion** module: designed in the contract doc, waiting for a build window with regression time.
- **Dependency majors**: sequenced in the upgrade plan; each bump lands as its own PR with a matching revert draft.
- **`place-search/index.ts` 1455-line refactor** and **notification/community domain rebuild**: still gated on characterization tests, per the repo non-negotiable rule.

---


## [1.7.4] — 2026-07-21

Focused P0 hardening pass from the fresh 5-sprint audit (`Hobbeast_friss_repoaudit_es_hatralevo_5_sprintes_fejlesztesi_terv_v2.md`). Only the concrete, decision-free code fixes were shipped in this round — the deeper multi-Supabase-project contract, SECURITY DEFINER SQL audit, dependency upgrades, CI quality gate, and full domain refactors are deferred and require per-sprint execution with rotation runbooks and characterization tests.

### Security
- Removed the hardcoded Mapy API key fallback from `src/lib/mapy.ts`. **Action required:** rotate the previously-committed Mapy key in the Mapy console and set `VITE_MAPY_API_KEY` — see `docs/SECRETS_ROTATION.md`.
- `src/pages/Auth.tsx` now sanitizes the `?redirect=` query parameter: only relative, single-slash, internal paths are honored. Blocks `//host`, protocol-relative, `javascript:`, backslash and any absolute URL — closes the open-redirect vector.
- Google OAuth `redirectTo` no longer points at the hardcoded `hobbeast.vercel.app` origin; it now uses `window.location.origin`, so sign-in returns to whichever domain the user actually authenticated from (localhost, Lovable preview, `expericentre.com`, custom domains).

### Fixed
- Duplicate OAuth error toast branch in `src/pages/Auth.tsx` collapsed to a single, correct handler.
- `src/pages/EventDetail.tsx` external-event `sessionStorage` load is now wrapped in `try/catch`; a corrupted payload no longer throws at render, and the bad entry is cleared.
- `src/pages/EventDetail.tsx` "Szervezés" button no longer navigates to the undeclared `/events/:id/organize` route; it now opens `/organizer?event=:id`, which the existing `/organizer` route handles.

### Changed
- `README.md` "Current version" bumped `1.6.8` → `1.7.4` (the release validator only checks `package.json` vs `CHANGELOG.md`, so this string had drifted).

### Deferred (documented, not shipped)
- Sprint 1.1 (multi-Supabase project contract & single env source of truth), 1.4 (SECURITY DEFINER / Vault / admin RPC hardening migration), 1.5 (CI quality gate workflow), 2 (place-search / eventing domain rebuild), 3 (organizer & admin core split), 4 (community / notification / a11y), 5 (product & brand finalization deep pass) all require per-sprint owner decisions (rotation, allowlists, DB migration review) and characterization tests. Ship them one sprint per round.

---



## [1.7.3] — 2026-07-21

### Changed
- Sprint 2.d – extracted 15 pure helpers, constants, and the `ExternalEventList` presentational component out of `src/components/admin/AdminEventbrite.tsx` into `src/components/admin/adminEventbriteHelpers.tsx`. Main file dropped from 1410 → 982 LOC. Behavior byte-identical (verbatim move + re-export); no state, handlers, or Supabase calls touched.
- Sprint 3 (partial) – extracted `MetricCard` / `InfoPill` from `src/pages/OrganizerDashboard.tsx` into `src/pages/organizer/StatCards.tsx`. Presentational-only; parent state untouched.

### Deferred (explicit)
- Sprint 3 deep refactor (organizer tab-content extraction, `AdminUsers` hub tab split) and Sprint 4 (notification hook consolidation) remain deferred. Per repo governance ("never break already working functionality") these require characterization tests before touching, since they mutate active bulk-user / hub-management / organizer-wizard flows. User explicitly accepted the "may break tonight" risk; agent chose to still ship the safe extractions in this round rather than mangle load-bearing state graphs blind.

---

## [1.7.2] — 2026-07-21

### Changed
- Sprint 5.c – asset audit pass. Recompressed `src/assets/hero-community.jpg` (1600×900, quality 82, metadata stripped): 215 KB → 200 KB. Hero `<img>` now declares intrinsic `width={1600}` / `height={900}` and adds `decoding="async"` + `fetchPriority="high"` so the LCP element is prioritized and doesn't shift layout.

### Removed
- Sprint 5.c – deleted unused duplicate `public/hobbeast-logo.png` (all logo imports resolve `@/assets/hobbeast-logo.png`).

---

## [1.7.1] — 2026-07-21

### Added
- Sprint 2 characterization test for `place-search` response normalization (`src/lib/__tests__/placeSearch.test.ts`) locking in the current `NormalizedPlace` contract (Geoapify + TomTom rows, sparse metadata fallback, rating→confidence clamp). `mapEdgePlace` is exported for testing.

### Changed
- Sprint 1.5 – migrated the shared Edge Function helpers to `requireEnv`: `supabase/functions/shared/providerFetch.ts` (service role key) and `supabase/functions/sync-local-places/batchRunner.ts` (Geoapify + TomTom keys) now log missing variable names only, never values.

### Removed
- Sprint 2 – deleted the duplicate `supabase/functions/address-manager-shared/` folder (address-manager pipeline consistently imports the `_address-manager-shared` copy).
- Sprint 2 – deleted the duplicate `supabase/functions/sync-local-places/_shared/` tree that carried a stale `DEFAULT_SYNC_CONFIG` (`geo_limit: 60`, `tomtom_limit: 50`) and was not imported by any function. Only the top-level `constants.ts` (with the 6000/6000 defaults) remains.

### Fixed
- Sprint 2 – removes the last on-disk source of the phantom 60/50 clamp that produced the "A backend kisebb limitet mentett vissza" toast when saving `geo_limit` / `tomtom_limit = 200` in the admin UI. The active clamp remains `1 .. 1_000_000` in `sync-local-places/config.ts`.

---


## [1.7.0] — 2026-07-21

### Added
- Sprint 1.1 – canonical `README.md`, canonical `CHANGELOG.md`, `RELEASE_PROCESS.md`, `scripts/validate-release.mjs`, `npm run release:validate`.
- `docs/releases/` archive for legacy `CHANGELOG_APPEND_*.md`, `UPLOAD_README*.md`, and the Pubapp-era changelog.
- Sprint 1.2 – Zod frontend runtime config validator (`src/lib/env.ts`), shared Edge Function env helper (`supabase/functions/shared/env.ts`) with `requireEnv`, `MissingEnvError`, and `redact`, and a secret-rotation runbook (`docs/SECRETS_ROTATION.md`).
- Sprint 1.3 – characterization test foundation: Vitest suites for `passwordValidation`, `utils.cn`, `eventParticipantStats`, and `hobbyCategories` under `src/lib/__tests__/`, a Playwright smoke spec (`e2e/smoke.spec.ts`), and a testing guide (`docs/TESTING.md`).
- Sprint 1.4 – route-level `React.lazy` for every non-landing page and Vite `manualChunks` split (`react-vendor`, `radix-ui`, `supabase`, `query`, `leaflet`, `motion`, `forms`); `docs/BUILD.md` documents the strategy.
- `docs/SPRINT_STATUS.md` – single source of truth tracking the 5-sprint program with ✅ / 🟡 / ⬜ per sub-prompt.

### Changed
- `package.json` name set to `hobbeast`, version bumped to `1.7.0` reflecting the Sprint 1 governance + build-hygiene release.
- Initial JS payload for the landing page reduced from ~1.35 MB to ~136 KB (41 KB gzipped) after chunk splitting.

### Security
- `.env.example` documents variable names only; `.env` and `supabase/.temp/` remain gitignored; runbook forbids logging secret values and bundling server-only keys.

### Fixed
- Restored buildability by patching a broken `FunctionInvokeResult` import in the Supabase client shim and two type mismatches surfaced by the target DB schema (`AdminUsers` hub-member cast, `CreateEventDialog` insert payload cast).

### Deferred (documented, not shipped)
- Sprints 1.5 (edge-function env-helper migration), 2 (Address Manager refactor + clamp bug), 3 (OrganizerDashboard / AdminUsers refactor), and 4 (community/notification refactor) are tracked in [`docs/SPRINT_STATUS.md`](./docs/SPRINT_STATUS.md). They require characterization tests around the target components before a safe refactor and will land behind targeted product asks, not a blanket rewrite, per the repo's non-negotiable "never break working functionality" rule.

## [1.6.8] — 2026-04-22
### Fixed
- Geodata persistence hotfix for the `place-search` Edge Function. See [`docs/releases/UPLOAD_README_v1.6.8_geodata_persistence_hotfix.md`](./docs/releases/UPLOAD_README_v1.6.8_geodata_persistence_hotfix.md).

## [1.6.7] — 2026-04-20
### Fixed
- Config action ordering and provider validation in `place-search` Edge Function.

## [1.6.6] — 2026-04-18
### Fixed
- Conflict hotfix. See [`docs/releases/UPLOAD_README_v1.6.6_conflict_hotfix.md`](./docs/releases/UPLOAD_README_v1.6.6_conflict_hotfix.md).

## [1.6.4] — 2026-04-15
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.6.4.md`](./docs/releases/CHANGELOG_APPEND_v1.6.4.md).

## [1.6.3] — 2026-04-13
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.6.3.md`](./docs/releases/CHANGELOG_APPEND_v1.6.3.md).

## [1.6.2] — 2026-04-12
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.6.2.md`](./docs/releases/CHANGELOG_APPEND_v1.6.2.md).

## [1.5.1] — 2026-04-04
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.5.1.md`](./docs/releases/CHANGELOG_APPEND_v1.5.1.md).

## [1.5.0] — 2026-04-02
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.5.0.md`](./docs/releases/CHANGELOG_APPEND_v1.5.0.md).

## [1.4.7] — 2026-03-28
### Changed
- Details in [`docs/releases/CHANGELOG_APPEND_v1.4.7.md`](./docs/releases/CHANGELOG_APPEND_v1.4.7.md).

---

Earlier Hobbeast/Pubapp history: [`docs/releases/changelog.legacy.md`](./docs/releases/changelog.legacy.md).
