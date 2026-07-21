# Secret rotation runbook

This runbook applies to every secret listed in [`.env.example`](../.env.example) and the Lovable Cloud / Supabase Edge Function secret store.

## Golden rules

1. **Never** commit a secret value. `.env` and `supabase/.temp/` are already gitignored.
2. **Never** log a secret value. Log only the variable name and, when needed, a redacted fingerprint (`shared/env.ts → redact`).
3. **Never** expose a service-role key or any non-`VITE_` variable to the frontend bundle. If a value is imported into `src/**`, it must be a `VITE_*` publishable value.
4. Rotate on any of: suspected leak, contributor offboarding, provider incident, or on a fixed cadence (90 days for third-party API keys, immediately for signing keys).

## Rotation flow

For each secret:

1. Mint a new value in the provider's dashboard (Geoapify, TomTom, Eventbrite, Ticketmaster, Mapy.cz, Lovable AI, …).
2. Update it in Lovable Cloud (Project Settings → Secrets) or via the `add_secret` / `update_secret` tools.
3. Redeploy the affected Edge Function(s) — Lovable does this automatically on secret change.
4. Smoke test the affected surface (place search, event sync, AI features).
5. Revoke the old value in the provider's dashboard.
6. Log the rotation in `CHANGELOG.md → [Unreleased] → Security` with the secret name only (no value, no fingerprint).

## Frontend keys (`VITE_*`)

Publishable / anon keys are safe in the browser bundle by design. Rotate only when the Supabase project itself is rotated. When rotated, update `.env` locally and Lovable Cloud environment variables, then rebuild.

## Server-only keys

The following must never appear in `src/**`, `index.html`, or any Vite-bundled file:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`
- `EVENTBRITE_API_KEY`, `TICKETMASTER_API_KEY`
- `GEOAPIFY_API_KEY`, `TOMTOM_API_KEY`, `MAPY_CZ_API_KEY`
- `LOVABLE_API_KEY`

If any leak into the frontend bundle, treat it as a P0 incident: rotate immediately, then audit the offending import.

## Verification after rotation

- `npm run build` — bundle must not contain any rotated string. Grep the `dist/` output for the old value fingerprint.
- Manually invoke the affected Edge Function via the admin UI or `supabase--curl_edge_functions`.
- Confirm the corresponding provider dashboard shows traffic on the new key.
