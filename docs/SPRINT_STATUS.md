# Sprint program status

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
- ⬜ Multi-Supabase runtime assertion module — contract written, code deferred.
- ⬜ Dep majors (Zod 4 → date-fns 4 → Router 7 → Tailwind 4 → Vite 6 → React 19) — one PR each, plan in `docs/DEP_UPGRADE_PLAN.md`.
- ⬜ `supabase/functions/place-search/index.ts` (1455 LOC) refactor — blocked on characterization tests.
- ⬜ Notification / community domain rebuild — blocked on characterization tests.

## Why some sprints are deferred

The plan file specifies aggressive refactors of files that are load-bearing for admin workflows the user actively depends on (bulk user actions, hub management, organizer dashboard). Executing them inside a single automated pass would violate the repo's non-negotiable rule ("never break already working functionality"). Ship them behind targeted requests, one component at a time, with characterization tests in the same change.
