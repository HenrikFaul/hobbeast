# Hobbeast event-scraper worker

Offline Playwright worker that renders JavaScript-heavy Hungarian event sites,
extracts **dated** events from each event's static JSON-LD, normalizes them, and
upserts them into Hobbeast through a controlled service-role RPC. Runs from GitHub
Actions on a schedule (3×/day, free tier).

## Why a separate worker

Hobbeast's in-database event-feed pipeline (`event-feed-ingest` Edge function) is
deliberately **no-JavaScript and SSRF-hardened** — it cannot render React/Angular
sites, which is where most Hungarian event data now lives (client-rendered lists).
This worker does the JS rendering **offline** in a sandboxed CI runner, then hands
Hobbeast only clean, validated, dated events. The Edge pipeline stays untouched.

## Architecture

```
GitHub Actions (cron 3×/day)
  └─ node index.mjs
       ├─ Playwright (Chromium, stealth args) renders each source LISTING page
       │    → collects event detail URLs
       ├─ static HTTPS fetch of each DETAIL page (+ robots.txt gate)
       │    → parse per-event JSON-LD (@type *Event / *EventMarkup)
       ├─ normalize → { title, event_date, event_time, location, category, tags, … }
       └─ POST /rest/v1/rpc/ingest_scraped_external_events  (service-role)
            → validated upsert into public.external_events (external_source='scraper')
              → surfaces under "Külső programok" on /events, same as provider events
```

Server-side safety lives in the RPC `public.ingest_scraped_external_events`
(migration `20260825140000`): service-role only, requires a non-empty title and a
**future** date, idempotent upsert on `(external_source, external_id)`.

## Sources

- `src/sources/jegyhu.mjs` — jegy.hu (concert category for now). Listing is
  client-rendered (Playwright); detail pages serve static Event JSON-LD.

Add a source: write `src/sources/<name>.mjs` exporting `scrape…({ browser,
fetchStatic, maxPerListing, log })` returning normalized event objects, then
register it in `SOURCES` in `index.mjs`. Each event object shape:

```js
{
  external_source: 'scraper', external_id: '<publisher>:<id>', external_url,
  title, category, subcategory, tags: [], description,
  event_date: 'YYYY-MM-DD', event_time: 'HH:MM:SS' | null,
  location_type: 'address', location_city, location_address,
  image_url, organizer_name, source_payload: { … }
}
```

## Run locally

```bash
cd scraper-worker
npm install
npx playwright install chromium
npm run scrape:dry                 # render + extract + print, no DB write
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run scrape -- --limit 40
```

## CI secrets (GitHub → Settings → Secrets → Actions)

- `SUPABASE_URL` = `https://bqdvqmpwccsxumzijspj.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = the project's service-role key

## Politeness / safety

- HTTPS only; robots.txt `User-agent: *` disallow rules are honored.
- Detail fetches are sequential with a delay; listing render is one page per source.
- Only future-dated events with a title are ingested; everything else is skipped.
- Events link back to the source (`external_url`), driving traffic to publishers.
