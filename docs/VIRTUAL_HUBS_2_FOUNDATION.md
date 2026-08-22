# Virtual Hubs 2.0 foundation — v1.8.4 candidate

> **Scope status:** PARTIAL / RELEASE HOLD. This is the first safe Prompt 05 increment, not
> full Virtual Hubs 2.0 closure. No migration, production deployment, scheduler mutation, or
> secret operation was performed.

## Current-state and impact map

| Surface | Current behavior | v1.8.4 candidate impact |
|---|---|---|
| `virtual_hubs` / `virtual_hub_members` | Legacy category/subcategory/activity × city columns; nullable composite unique key; stored total `member_count` | Deterministic four-segment identity contract exists in pure code; runtime schema remains unchanged |
| `refresh_virtual_hubs()` | `SECURITY DEFINER`; deletes every membership, has no job lock, and nullable conflict columns can permit duplicate hubs | Edge action returns 409 and the admin control is disabled. Direct RPC grants remain an unresolved DB blocker |
| `virtual-hubs-admin` | `verify_jwt=false`, service-role client, previously no in-function admin authorization | Every non-OPTIONS request now passes `requireAdminUser` before service-role data access; 401/403 are normalized |
| Hub edit | UI promised recalculation, but the function only recounted stale rows | Preserves metadata-only behavior and count refresh. It does not delete/add memberships from a potentially truncated snapshot; the pure diff planner remains migration input only |
| Admin hub list/detail | Only legacy total count; generated demand indistinguishable | Real, generated, unknown-origin, and total counts are separate; missing `user_origin` is visible rather than guessed |
| `generate-hub-events` | Qualified on legacy `member_count`, so generated users could create false production demand | Preview qualifies only explicit real users with a named city; generated/unknown members are excluded; missing discriminator and all event writes fail closed with HTTP 409 |
| Scheduler authorization | Client-controlled `_cron=true` bypassed admin auth while the gateway had `verify_jwt=false` | Bypass removed; every action requires a verified admin. Automated scheduling stays HOLD until a signed, replay-safe server contract exists |
| Admin auto-event config/preview | Browser could write config directly and reimplemented qualification using legacy totals | Uses an allowlisted authenticated Edge contract; scheduler activation and event writes are disabled |

## Solution comparison

### Option A — full DB-native reconciliation in this release

Add canonical identity columns/indexes, duplicate backfill, profile-change triggers, a
transactional reconcile RPC, advisory/job lock, scheduler state and durable audit tables.
This is the target architecture, but it is not safe to claim today: the live schema is not
available for a dry-run, the existing nullable-key duplicates are unknown, RLS persona tests
cannot run locally, and SECURITY DEFINER changes require an approved migration boundary.

### Option B — guarded, testable runtime foundation (selected)

Preserve the schema and read routes, close the anonymous service-role path, centralize pure
identity, demand and scoped-diff rules, exclude simulated demand, and make schema drift and unsafe
writes fail closed. This has the smaller rollback surface and establishes contracts for the later
transactional migration without applying a truncated client/Edge snapshot to membership state.

## Locked invariants

- A hub identity normalizes Unicode, case and whitespace and includes category, subcategory,
  activity and city buckets.
- Missing city means `no city data`; it is not silently marketed as a nationwide community.
- Production demand counts only explicit real users.
- Generated and unknown-origin memberships remain visible to admins but do not qualify AI demand.
- Duplicate membership input is counted once.
- A scoped hub reconciliation is idempotent once desired membership is present.
- Virtual hubs remain system segmentation, not public chatrooms or user-facing circles.

## Requirement coverage matrix

| Requirement | Evidence | Test / gate | Risk / rollback | Status |
|---|---|---|---|---|
| Audit legacy hub stack | Migration, admin UI, both Edge Functions and AI config inspected; impact map above | Static inspection | Documentation-only rollback | PASS |
| Deterministic identity | `shared/virtualHubEngine.ts` `buildVirtualHubIdentityKey` | Unicode/case/city/activity unit cases | Remove helper until DB migration adopts it | PARTIAL — not DB-enforced |
| Incremental membership | `planVirtualHubMembershipReconciliation` is a pure, scoped plan; hub edit does not apply it from an unbounded/truncated snapshot | Add/keep/remove + idempotency unit cases | Helper is additive; runtime remains legacy metadata-only | PARTIAL — intentionally inert pending transaction/pagination |
| Real vs simulated demand | Shared count classifier; admin count columns; AI uses `real_member_count` only | Dedup/origin/qualification unit cases | Revert candidate; AI remains disabled if origin cannot be proven | PASS in code; live schema BLOCKED |
| Explainable qualification | Edge preview returns real/simulated/unknown counts and reasons | Pure helper tests | Response fields are additive | PARTIAL — recent activity/saturation not yet scored |
| System hub vs circle privacy | No public hub route/chat was added; admin-only Edge guard | Authorization code review; Deno runtime test unavailable | Revert function imports/guard | PASS in source; runtime NOT VERIFIED |
| Admin least privilege | `virtual-hubs-admin` calls `requireAdminUser` before service-role operations | Static review; Deno unavailable | Revert function; do not deploy old anonymous path | PASS in source; runtime NOT VERIFIED |
| Scheduler, event writes, retry, lock, metrics | UI and Edge generation write path are disabled; preview remains available | Static 409 contract; no live scheduler/DB evidence | Revert candidate; writes remain off | BLOCKED |
| Duplicate hub prevention | Pure key contract only | Unit identity cases | N/A | BLOCKED on migration R-13 |
| Legacy refresh containment | Edge action returns `HUB_REFRESH_MIGRATION_REQUIRED`; admin button is disabled | Static source review; direct DB grant not live-tested | Revert source candidate only | PARTIAL — direct RPC remains P0/P1 DB blocker |
| Premium activation/community lifecycle | No user-facing hub/circle activation surface added | N/A | N/A | DEFERRED |

## Security and privacy notes

- No new public table, policy, grant or SECURITY DEFINER definition is shipped here.
- The Edge Function remains configured with gateway `verify_jwt=false` for compatibility, so
  in-function `requireAdminUser` is the security boundary and must never be removed.
- The former body-controlled cron bypass was removed. No automated caller is trusted until it
  uses a server-held signature, timestamp/replay validation and a durable job lock.
- The legacy direct `refresh_virtual_hubs()` RPC is not made safe by the Edge guard. Its public/
  authenticated execution grants must be revoked in an approved migration before release.
- AI event writes are disabled even for admins until durable idempotency, duplicate prevention
  and job locking are deployed. Config writes accept only bounded allowlisted fields and force
  scheduling disabled.
- Hub detail returns only the existing admin-required member fields. No public aggregate API was
  added in this increment.
- The tracked `.env` finding is an independent P0 release blocker (R-00); no value was copied.

## Remaining migration boundary

The next DB-authorized Prompt 05 slice needs one append-only migration with:

1. duplicate-safe canonical identity backfill and unique enforcement;
2. transactional per-profile and full-recovery reconciliation;
3. explicit admin authorization, grants/revokes and fixed `search_path`;
4. advisory or durable job lock, retry state and audit metadata;
5. derived count consistency and real/simulated/unknown columns or a verified view;
6. anonymous/user A/user B/admin/service-role RLS persona tests;
7. explicit rollback SQL/strategy.

## Current verification evidence — 2026-08-22

| Gate | Result |
|---|---|
| Unit tests | PASS — 12 files, 89/89 tests |
| Typecheck | PASS |
| Prompt 05 focused ESLint | PASS — 0 errors, 0 warnings |
| Development bundle | PASS — 3097 modules transformed |
| Production bundle | HOLD on current env — fail-closed on non-canonical `VITE_*`; a non-secret canonical-env contract canary separately compiled 3097 modules (not deployable evidence) |
| Release validator | HOLD — expected fail-closed because `.env` is tracked |
| Full repository lint | FAIL — 248 errors, 31 warnings in wider debt |
| Deno/Edge, local DB/RLS, Playwright, live deploy | NOT_RUN / NOT VERIFIED |

## Rollback

Revert the v1.8.4 source/UI changes as one package. There is no DB rollback because no migration
was created or applied. Keep AI generation disabled if real-vs-simulated origin cannot be proven.
