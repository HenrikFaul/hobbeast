# Changelog

All notable changes to **Hobbeast** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical append snippets and upload READMEs from earlier release cycles are preserved under [`docs/releases/`](./docs/releases/). The pre-Hobbeast (Pubapp era) history is archived as [`docs/releases/changelog.legacy.md`](./docs/releases/changelog.legacy.md).

---

## [Unreleased]

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
