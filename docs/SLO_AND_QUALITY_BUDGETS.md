# SLO, performance and quality budgets

The values below are **proposed launch objectives**, not claims about production performance. Every objective remains `NOT_MEASURED` until its named measurement source is live on a production-like staging environment and then production.

## Product-critical SLO proposal

| Journey/service | SLI source | Proposed objective | Error budget | Alert/owner route | Current status |
|---|---|---:|---:|---|---|
| Landing availability | synthetic HTTPS probe + client boot marker | 99.9% / 30d | ~43m/month | Product platform on-call | NOT_MEASURED |
| Discovery usable load | RUM LCP + API trace | p75 LCP <= 2.5s, API p95 <= 800ms | 5% slow requests | Discovery owner | NOT_MEASURED |
| Event detail usable load | RUM + route error boundary | 99.5% successful, p95 API <= 700ms | 0.5% failed | Event lifecycle owner | NOT_MEASURED |
| Authentication | Supabase Auth metrics + client outcome | 99.5% successful excluding invalid credentials | 0.5% failed | Identity owner | NOT_MEASURED |
| RSVP/join mutation | RPC/Edge trace + audit outcome | 99.9% non-duplicate success, p95 <= 800ms | 0.1% failed | Event lifecycle owner | NOT_MEASURED |
| Waitlist promotion | DB audit timestamps | p95 <= 60s after eligible cancellation | 5% late | Event lifecycle owner | NOT_MEASURED |
| Organizer publish | Edge/RPC result + event audit | 99.5% successful, p95 <= 1.5s | 0.5% failed | Organizer Ops | NOT_MEASURED |
| Admin moderation action | `safety_audit_log` + correlation ID | 99.9% atomic/audited | 0.1% failed | Trust & Safety on-call | SOURCE_READY / NOT_MEASURED |
| Provider sync freshness | sync-run ledger | 95% inside provider-specific freshness window | 5% stale | Provider Ops | NOT_MEASURED |
| Notification dispatch | notification ledger timestamps | p95 <= 5m for ordinary; safety separate | 5% late | Communications owner | NOT_MEASURED |

## Correlation and logging contract

- New trust/safety and analytics Edge functions accept/return `X-Correlation-ID`.
- IDs are bounded to 8–96 safe characters; invalid input is replaced.
- Structured logs include event, level, timestamp, release version, active flag context and redacted metadata.
- Information-level log sampling is controlled by `EDGE_INFO_LOG_SAMPLE_RATE`; warnings, errors and audited safety mutations are not sampled away.
- `observeEdgeOperation` records bounded database-operation duration and outcome without logging SQL text, request payloads or result rows.
- Authorization, cookie, token, secret, e-mail, phone, address, coordinate and free-text fields are redacted.
- Safety DB audit receives the same correlation ID for lifecycle/enforcement actions.
- Existing Edge functions not yet migrated to this helper remain `PARTIAL`; no repository-wide observability completion is claimed.

## Route and asset budgets

Machine-readable source: `scripts/performance-budgets.json`. Gate: `node scripts/check-performance-budget.mjs` after a clean build.

| Surface | Raw ceiling | Gzip ceiling |
|---|---:|---:|
| landing/main JS | 160 KiB | 50 KiB |
| global CSS | 100 KiB | 20 KiB |
| Events route | 120 KiB | 40 KiB |
| EventDetail route | 80 KiB | 30 KiB |
| Admin route | 220 KiB | 70 KiB |
| Organizer route | 120 KiB | 40 KiB |
| any individual image | 250 KiB | 250 KiB |
| any individual JS chunk | 900 KiB | 300 KiB |

Web-vital launch targets: LCP <= 2.5s at p75, INP <= 200ms at p75, CLS <= 0.1 at p75. These require real RUM or a controlled production-like lab run; bundle size alone is not web-vital proof.

## Accessibility gate

Target is WCAG 2.2 AA. Automated checks do not replace manual review.

- Keyboard paths: auth, search/filter, RSVP/cancel, report/block, organizer safety save/publish, moderation transition/enforcement.
- Screen-reader spot-check: Dialog and AlertDialog focus, toast announcements, form errors, queue changes, map alternative list and chart textual summary.
- 360px mobile, 200% zoom, reduced motion and contrast checks.
- Current source adds labelled native buttons, bounded labelled fields, `role=status`/`aria-live` loading and explicit confirm steps for safety surfaces.
- Manual screen-reader, browser axe and production-like Playwright proof are `NOT_RUN` in this source-only round.

## Retry/dead-letter boundary

The new APIs expose normalized failures and idempotency. No offline queue is enabled for safety reports or enforcement: silently replaying sensitive mutations is unsafe. Cron/queue/webhook DLQ dashboards and replay permissions remain launch blockers until their owning workflows are deployed and exercised.
