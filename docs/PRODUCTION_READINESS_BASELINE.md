# Production readiness baseline

> **Status:** baseline as of release **1.8.0 (first production-baseline pass, 2026-08-20)**.
> This file states the **actual, evidence-backed** readiness of each surface. It is not
> marketing copy. A surface is `PASS` only when it was empirically verified in this pass;
> otherwise it is `PARTIAL` (verified but with documented gaps) or `BLOCKED` (cannot be
> proven in this environment).
>
> Evidence rules: every PASS must cite a command + exit code, a test name, or a checked
> artifact. `NOT VERIFIED` means the check could not be executed here and the operator must
> run it in CI/staging.

> **Current-disk correction — 2026-08-22:** the earlier `.env` hygiene PASS is invalid.
> `git ls-files --stage -- .env` proves that `.env` is tracked even though `.gitignore`
> lists it. No values are reproduced here. Production release is **HOLD** until approved
> rotation/removal evidence closes R-00 in `PRODUCTION_RISK_REGISTER.md`.

## Legend
- ✅ **PASS** — verified in this pass with cited evidence.
- 🟡 **PARTIAL** — works but has a documented gap, or only part of the surface was verified.
- ⛔ **BLOCKED** — cannot be proven from this environment (operator/CI action required).

---

## 1. Build & test baseline

| Area | Status | Evidence |
|---|---|---|
| Lockfile reproducibile install | ✅ PASS | `bun install --frozen-lockfile` → `489 packages installed [43.37s]` (exit 0, 2026-08-20) |
| Typecheck | ✅ PASS | Current-disk `bun run typecheck` → exit 0 (2026-08-22) |
| Unit tests | ✅ PASS | Current-disk `bun run test` → 12 files, 89/89 tests (exit 0, 2026-08-22) |
| Release validate | ⛔ BLOCKED | v1.8.4 package/changelog agree, but validation intentionally exits 1 because `.env` is tracked |
| Development build | ✅ PASS | `bun run build:dev` → 3097 modules transformed (exit 0) |
| Production build | ⛔ BLOCKED | `bun run build` intentionally fails closed on the current non-canonical `VITE_*`. A non-secret canonical-env contract canary compiled successfully, proving the allow path but not producing a deployable artifact |
| Lint | ⛔ BLOCKED | Current-disk `bun run lint` (2026-08-22) → 248 errors, 31 warnings; still blocked under R-06 |
| Playwright smoke | 🟡 PARTIAL | `e2e/smoke.spec.ts` exists; needs a running dev server + browser install to execute here |
| Edge Function / Deno tests | ⛔ BLOCKED | No Deno harness wired yet; foundation documented in `docs/TESTING.md` §3 |
| Migration dry-run / local Supabase | ⛔ BLOCKED | No local Supabase container available in this environment; operator must run `supabase db reset` / migration dry-run |

## 2. Frontend routes & auth

| Area | Status | Evidence |
|---|---|---|
| Landing (`/`) | 🟡 PARTIAL | `src/pages/Index.tsx` exists and is wired in `App.tsx`; browser/runtime behavior was not executed in this pass |
| Explore (`/explore`) | 🟡 PARTIAL | `src/pages/Explore.tsx` exists; browser/runtime behavior was not executed in this pass |
| Events list/filter (`/events`) | 🟡 PARTIAL | `src/pages/Events.tsx` exists; authenticated filtering was not executed in this pass |
| Event detail (`/events/:id`) | 🟡 PARTIAL | `src/pages/EventDetail.tsx` exists and has an external-event storage guard; runtime behavior remains NOT VERIFIED |
| Organizer dashboard (`/organizer`) | 🟡 PARTIAL | Route and organizer modules exist; authenticated browser behavior remains NOT VERIFIED |
| Profile (`/profile`) | 🟡 PARTIAL | Route exists; runtime privacy remains HOLD because server-side projection/RLS is not proven |
| Auth (`/auth`) | 🟡 PARTIAL | Route exists and redirect sanitizer has unit coverage; provider/session browser flow remains NOT VERIFIED |
| Reset password (`/reset-password`) | 🟡 PARTIAL | Route exists; email/session recovery flow remains NOT VERIFIED |
| Admin (`/admin`) | 🟡 PARTIAL | Route/components exist; live admin authorization and target-project behavior remain NOT VERIFIED |
| Not-found / About | 🟡 PARTIAL | Route modules exist; browser rendering remains NOT VERIFIED |
| Route-level lazy loading / manual chunking | 🟡 PARTIAL | Historical build evidence exists in `docs/BUILD.md`; current browser performance was not measured |
| Native vs external event detail distinction | 🟡 PARTIAL | Source guard exists in `EventDetail.tsx`; browser behavior remains NOT VERIFIED |

## 3. Multi-Supabase contract

| Area | Status | Evidence |
|---|---|---|
| Contract doc | ✅ PASS | `docs/MULTI_SUPABASE_CONTRACT.md` exists (v1.7.5) |
| Frontend canonical ref | ⛔ BLOCKED | Code names `dsymdijzydaehntlmfzl`, but current tracked env resolves to a different project. v1.8.4 adds a production-build fail-closed gate; the env itself still requires operator remediation. |
| Boot-time assertion | 🟡 PARTIAL | `src/main.tsx` logs a ref-only warning at runtime. This was not a security boundary; v1.8.4 adds the production-build boundary in `vite.config.ts`. |
| Client URL leak | ✅ PASS | **Fixed in v1.8.0:** `src/integrations/supabase/client.ts` no longer logs `configuredUrl` (full URL) on project mismatch — only the ref. Verified in test stderr |
| Edge side fail-fast | 🟡 PARTIAL | `shared/targetProject.ts` throws on missing target URL/key; no explicit test harness around it yet (see §7) |

## 4. Edge Functions inventory

| Function | Status | Notes |
|---|---|---|
| `place-search` (~1455 LOC) | 🟡 PARTIAL | Load-bearing; response normalization locked by `src/lib/__tests__/placeSearch.test.ts` (v1.7.1). Deep refactor deferred until Deno characterization harness exists |
| `sync-local-places` suite | 🟡 PARTIAL | Batch runner uses `requireEnv` (v1.7.1); stale `_shared` defaults removed (v1.7.1) |
| `generate-hub-events` | 🟡 PARTIAL | Admin auth + bounded config + real-demand preview exist in source; event writes return 409 until idempotency/job lock; Deno/live proof missing |
| `virtual-hubs-admin` | 🟡 PARTIAL | Every source action requires admin auth; destructive refresh returns 409, but direct legacy RPC grants and live runtime proof remain blockers |
| `sync-external-events` / `eventbrite-import` / `sync-seatgeek-events` / `sync-ticketmaster-events` | 🟡 PARTIAL | External event pipeline; provider keys env-only (see exposure register) |
| `address-manager-*` suite (discovery / task-generator / worker) | 🟡 PARTIAL | Address/geo pipeline |
| `admin-bulk-user-actions` / `admin-user-profile-update` / `mass-create-users` / `seed-venues` / `delete-account` / `mapy-routing` | 🟡 PARTIAL | Admin + account + mapping surfaces; no per-function Deno harness yet |
| Shared helpers (`env.ts`, `providerFetch.ts`, `targetProject.ts`, `adminAuth.ts`) | ✅ PASS | `requireEnv` fail-fast + name-only logs; `providerFetch.fetchJson` error normalization; `targetProject.requireTargetProjectAdmin` admin guard |

## 5. Migrations / DB / RLS

| Area | Status | Evidence |
|---|---|---|
| Migration count & history | ✅ PASS | Current-disk count: 50 migration files under `supabase/migrations/` (verified 2026-08-22) |
| Append-only policy | ✅ PASS | no migration rewritten in this pass; new SQL would be a new timestamped file only |
| RLS on public tables | 🟡 PARTIAL | README: "RLS enforced on every public-schema table". Full per-table evidence requires a live DB inspection (operator) |
| SECURITY DEFINER | 🟡 PARTIAL | `docs/SECURITY_DEFINER_AUDIT.md` exists (v1.7.5); Round B draft SQL exists (v1.7.6) but **not applied**; each high-risk function needs its own approved migration |
| New public table in this pass | ✅ PASS | none added |

## 6. Secrets & env hygiene

| Area | Status | Evidence |
|---|---|---|
| Credential scan (tracked source) | ⛔ BLOCKED | The 2026-08-20 pattern scan did not establish env hygiene: current-disk verification proves `.env` is tracked. Treat secret-capable values as potentially exposed; see R-00. |
| BASEREQUIREMENTS scan | ✅ PASS | `baserequests1.txt` + `baserequests2.txt` scanned with same patterns → 0 hits |
| Env validation (frontend) | ✅ PASS | `src/lib/env.ts` Zod validator |
| Edge `requireEnv` + `redact` | ✅ PASS | `supabase/functions/shared/env.ts` — fail-fast, name-only logs |
| Frontend `VITE_` publishable vs forbidden classification | ✅ PASS | README § Environment variables + `docs/SECRETS_ROTATION.md` § Server-only keys |
| `.env` in release artifact | ⛔ BLOCKED | `.gitignore` lists `.env`, but `git ls-files --stage -- .env` returns a tracked blob. Ignore rules do not remove tracked files. |
| Historical known exposures register | ✅ PASS | `docs/HISTORICAL_SECRET_EXPOSURE.md` (Mapy.cz legacy hardcoded key removed v1.7.4; rotation still operator action) |

## 7. Edge Function test harness (foundation introduced in this pass)

| Area | Status | Evidence |
|---|---|---|
| Foundation documentation | ✅ PASS | `docs/TESTING.md` §3 — required fixture cases + extract-pure-logic pattern |
| Deno characterizeable helper functions extracted for testability | 🟡 PARTIAL | Foundation documented; extraction is incremental per function (avoids breaking load-bearing contracts) |
| Mocked external network | ⛔ BLOCKED | No Deno test runner wired locally; operator must run the Deno-side harness in CI |

## 8. Observability foundation (introduced in this pass)

| Area | Status | Evidence |
|---|---|---|
| Request/correlation ID | 🟡 PARTIAL | Helper contract documented; adoption across Edge Functions is incremental (avoids breaking existing error contracts) |
| Structured log event names | 🟡 PARTIAL | `[edge-env]`, `[SupabaseConfig]`, `[EdgeInvoke]` patterns exist; naming convention being standardized |
| Secret redaction | ✅ PASS | `shared/env.ts redact()` + `requireEnv` name-only logs; verified in code review |
| Admin operation audit | 🟡 PARTIAL | Admin RPCs exist (`admin_member_profile_rpc`, `admin_bulk_selection…` migrations); full audit trail contract pending |
| PII never logged | 🟡 PARTIAL | v1.8.4 removes request bodies, request URL and raw error objects from the shared client failure log; broader staged/runtime log audit under R-09 remains open |

---

## Remaining gates (operator / CI must run)

1. `bun run lint` locally remains blocked (current-disk: 248 errors, 31 warnings; needs characterization-safe per-file cleanup — R-06).
2. `npx playwright test` with `npx playwright install --with-deps` (E2E smoke exists).
3. Local Supabase: `supabase start` + `supabase db reset` (migration dry-run + RLS persona tests).
4. Edge Function Deno harness execution (foundation in §7).
5. Secret rotations per `docs/SECRETS_ROTATION.md` (operator action in provider consoles).

## Versioning note

Current version: **1.8.0**. Baseline artifacts in this pass are additive docs + a secret-leak fix +
a `typecheck` script/CI wiring change; they ship as release **1.8.0** per the repo's
versioning rules (`CHANGELOG.md` append-only, `versioning/` doc pair).
