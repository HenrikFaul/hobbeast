# Ticketmaster + SeatGeek external events package for Hobbeast

This package adds:
- a dedicated `external_events` cache table
- client-side wrappers for Ticketmaster and SeatGeek edge functions
- provider adapters for Ticketmaster Discovery API and SeatGeek Events API
- sync edge functions for preview and persistence

## Why a separate table?

Your existing `events` table is clearly for user-created Hobbeast events and requires `created_by`.
External marketplace events are better stored in a separate cache table and merged in the UI.

## Environment variables

### Supabase Edge Functions

Set these in your Supabase project:

- `TICKETMASTER_API_KEY`
- `SEATGEEK_CLIENT_ID`
- `SEATGEEK_CLIENT_SECRET` (optional)

### Function names

- `sync-ticketmaster-events`
- `sync-seatgeek-events`

## Suggested cron cadence

- Ticketmaster: every 2 hours
- SeatGeek: every 4 hours

## Suggested first manual sync payloads

### Ticketmaster preview

```json
{
  "action": "search_preview",
  "params": {
    "countryCode": "HU",
    "city": "Budapest",
    "localStartDateTime": "2026-03-21T00:00:00,2026-04-21T23:59:59",
    "classificationName": "music",
    "size": 25,
    "page": 0
  }
}
```

### Ticketmaster sync

```json
{
  "action": "sync",
  "params": {
    "countryCode": "HU",
    "city": "Budapest",
    "size": 50,
    "maxPages": 2
  }
}
```

### SeatGeek preview

```json
{
  "action": "search_preview",
  "params": {
    "q": "concert",
    "venueCity": "Budapest",
    "datetimeUtcGte": "2026-03-21",
    "taxonomyName": "concert",
    "perPage": 25,
    "page": 1
  }
}
```

### SeatGeek sync

```json
{
  "action": "sync",
  "params": {
    "q": "concert",
    "perPage": 50,
    "maxPages": 2
  }
}
```

## Historical next implementation step in the UI

The following list described the pre-Prompt-09 state. It is retained for history; the current source now reads normalized stored supply, renders source/freshness state and applies canonical deduplication.

1. Read `external_events` from Supabase in `Events.tsx`
2. Map rows to your existing card/event shape
3. Add source badges (`Ticketmaster`, `SeatGeek`)
4. Reuse your existing `Külső programok` source filter

## Production provider governance (2026-08-22)

The runtime contract is now implemented in `supabase/functions/shared/providerFetch.ts`, `externalProviderRuns.ts`, the provider adapters and migration `20260822090000_external_supply_provenance_and_provider_state.sql`:

- normalized provider DTOs do not flow directly into consumer UI;
- canonical provider ID/fingerprint, source URL, first-seen, last-verified, normalization version, freshness, import state and reversible dedupe confidence are stored;
- requests have bounded timeout/retry and normalized outage/quota/malformed/timeout failure kinds;
- provider state records enable/kill-switch, consecutive failures, circuit state and last success/error without raw payload or secret logging;
- repeated sync uses provider/canonical constraints and checkpoints, so retry does not create another canonical row;
- stale/cancelled records remain attributable and are not presented as current;
- Admin Operations exposes redacted provider/run state and controlled replay paths.

### Contract and license gate

Code cannot establish provider contractual permission. Before any production import, the integrations owner must record for Eventbrite, Ticketmaster, SeatGeek, Geoapify, TomTom, Mapy and OpenStreetMap/Nominatim:

1. approved API/product tier and production quota;
2. allowed fields, cache duration, deletion/freshness requirements and geographic restrictions;
3. mandatory consumer/admin attribution and outbound-link rules;
4. personal-data/DPA, residency and subprocessors where applicable;
5. owner, review date and evidence link.

Until that operator evidence exists, provider license/ToS compliance is **HOLD** even though the source implementation and mock contract tests pass. A provider with an unapproved contract remains disabled by its server-side kill switch.

### Scheduler ownership

Suggested cadence above is not an active cron claim. Production schedules must use a server-held identity, replay-safe run key and job lock; expose retry/dead-letter/lag to Admin Operations; and be rehearsed against quota/circuit behavior. No client body flag may bypass admin or worker authentication.
