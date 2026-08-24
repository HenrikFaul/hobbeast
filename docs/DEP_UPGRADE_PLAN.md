# Dependency upgrade plan

Repository is on React 18.3, Vite 5.4, Tailwind 3.4, React Router 6.30,
Zod 3.25, date-fns 3.6, framer-motion 12.35. Several are one major behind.
This doc sequences the upgrades so the app never spends a day broken.

## Rule

**One major per PR.** Ship, verify prod, then start the next one. Do NOT
combine React 19 + Vite 6 + Router 7 into a single change — the failure
surface is untriage-able.

## Order (safest first)

### 1. Zod 3 → 4 (LOW risk)
- Breaking: `.parse()` throws `ZodError` with reshaped `.issues`.
- Touch points: `src/lib/env.ts`, `src/lib/tripPlanningSchema.ts`,
  every Edge Function that Zod-validates a request body.
- Verify: `bun run test` (env + placeSearch suites cover this).

### 2. date-fns 3 → 4 (LOW risk)
- Breaking: `format` locale import path changed.
- Touch points: any `format(...)` call with `hu` locale.
- Verify: manual event card date rendering.

### 3. React Router 6 → 7 (MEDIUM risk)
- Breaking: `<Routes>` still works; `useNavigate` still works. Loaders/data
  APIs shift, but we don't use them.
- Touch points: `src/App.tsx`.
- Verify: click every top-level route, verify lazy chunks still load.

### 4. Tailwind 3 → 4 (MEDIUM risk)
- Breaking: config file format, `@apply` behavior in scoped styles,
  `oklch` color functions, plugin API.
- Touch points: `tailwind.config.ts`, `src/index.css` (heavy —
  design-system tokens live here).
- Verify: full visual pass on hero, admin, organizer, event detail,
  profile.

### 5. Vite 5 → 6 (COMPLETED in v1.9.7)
- Breaking: default `target: 'baseline-widely-available'`, `optimizeDeps`
  changes, Rollup 4.
- Touch points: `vite.config.ts` (manualChunks strategy).
- Verify: dev server starts, `bun run build` succeeds, bundle sizes stay
  within +10% of current 136 KB entry.
- Result: upgraded to Vite 6.4.3 to close a high-severity Windows path advisory;
  typecheck, 323 unit tests, production build, performance budget and Playwright smoke
  all passed without changing the existing manual chunk strategy.

### 6. React 18 → 19 (HIGH risk)
- Breaking: `useEffect` cleanup timing, `forwardRef` semi-deprecated,
  `use()` hook, stricter Suspense.
- Touch points: every `forwardRef`, every `useEffect` chain in
  `useNotifications`, `useAuth`, `useOrganizerMode`.
- Verify: full manual regression pass; keep the previous build published
  as fallback for at least 24h.

### 7. framer-motion 12 → next (LOW–MEDIUM)
- Only bump if a security advisory lands; otherwise stay pinned.

## Verification gate

After every upgrade PR, before merging:

1. `bunx tsc --noEmit` clean.
2. `bun run test` green.
3. `bun run build` succeeds; entry chunk ≤ 150 KB gzipped.
4. Manual: sign in with Google on published preview, open admin, create
   an event, RSVP.
5. Update `CHANGELOG.md` **and** `docs/SPRINT_STATUS.md`.

## Rollback

Each upgrade PR ships a matching revert commit as a draft — merge the
revert if any of the verification steps fails in prod within 24h.
