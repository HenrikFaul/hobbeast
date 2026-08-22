# ADR 0001 — Expand-contract domain boundaries

- **Status:** accepted
- **Decision date:** 2026-08-22
- **Review point:** after the production prompt-pack migration has run in staging and the critical Playwright journey is green

## Problem

Several route components and Edge functions are load-bearing and historically mixed UI state,
provider DTOs, direct PostgREST calls and mutations. A wholesale move would risk event, admin,
organizer, place and notification regressions.

## Alternatives considered

1. Rewrite each domain into a new framework: rejected because rollback and contract equivalence
   could not be proven in one release.
2. Keep all calls in route components: rejected because authorization, idempotency and query
   invalidation ownership would remain ambiguous.
3. Add characterized feature facades and server mutation boundaries while keeping legacy modules
   as compatibility implementations: selected.

## Decision

- `src/features/<domain>` owns public contracts and query keys.
- Browser mutations that require authorization or atomicity cross an RPC or Edge boundary.
- Existing routes, parameters and legacy exports remain available during this pack.
- Database evolution is append-only. New columns/tables/functions land before any future consumer
  deprecation.
- Provider-specific DTOs are normalized before core-domain or consumer use.
- Double-submit safety is expressed as an idempotency key, unique dedupe constraint or stable
  deterministic command identifier.

## Security and privacy consequences

The boundary reduces raw table and provider-payload exposure, but it does not make browser-side
role checks authoritative. RLS, SECURITY DEFINER authorization and Edge guards remain mandatory.
Public profiles use an allowlisted view, social reads enforce block boundaries, and exact/private
location data is excluded from the public DTO.

## Rollback

Feature flags can disable the new product surfaces. UI imports can return to the compatibility
`src/lib` exports without dropping schema. Append-only migrations are retained; new write paths
can be revoked while old reads remain intact. No down migration drops user data.

## Evidence

- Feature query-key and community command tests.
- Existing place/event/organizer/notification characterization suites.
- SQL authorization and domain-flow tests in `supabase/tests`.
- Requirement coverage and release evidence documents generated with this release.
