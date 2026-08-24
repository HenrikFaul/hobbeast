# Hungarian event-feed ingestion

## Purpose and delivery boundary

The event-feed pipeline expands Hobbeast's existing event supply without replacing native
events, Eventbrite, Ticketmaster or SeatGeek. It accepts RSS 2.0, RSS 1.0/RDF, Atom, ICS,
Schema.org Event JSON-LD and bounded HTML discovery, then maps usable items into the existing
external-event model and hobby taxonomy.

The V4 workbook is a candidate inventory, not an approval record. Its 185 rows are seeded as
`pending_review`, `legal_review_status = pending`, `robots_allowed = NULL` and `enabled = false`.
Only 67 rows currently contain a strict credential-free HTTPS URL that can be probed after an
operator confirms the exact host; the other 118 remain URL-review HOLD. Seed generation never
changes these safety states.

## Pipeline

1. `supabase/seeds/hungarian_event_feed_sources_v4.json` is the deterministic, reviewable
   snapshot of non-empty workbook cells.
2. `bun run event-feeds:seed` generates the data-only seed migration. The generator refuses a
   source-count or strict-HTTPS-count drift.
3. The admin **Feedek** tab lists the complete registry with server-side publisher search and
   pagination, plus health and run counters. A probe may fetch only a pre-registered exact
   HTTPS/FQDN host and can write only quarantine/audit data.
4. Approval requires all of the following in one audited RPC: exact host, approved legal
   review, explicit robots evidence, poll interval, minimum quality, reason, request ID and
   idempotency key. Enabling is separate and remains guarded in the database.
5. A scheduled worker claims only due, enabled and fully approved sources with a lease. Every
   fetch performs a fresh, SSRF-safe `/robots.txt` decision before the event endpoint request.
6. The fetcher revalidates DNS on every redirect hop, rejects private/non-global addresses,
   aborts resolver work when the request deadline expires, then uses Deno's TLS transport to
   connect directly to the validated address. It checks the connected peer address and performs
   certificate/SNI verification against the original FQDN, closing the DNS-check / connect race
   without re-resolving through the transport. Cross-host redirects, credentials, non-HTTPS URLs
   and non-443 ports are rejected; header, time, item, string and 2 MiB decoded-response limits
   are enforced. Chunked HTTP framing is additionally capped at 4,096 chunks and 256 KiB of
   framing bytes.
7. Raw responses are service-only quarantine evidence with SHA-256 identity, per-run observation
   records and a renewable 14-day TTL. Bounded retention runs from the dispatcher and remains
   callable explicitly. Parsed items receive category mapping, quality reasons and deduplication
   before a database transaction can publish them into `external_events`.
8. Parser warnings, missing event dates, invalid URLs, low quality and every probe result stay
   quarantined. Cancelled upstream occurrences deactivate the corresponding published item.
   A disappeared item is retired only after three successful, parser-proven complete snapshots.
   RSS/Atom, ICS and explicit Schema.org collection/graph contracts each prove completeness using
   their own structure; a standalone Event, generic/empty JSON, soft-error envelope, HTML
   discovery or capped parse never counts as complete.
9. A normal 304 revalidates only already-published, active and still-eligible feed events. A probe
   304 can never refresh public visibility or source validators. Conditional validators belong
   only to the exact canonical structured endpoint: redirects and HTML-discovered feeds fetch
   unconditionally and clear stale validator state, while a mismatched 304 fails closed.

## Supported input contracts

- RSS 2.0, RSS 1.0/RDF and Atom with an explicit event date. Article publication dates are never
  treated as event start dates. Date-only values remain all-day dates with no manufactured clock
  time; timezone-less date-times require the audited `timezone` stored on the source or stay
  quarantined. All seeded Hungarian candidates carry `Europe/Budapest` as auditable parsing
  context without changing their pending/disabled approval state.
- ICS with UID, `RECURRENCE-ID`, cancellation, all-day values and timezone handling. Floating
  timestamps without an audited calendar/source timezone are quarantined instead of shifted.
- Schema.org `Event` and Event subclasses, including recognized `@graph`/collection documents.
  Generic JSON, empty arrays and soft-error envelopes are never complete snapshot evidence.
- HTML containing JSON-LD or same-host RSS/Atom discovery links. Arbitrary selectors and
  caller-supplied URLs are not accepted by the Edge endpoint.

## Scheduler and secrets

The Edge function is `event-feed-ingest`. Every manual action authenticates a user JWT and then
requires the `providers.manage` capability before service-role status or claims are reachable.
Scheduled `sync_due` requests require a fresh HMAC signature over the exact raw body, a matching
timestamp and nonce header, a five-minute skew limit, and one-time nonce consumption before any
source claim. The request body is streamed and decoded exactly once, rejects invalid UTF-8 and
fails with 413 after 16 KiB before authentication or HMAC processing.

Production scheduling requires the same strong value in both locations:

- Edge Function secret: `EVENT_FEED_CRON_HMAC_SECRET`
- Supabase Vault secret: `event_feed_cron_hmac_secret` (or the uppercase alias)

After both secrets and the function deployment are verified, a service-role operator can call
`schedule_external_event_feed_daily(<cron expression>)`. Its default two-minute due dispatcher is
not a two-minute source poll: each source keeps its audited `poll_interval_minutes`. One signed
invocation claims two sources per round, runs at most 15 rounds / 30 claims, processes at
concurrency two and stops on a 60-second budget; its abort signal cancels in-flight network work
at the deadline. The database-side `pg_net` call has a 90-second timeout, and the next invocation
safely continues unclaimed backlog. The migration does not create a cron job automatically. All
185 seeded sources remain pending and disabled, with no bulk approval; without an individually
reviewed and enabled source there is intentionally nothing to schedule.

## Operator activation checklist

For each source:

1. Confirm the canonical endpoint is a credential-free HTTPS URL and the exact FQDN matches the
   registry. Never approve a wildcard host.
2. Review the publisher terms, copyright, attribution requirements and permitted reuse. Record
   the decision; a public page alone is not proof of reuse permission.
3. Inspect robots.txt for `HobbeastBot` and the exact endpoint path, then run a non-publishing
   probe. Runtime workers repeat the robots check and fail closed on temporary errors.
4. Inspect the quarantined normalized sample: title, explicit future date, URL, location,
   category, image URL and quality reasons.
5. Choose the least-frequent reasonable poll interval. Enable only after all previous checks.
6. Verify a scheduled run, the dedupe outcome and the public safe-read RPC. Run counters are
   evidence of processing only; they do not themselves prove public publication.

## Monitoring and incident response

- Watch source health, consecutive failures, last success, next poll, run counts and quarantine
  volume in Admin → External events → Feedek.
- A normal 304 is a successful no-change run and narrowly refreshes already-published active
  items; a probe never does. Repeated timeout, DNS, robots, content-type or parser failures should
  disable the source before changing parser logic.
- Use `unschedule_external_event_feed_daily()` to stop new scheduled batches. Disabling a
  source prevents new claims without deleting audit history.
- Expired raw payloads are purged in bounded dispatcher work; the service-only purge RPC remains
  available for incident operations. Raw bodies are never readable by `anon` or `authenticated`
  roles.
- If a service-role credential may have been exposed through historical database functions,
  revoke/rotate it and inspect hosted function/database logs. A local migration test is not
  hosted-production proof.

## Verification commands

```bash
bun run event-feeds:validate
bun run event-feeds:seed
bunx vitest run src/lib/__tests__/eventFeedIngestionCore.test.ts \
  src/lib/__tests__/eventFeedProcessor.test.ts \
  src/lib/__tests__/eventFeedHandler.test.ts
bun run security:audit
bun run db:verify -- --mode=fresh
npx --yes deno@2.5.2 check --no-lock \
  supabase/functions/shared/eventFeeds/pinnedHttps.ts \
  supabase/functions/shared/eventFeeds/safeFetch.ts
```

The generated seed migration must remain byte-for-byte reproducible after a second
`bun run event-feeds:seed` invocation.

## Current release evidence

- Secret scan: PASS across 893 non-ignored paths.
- Security audit: PASS for 233 `SECURITY DEFINER` functions across 44 migrations.
- Full Vitest: PASS, 71 files / 428 tests.
- Fresh database: PASS, 97 migrations / 17 self-rolling-back fixtures.
- Production build: PASS, 3,222 transformed modules.
- Performance: PASS; CSS 122,585 raw / 20,467 gzip bytes and landing JavaScript 157,778 raw /
  49,213 gzip bytes.
- Isolated Playwright: PASS for 14 scenarios; the one credential-gated authenticated fixture is
  `NOT_RUN`.
- Hosted migrations, Edge deployment, live production smoke and an approved scheduled source:
  `NOT_RUN`. Local proof does not upgrade these states.
