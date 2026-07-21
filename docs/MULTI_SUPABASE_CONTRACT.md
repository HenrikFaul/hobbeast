# Multi-Supabase project contract

Hobbeast talks to **more than one** Supabase project. This is fragile —
misrouting one layer produces silent data loss or auth loops. This doc is
the single source of truth for which project each layer must point to.

## Projects

| Role                 | Project ref              | What lives there                                                     |
| -------------------- | ------------------------ | -------------------------------------------------------------------- |
| **Lovable Cloud**    | `olzvughcoqnfkdpvbwjy`   | The project Lovable's tooling owns. Used ONLY by Lovable's internal tools (`supabase--read_query`, migration approvals surface here). |
| **Target (dsym)**    | `dsymdijzydaehntlmfzl`   | The **real** app database. Frontend, Edge Functions, auth, storage all point here. This is the production data. |
| **Geodata (opt.)**   | project-mapper managed   | External geodata catalog cache. Accessed only from `sync-local-places` and address-manager Edge Functions via secrets, never from the browser. |

## Frontend contract (`.env`, Vite build-time)

- `VITE_SUPABASE_URL` → `https://dsymdijzydaehntlmfzl.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` → dsym anon key
- `VITE_SUPABASE_PROJECT_ID` → `dsymdijzydaehntlmfzl`

`src/integrations/supabase/client.ts` is auto-generated; never hand-edit.
The Vite plugin in `vite.config.ts` overrides the values at build time to
guarantee dsym, even if the auto-generated file drifts.

## Edge Functions contract

Every function uses `resolveInternalSupabaseUrl(req)` +
`getSupabaseAdmin(req)` (see `supabase/functions/shared/providerFetch.ts`).
These helpers:

1. Prefer the request origin when it ends in `.supabase.co` (the platform
   already routes to the correct project).
2. Fall back to the `SUPABASE_URL` secret, which points to dsym.
3. Read `SUPABASE_SERVICE_ROLE_KEY` (dsym) for the admin client.

**Never** hard-code a project URL inside a function body. Never call the
Lovable Cloud project from Edge Function code.

## Supabase CLI

`supabase/config.toml`'s `project_id` must be `dsymdijzydaehntlmfzl`. Same
for `supabase/.temp/project-ref`. If either drifts, `supabase link` /
`supabase functions deploy` will happily push to the wrong project.

## How to query each project

- **dsym (target, prod data):** REST via `curl` with
  `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`. See
  `.lovable/memory/architecture/dsym-db-access.md`. The Lovable
  `supabase--read_query` tool does **not** work against dsym — it queries
  the Lovable Cloud project only.
- **Lovable Cloud:** use `supabase--read_query`. Only meaningful for
  Lovable-owned rows (rare).

## Failure modes to watch for

- Frontend showing empty tables in prod = `VITE_SUPABASE_URL` pointing at
  the Lovable Cloud project.
- Edge Function 500s about missing tables = function was deployed to the
  Lovable Cloud project ref by a drifted `config.toml`.
- Auth loop after Google sign-in = OAuth redirect origin doesn't match the
  origin the app was served from (see `src/pages/Auth.tsx`, uses
  `window.location.origin` since v1.7.4).

## Next step (deferred)

A single `supabase-projects.ts` module that exports typed identifiers for
each project + a runtime assertion that the frontend client is talking to
dsym. Tracked in `docs/SPRINT_STATUS.md` under Sprint 1.1 (v2 plan).
