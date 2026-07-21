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

## Characterization mindset

The Sprint 1.3 suite is intentionally minimal. **Do not delete existing tests to make a refactor pass** — add new tests describing the new behavior, then fix the old ones only if the behavior legitimately changed. Each PR that touches `src/lib/` must ship at least one accompanying test unless the change is a pure rename.
