# Hungarian event-feed ingestion

## Purpose and delivery boundary

The event-feed pipeline expands Hobbeast's existing event supply without replacing native
events, Eventbrite, Ticketmaster or SeatGeek. It accepts RSS 2.0, Atom, ICS, Schema.org Event
JSON-LD and bounded HTML discovery, then maps usable items into the existing external-event
model and hobby taxonomy.

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
3. The admin **Feedek** tab lists candidates, health and run counters. A probe may fetch only a
   pre-registered exact HTTPS/FQDN host and can write only quarantine/audit data.
4. Approval requires all of the following in one audited RPC: exact host, approved legal
   review, explicit robots evidence, poll interval, minimum quality, reason, request ID and
   idempotency key. Enabling is separate and remains guarded in the database.
5. A scheduled worker claims only due, enabled and fully approved sources with a lease. Every
   fetch performs a fresh, SSRF-safe `/robots.txt` decision before the event endpoint request.
6. The fetcher revalidates DNS on every redirect hop, rejects private/non-global addresses,
   cross-host redirects, credentials, non-HTTPS URLs and non-443 ports, and applies timeout,
   item, string and 2 MiB response limits. ETag and Last-Modified validators support 304.
7. Raw responses are service-only quarantine evidence with SHA-256 identity and a 14-day TTL.
   Parsed items receive category mapping, quality reasons and deduplication before a database
   transaction can publish them into `external_events`.
8. Parser warnings, missing event dates, invalid URLs, low quality and every probe result stay
   quarantined. Cancelled upstream occurrences deactivate the corresponding published item.

## Supported input contracts

- RSS 2.0 and Atom with an explicit event date. Article publication dates are never treated as
  event start dates.
- ICS with UID, `RECURRENCE-ID`, cancellation and timezone handling.
- Schema.org `Event` and Event subclasses, including `@graph` documents.
- HTML containing JSON-LD or same-host RSS/Atom discovery links. Arbitrary selectors and
  caller-supplied URLs are not accepted by the Edge endpoint.

## Scheduler and secrets

The Edge function is `event-feed-ingest`. Manual actions authenticate an admin JWT in the
handler. Scheduled `sync_due` requests require a fresh HMAC signature over the exact raw body,
a matching timestamp and nonce header, a five-minute skew limit, and one-time nonce consumption
before any source claim.

Production scheduling requires the same strong value in both locations:

- Edge Function secret: `EVENT_FEED_CRON_HMAC_SECRET`
- Supabase Vault secret: `event_feed_cron_hmac_secret` (or the uppercase alias)

After both secrets and the function deployment are verified, a service-role operator can call
`schedule_external_event_feed_daily(<cron expression>)`. The migration does not create a cron
job automatically. A schedule without at least one legally approved, robots-approved and
enabled source is harmless but intentionally unnecessary.

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
- A 304 is a successful no-change run. Repeated timeout, DNS, robots, content-type or parser
  failures should disable the source before changing parser logic.
- Use `unschedule_external_event_feed_daily()` to stop new scheduled batches. Disabling a
  source prevents new claims without deleting audit history.
- Purge expired raw payloads with the service-only purge RPC. Raw bodies are never readable by
  `anon` or `authenticated` roles.
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
```

The generated seed migration must remain byte-for-byte reproducible after a second
`bun run event-feeds:seed` invocation.
