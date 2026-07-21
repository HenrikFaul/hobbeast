# Hobbeast – Minden ami élmény

Hobbeast is a community-first platform where people meet around **shared real-world experiences** — hiking, tennis, group dog walks, concerts, board games, meetups. Users discover events by hobby and city, join or organize them, and the platform automatically groups people into **virtual hubs** based on interests and location.

- Preview: <https://id-preview--bc7f13b3-b1aa-49df-95d6-45b6a5bb7919.lovable.app>
- Published: <https://hobbeast.lovable.app>
- Custom domains: <https://www.expericentre.com>, <https://expericentre.com>

---

## Table of contents

1. [Product overview](#product-overview)
2. [Architecture](#architecture)
3. [Local setup](#local-setup)
4. [Environment variables](#environment-variables)
5. [Testing](#testing)
6. [Deployment](#deployment)
7. [Versioning & release process](#versioning--release-process)
8. [Troubleshooting](#troubleshooting)

---

## Product overview

Core surfaces:

- **Event discovery** — filterable feed of Hobbeast-native and imported external events (Eventbrite, Ticketmaster, SeatGeek).
- **Event detail & participation** — RSVP, waitlist, auto-promotion, organizer messaging, notifications.
- **Event creation** — organizers create events with rich location autocomplete, category taxonomy, templates, capacity, waitlist, hike planner (mapy.cz) for outdoor categories.
- **Profile & preferences** — favorite categories drive personalized notifications and hub membership.
- **Virtual hubs** — invisible communities auto-formed per hobby × city; members receive event alerts.
- **Organizer dashboard** — analytics, participants, messaging, templates.
- **Admin console** — user management with bulk actions and filters, hubs administration, external event sync configuration, local places (Geoapify / TomTom) address sync.

Brand voice: Hungarian first, community-forward, energetic, supportive. Not a music app, not a generic event aggregator.

## Architecture

- **Frontend**: React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3 + shadcn/ui.
- **State/data**: TanStack Query, React Router 6, Zod, react-hook-form.
- **Maps**: Leaflet + mapy.cz embedded planner.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions on Deno).
  - Canonical project ref: `dsymdijzydaehntlmfzl`.
  - RLS enforced on every public-schema table; roles stored in `user_roles` and checked via the `has_role(_user_id, _role)` security-definer function.
- **External providers**: Eventbrite, Ticketmaster, SeatGeek (event ingest); Geoapify, TomTom, Mapy.cz (places/geo).
- **AI**: Lovable AI Gateway (`LOVABLE_API_KEY`).

Client entrypoint:

```ts
import { supabase } from "@/integrations/supabase/client";
```

## Local setup

Requirements: Node 20+, npm or bun.

```bash
npm install
cp .env.example .env   # fill in the variables listed below
npm run dev
```

The dev server listens on <http://localhost:8080>.

## Environment variables

Values are **not** stored in this repo. Copy `.env.example` and populate locally; production values live in Lovable Cloud and Supabase Edge Function secrets.

Frontend (Vite, prefixed with `VITE_`):

- `VITE_SUPABASE_URL` — Hobbeast Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable/anon key.
- `VITE_SUPABASE_PROJECT_ID` — project ref.

Edge Function secrets (server-only, never bundled to the client):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- `EXTERNAL_SUPABASE_URL`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`
- `EVENTBRITE_API_KEY`, `TICKETMASTER_API_KEY`
- `GEOAPIFY_API_KEY`, `TOMTOM_API_KEY`, `MAPY_CZ_API_KEY`
- `LOVABLE_API_KEY`

Never commit `.env` or `supabase/.temp`. Never log secret values.

## Testing

```bash
npm test           # vitest unit + component tests
npm run test:watch # watch mode
```

Playwright E2E (added in Sprint 1.3):

```bash
npx playwright install --with-deps  # first time
npx playwright test
```

## Deployment

Push to `main` deploys via Lovable to the preview URL. Publish from the Lovable UI to promote to the published/custom-domain URLs. Edge Functions deploy automatically with the project.

## Versioning & release process

- Semantic versioning (`MAJOR.MINOR.PATCH`). Current: **1.7.5**.
- Single source of truth: `CHANGELOG.md` (Keep a Changelog format).
- Historical append snippets and upload READMEs are archived under `docs/releases/`.
- Full release protocol: [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md).
- CI-safe check:

  ```bash
  npm run release:validate
  ```

  Fails when `package.json` version and the latest `CHANGELOG.md` version disagree.

## Troubleshooting

- **Google OAuth in Lovable preview fails** — iframe restrictions. Test auth on the published site.
- **Admin queries fail on missing columns** — the target DB does not have `outcome_status`, `registrations_count`, `cancellations_count`, `attended_count`, `average_rating`, `user_origin`, `is_active` on `events`; admin queries must omit them.
- **Edge Function config errors** — always use `resolveInternalSupabaseUrl` + `getSupabaseAdmin` helpers.
- More: <https://docs.lovable.dev/tips-tricks/troubleshooting>.
