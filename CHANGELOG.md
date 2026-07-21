# Changelog

All notable changes to **Hobbeast** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical append snippets and upload READMEs from earlier release cycles are preserved under [`docs/releases/`](./docs/releases/). The pre-Hobbeast (Pubapp era) history is archived as [`docs/releases/changelog.legacy.md`](./docs/releases/changelog.legacy.md).

---

## [Unreleased]

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
