# Historical secret exposure register

> **Purpose:** tracks *known* historical secret exposures and their rotation status.
> **Hard rule:** this file contains **provider names and status only** — never secret values,
> keys, tokens, URLs with credentials, or even fingerprints. If you need the rotation runbook,
> see [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).

| Provider | Surface / component | Exposure history | Rotation status | Action owner |
|---|---|---|---|---|
| Repository environment configuration | Historical `.env` file | Current-disk verification proved that `.env` had been tracked despite the ignore rule. Values are intentionally not reproduced or fingerprinted here. | **Current tracking closed in v1.9.7** — the local file is preserved but no longer tracked; `.env.*` is ignored except the blank example. Historical blobs remain subject to the provider statuses below. | Security owner |
| Mapy.cz | `src/lib/mapy.ts` routing + trip planner | Hardcoded API key fallback was committed in the repo and later removed in v1.7.4 | **Action required** — rotate the previous key in the Mapy.cz console; set `VITE_MAPY_API_KEY` | Operator |
| Geoapify | Place search / `sync-local-places` Edge Functions | No committed value found in current tracked source; historically listed as env-only | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence (90 days) | Operator |
| TomTom | Place search / `sync-local-places` Edge Functions | No committed value found in current tracked source; historically listed as env-only | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence (90 days) | Operator |
| Eventbrite | External event import Edge Function | No committed value found in current tracked source; historically listed as env-only | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence (90 days) | Operator |
| Ticketmaster | External event import Edge Function | No committed value found in current tracked source; historically listed as env-only | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence (90 days) | Operator |
| SeatGeek | External event import Edge Function | No committed value found in current tracked source; historically listed as env-only | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence (90 days) | Operator |
| Supabase (target + external/geodata) | Frontend `VITE_*`, Edge Function service-role keys | A historical GeoData service-role value was found during the v1.9.7 incident pass; frontend `VITE_*` values are publishable by design. | **Rotated / rejected** — the historical server credential returns unauthorized, the deployed integration now uses the current server-side secret key, and GitHub Actions uses the current Hobbeast publishable key. | Security owner |
| Lovable AI Gateway | `LOVABLE_API_KEY` Edge Function secret | No committed value found in current tracked source | **Standing rotation** — rotate per `SECRETS_ROTATION.md` cadence | Operator |

## Scan evidence

- **Date:** 2026-08-20 (first production-baseline pass)
- **Method:** `git grep` over the full tracked tree, excluding `*.lock` files, for the following
  credential patterns: Stripe (`sk_`/`pk_live_`), Google API (`AIza…`), GitHub token (`ghp_`),
  Slack token (`xox[baprs]-`), private key PEM headers, AWS access key (`AKIA…`), and JWT
  (signed-header prefix). BASEREQUIREMENTS text files were scanned with the same patterns.
- **Result:** **0 hits** in current tracked source. Control check confirmed the scan was live
  (a deliberately-searched term returned 15 file hits).
- **Meaning:** at the time of this scan no committed credential *value* was found in source.
  The Mapy.cz entry above is retained as a historical known exposure (key was removed in a
  prior release) and still requires operator-side rotation of the old value.

### Current-disk correction — 2026-08-22

The earlier pattern scan was insufficient evidence for `.env` hygiene. A path-level Git check
(`git ls-files --stage -- .env`) proves the file is tracked, while `.gitignore` also lists it.
The repository must therefore be treated as potentially exposed until the operator completes
rotation and approved tracking/history remediation. This correction records no values.

### Incident closure update — 2026-08-24 (v1.9.7)

- `.env` was removed from Git tracking while the operator's local file was preserved byte-for-byte.
- The historical GeoData service-role credential was tested against its own project and rejected;
  the currently deployed Hobbeast Edge integration was switched to the current server-side key.
- The current GitHub Actions publishable key and CI project target were synchronized with the live
  Hobbeast project.
- History was not rewritten. Mapy and AWS browser-key origin/service restrictions remain a
  provider-console hardening item because these values are public client configuration and their
  provider accounts are not authenticated in the current automation environment.
