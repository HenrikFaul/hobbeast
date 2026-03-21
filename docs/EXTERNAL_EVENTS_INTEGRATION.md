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

## Next implementation step in the UI

1. Read `external_events` from Supabase in `Events.tsx`
2. Map rows to your existing card/event shape
3. Add source badges (`Ticketmaster`, `SeatGeek`)
4. Reuse your existing `Külső programok` source filter
