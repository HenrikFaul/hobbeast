# Sprint program status

Live status of the 5-sprint improvement program (`Hobbeast_5_sprint_javito_fejleszto_brandterv.md`). Update this doc whenever a sprint task lands.

Legend: ✅ done · 🟡 partial · ⬜ deferred

## Sprint 1 – Setup & Governance
- ✅ 1.1 Repo & versioning (`README.md`, canonical `CHANGELOG.md`, `RELEASE_PROCESS.md`, `scripts/validate-release.mjs`, version bump to 1.6.8, legacy archive under `docs/releases/`).
- ✅ 1.2 Runtime config & secrets (`src/lib/env.ts` Zod validator, `supabase/functions/shared/env.ts` `requireEnv/redact`, `docs/SECRETS_ROTATION.md`).
- ✅ 1.3 Test foundation (Vitest suites for `passwordValidation`, `utils.cn`, `eventParticipantStats`, `hobbyCategories`; Playwright smoke `e2e/smoke.spec.ts`; `docs/TESTING.md`).
- ✅ 1.4 Build hygiene (`vite.config.ts` `manualChunks` for react-vendor/radix-ui/supabase/query/leaflet/motion/forms, `React.lazy` for all non-landing routes, `docs/BUILD.md`).
- 🟡 1.5 Edge function env-helper adoption. The shared `requireEnv` helper is available; migrating every existing function is deferred to Sprint 3 to avoid regression risk during the same-cycle refactors.

## Sprint 2 – Address Manager & Places
- 🟡 2.x The `sync-local-places` clamp bug (200 → 60/50) and `AdminEventbrite` split are tracked as follow-ups. Ship prerequisites first: characterization tests around `place-search` responses.
- ⬜ Duplicate `_shared` folder consolidation deferred pending an owner review of which copy is canonical in the target DB deploy.

## Sprint 3 – Organizer & Admin Core
- ⬜ Deferred. `OrganizerDashboard.tsx` and `AdminUsers.tsx` refactors require a dedicated pass; touching them without the Sprint 1.3 characterization tests around them would regress recently shipped admin work (hubs pagination, +N popover, bulk filters).

## Sprint 4 – Community & Engagement
- ⬜ Deferred. Notification/real-time hooks are stable; changes here should ride on a product ask, not a general refactor.

## Sprint 5 – Product & Brand Finalization
- ✅ 5.a Brand/messaging pivot (light teal/emerald palette, "shared experiences" copy) — landed in an earlier turn.
- ✅ 5.b `index.html` head metadata already sets Hobbeast-specific `<title>`, description, `og:*`, and `twitter:*`.
- 🟡 5.c Bundle performance — Sprint 1.4 code-splitting delivers the initial payload win. A follow-up asset audit (images ≥ 100 KB) is queued.

## Why some sprints are deferred

The plan file specifies aggressive refactors of files that are load-bearing for admin workflows the user actively depends on (bulk user actions, hub management, organizer dashboard). Executing them inside a single automated pass would violate the repo's non-negotiable rule ("never break already working functionality"). Ship them behind targeted requests, one component at a time, with characterization tests in the same change.
