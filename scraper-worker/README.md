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

### The collection frontier

The detail-fetch step above is queue-driven, not sampled. A listing routinely
offers more event links than one run can afford, and the old behaviour —
`shuffled(detailUrls).slice(0, maxDetails)` — forgot everything afterwards, so
each night re-rolled the dice: the same pages came back while others were never
opened.

`public.collection_frontier` remembers instead, one row per `(source_id, url)`:

```
listing links ──enqueue──▶ collection_frontier (pending)
                              │  claim: priority DESC, depth ASC, oldest first
                              ▼
                           running ──fetch──▶ done  (found_events, etag)
                              │                 │
                              │                 └─ revisited after 3 days,
                              │                    conditional GET → 304 = no re-parse
                              └─ error → pending at half priority, max 3 attempts
```

- **Priority** comes from the link's shape: a date, an opaque numeric id, or a
  long slug in the path means an item page (`2`); anything else is a listing
  (`0.5`). Links found *on* a detail page are enqueued one level deeper, to
  depth 2.
- **Politeness** is unchanged and still binding: robots, `Crawl-delay` and the
  per-source `DETAIL_TIME_BUDGET_MS` all apply. A `429`/`503` parks the whole
  host in `crawl_host_state.backoff_until`, and `claim` skips backed-off hosts.
- **Budget exhaustion** hands the unfetched claims back (`running → pending`),
  so nothing is lost when a run is cut short. A crashed run's claims free
  themselves after an hour.
- **Kill switch:** `crawl_config.collection_frontier_enabled`. With it false —
  or in a `--dry-run`, or if any frontier RPC is unavailable —
  `scrapeGenericSource` falls back to the old sampling path unchanged.

The planner lives in `src/sources/collectionFrontier.mjs` and, like
`crawlFrontier.mjs`, takes its queue, fetch and extractor by injection, so the
whole walk is testable offline. Progress per source is visible in the admin
scraper table's **Frontier** column (`done/total`).

Design borrowed from the `event_queue` in `C:\Work\Smartsearchtool\grepsearch-main`,
scoped per source rather than globally because one host can serve several
registered sources (jegy.hu has five endpoints).

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
