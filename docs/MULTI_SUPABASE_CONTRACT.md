# Multi-Supabase project contract

Hobbeast talks to **more than one** Supabase project. This is fragile —
misrouting one layer produces silent data loss or auth loops. This doc is
the single source of truth for which project each layer must point to.

## Projects

| Role                 | Project ref              | What lives there                                                     |
| -------------------- | ------------------------ | -------------------------------------------------------------------- |
| **Lovable Cloud**    | `olzvughcoqnfkdpvbwjy`   | The project Lovable's tooling owns. Used ONLY by Lovable's internal tools (`supabase--read_query`, migration approvals surface here). |
| **Target (current)** | `bqdvqmpwccsxumzijspj`   | The **real** app database. Frontend, Edge Functions, auth, storage all point here. This is the production data. |
| **Geodata (opt.)**   | project-mapper managed   | External geodata catalog cache. Accessed only from `sync-local-places` and address-manager Edge Functions via secrets, never from the browser. |

## Frontend contract (`.env`, Vite build-time)

- `VITE_SUPABASE_URL` → `https://bqdvqmpwccsxumzijspj.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` → current target publishable/anon key
- `VITE_SUPABASE_PROJECT_ID` → `bqdvqmpwccsxumzijspj`

`src/integrations/supabase/client.ts` is auto-generated; never hand-edit.
The Vite plugin in `vite.config.ts` reads the browser-facing `VITE_*` pair only
and, from the v1.8.4 candidate onward, **fails a production build closed** unless
both the URL ref and `VITE_SUPABASE_PROJECT_ID` are `bqdvqmpwccsxumzijspj` and
the URL/key are present. It does not silently replace a wrong frontend pair with
server-scoped `SUPABASE_*` values.

## Edge Functions contract

Every function uses `resolveInternalSupabaseUrl(req)` +
`getSupabaseAdmin(req)` (see `supabase/functions/shared/providerFetch.ts`).
These helpers:

1. Prefer the request origin when it ends in `.supabase.co` (the platform
   already routes to the correct project).
2. Fall back to the `SUPABASE_URL` secret, which points to the current target.
3. Read `SUPABASE_SERVICE_ROLE_KEY` for the current target admin client.

**Never** hard-code a project URL inside a function body. Never call the
Lovable Cloud project from Edge Function code.

## Supabase CLI

`supabase/config.toml`'s `project_id` must be `bqdvqmpwccsxumzijspj`. Same
for `supabase/.temp/project-ref`. If either drifts, `supabase link` /
`supabase functions deploy` will happily push to the wrong project.

## How to query each project

- **Current target (production data):** use the current project through the reviewed CLI,
  Edge or operator path. Historical `dsym` access notes are no longer authoritative. The
  previous projects were deleted during the v1.9.1 recovery. Do not reuse legacy REST
  instructions or credentials from `.lovable/memory/architecture/dsym-db-access.md`.
  The target of any operator or Lovable query tool must be verified before use.
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

## Rotation contract

The typed project identifiers and frontend/Edge runtime assertions now live in
`src/lib/supabaseProjects.ts`, `src/integrations/supabase/client.ts` and
`supabase/functions/shared/projectContract.ts`. Any future project rotation must update these,
CI, `vite.config.ts`, `supabase/config.toml`, the linked CLI state and this contract together.
