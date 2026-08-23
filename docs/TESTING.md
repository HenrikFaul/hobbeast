# Testing guide

Hobbeast ships two test layers. Both are safe to run locally and in CI; neither hits production data.

## 1. Unit / component tests (Vitest + Testing Library)

- Runner: [`vitest`](https://vitest.dev/) with `jsdom` and `@testing-library/jest-dom`.
- Location: co-located `*.test.ts(x)` and `*.spec.ts(x)` files under `src/`.
- Setup file: `src/test/setup.ts` (JSDOM `matchMedia` shim, jest-dom matchers).

Commands:

```bash
npm test            # single run
npm run test:watch  # watch mode
```

Guidelines:

- Prefer testing **pure functions and reducers** first (see `src/lib/__tests__/`).
- Mock the Supabase client with `vi.mock("@/integrations/supabase/client", ...)` — never call the network from a unit test.
- Use `@testing-library/react` for component tests; assert on roles and accessible names, not on class names.

## 2. End-to-end smoke (Playwright)

- Config: `playwright.config.ts` (Lovable base config; localhost dev server).
- Location: `e2e/*.spec.ts`.
- The smoke suite (`e2e/smoke.spec.ts`) verifies the landing page boots without runtime errors. Extend it with one `test()` per critical flow (login, event creation, admin dashboard load).

Commands (require Chromium via Playwright):

```bash
npx playwright install --with-deps chromium
npx playwright test
```

## 3. Database verification harness (disposable cluster)

`bun run db:verify` (`scripts/verify-database.mjs`) is the runtime evidence gate for
migrations, RLS and SQL fixtures. It never touches a hosted project.

What it does:

1. `initdb` a disposable PostgreSQL 18 cluster (127.0.0.1, random free port, temp dir).
2. Bootstrap the Supabase platform roles (`supabase/tests/_local/00_roles.sql`).
3. Register local stub extensions for `pg_net` / `pg_cron` / `supabase_vault` through the
   PostgreSQL 18 `extension_control_path` (`supabase/tests/_local/pgshare/extension/`).
   The stubs record calls/jobs/secrets instead of performing network, scheduling or crypto.
4. `--mode=restore` (default): restore the newest production dump from
   `E:/databasebackup/Hobbeast/backups` (override with `HOBBEAST_DB_DUMP`), then replay every
   repository migration the dump's `supabase_migrations.schema_migrations` ledger has not
   recorded. Migrations older than the ledger head replay leniently and are reported as
   `RECONCILE` (the dump contains their objects without ledger rows).
   `--mode=fresh`: replay the entire chain on an empty database instead.
5. Run every `supabase/tests/*.sql` fixture; each one is self-rolling-back.

Requirements: PostgreSQL 18+ on the machine (`PG_BIN` to override autodetection).
Useful flags: `--keep` (retain the cluster for inspection), `--port=N`.

```bash
bun run db:verify
```

```bash
bun run db:verify -- --mode=fresh
```

A migration or RLS change is **not verified** until this gate passes in restore mode — the
2026-08-23 run proved that source-only review misses live drift (disabled RLS, dashboard-created
policies, contradictory constraints, missing triggers).

## 4. Edge Function characterization harness (Deno, foundation)

The `place-search` (1306 LOC at the v1.8.1 measurement), notification/community rebuild and organizer/admin deep
refactors remain **deferred until an Edge-side characterization harness exists**. This section
is the canonical template for that harness. It is intentionally documentation-first: wiring a
Deno runner (e.g. `deno test` with mock `fetch`) is a CI/operator step, not something that
should be bolted on blindly inside a production release.

### Why it is needed

Frontend unit tests (e.g. `src/lib/__tests__/placeSearch.test.ts`) lock only the *frontend*
normalization contract. They cannot prove the Edge Function's request parsing, provider
fallback, timeout handling, admin guard, or normalized error shape. A refactor of a load-bearing
function without those proofs violates the repo's non-negotiable "never break already working
functionality" rule.

### Required fixture cases (per function)

| Fixture | What it proves |
|---|---|
| Provider success | happy-path normalization and DTO shape |
| Provider failure (non-2xx) | error normalization + status code + no secret echo |
| Provider timeout | abort/timeout handling + graceful degradation |
| Malformed response | parser guard + clear structured error |
| Empty success | empty-array semantics (no `null` leaks) |
| Missing auth token | `requireTargetProjectAdmin` rejects |
| Non-admin token | `requireTargetProjectAdmin` rejects |
| Wrong target project ref | fail-fast, **no URL/key in error message** |
| Missing env secret | `requireEnv` throws `MissingEnvError` with names only |

### The pattern to follow

1. Extract the *pure* decision logic from the edge function into a locally importable module
   (no `Deno.*`, no real network) so a Node/Vitest or Deno test can drive it with fixture inputs.
2. Mock the external network: `globalThis.fetch = () => Promise.resolve(new Response(...))` in
   Deno tests, or `vi.stubGlobal('fetch', ...)` if the extracted module is imported from Vitest.
3. Assert on the **normalized DTO**, never on the raw provider response.
4. Assert the **error contract** (structured error code, no secret echo) for every failure fixture.
5. Keep `requireEnv`, `redact`, `targetProject`, `providerFetch` helper contracts covered —
   they are shared by many functions.

### How to run once wired

```bash
deno test supabase/functions/place-search/__tests__/   # after extracting pure logic + fixtures
```

Until the Deno runner is available in this environment, this remains a **BLOCKED** gate per
`docs/PRODUCTION_READINESS_BASELINE.md` §7 — do not report it as passing.

## Characterization mindset

The Sprint 1.3 suite is intentionally minimal. **Do not delete existing tests to make a refactor pass** — add new tests describing the new behavior, then fix the old ones only if the behavior legitimately changed. Each PR that touches `src/lib/` must ship at least one accompanying test unless the change is a pure rename.
