# Migration record — `20260905143000_seed_foreign_event_sources_v7.sql`

**Release:** v1.58.0 · **Date:** 2026-09-05 · **Predecessor:** `20260905000746_seed_foreign_event_sources_v6.sql` (v1.56.0, commit `d8a0a03`)

## What this migration does

Registers the remaining **20 foreign event sources** from the 2026-09-04 crawl as
`review_state='approved'`, `legal_review_status='approved'`, `robots_allowed=true`,
`enabled=false`, `scrape_enabled=true` (19 rows; see the wien.info exception below),
each carrying its `country_code`, behind the same host-level `NOT EXISTS` guard V5 and
V6 use.

Registry after this migration: **411 sources** — 377 HU + 14 (V6) + 20 (V7).

## Why it exists

V6 shipped only the 14 hosts that had cleared **both** the proposing pass and the
adversarial verifying pass. The other 25 crawled hosts had seen the proposing pass
only, because that run hit its weekly agent limit on 2026-09-04; three more
(`oeticket.com`, `ticketportal.cz`, `eventim.pl`) had never been vetted at all.
A single pass is not a safe basis for pointing live scraping at a third party's site:
on the Hungarian V5 run the verifying pass rejected 11 of 39 first-pass proposals and
corrected another 10.

**This round the second pass rejected 8 of 28 — 29%.** The rate did not collapse.

## Method

For each of the 28 hosts:

1. **Refetch the proposed endpoint** and confirm it lists MULTIPLE dated events, with
   the actual titles/dates/venues recorded. WebFetch first; where the origin returned
   403 or the payload was not HTML, `curl` with a desktop Chrome User-Agent and a
   locale-appropriate `Accept-Language`.
2. **Correct the endpoint** where the proposal was wrong, or **reject** where the host
   has no usable server-rendered listing.
3. **Read `robots.txt` on the serving host** (not the brand domain) and record whether
   the listing path is allowed, plus every constraint that applies: `Crawl-delay`,
   query-string bans, named AI/SEO crawler blocks, Cloudflare Content Signals.
4. **Dedupe on the final endpoint host**, per the V5 lesson — not the name the crawl
   arrived with.

## Outcome — 20 approved

| Host | Endpoint | Country | Strategy |
|---|---|---|---|
| events.at | `/calendar` | AT | render |
| www.linztermine.at | `/suche` | AT | render |
| spielplan.musikverein.at | `/spielplan` | AT | render |
| www.wiener-staatsoper.at | `/kalender` | AT | render |
| www.wien.info | `/ajax/de/events` | AT | render *(scrape_enabled=false)* |
| prague.eu | `/cs/akce-kategorie/akce/` | CZ | render |
| www.rudolfinum.cz | `/program` | CZ | render |
| www.ticketmaster.cz | `/category/hudba-vstupenky/10001` | CZ | render |
| www.poznan.pl | `/mim/events/` | PL | render |
| teatrwielki.pl | `/kalendarium/` | PL | render |
| www.ticketmaster.pl | `/category/muzyka-bilety/10001` | PL | render |
| www.wroclaw.pl | `/go/wydarzenia` | PL | render |
| go2warsaw.pl | `/co-gdzie-kiedy/` | PL | **jsonld** |
| kultura.maribor.si | `/napovednik/seznam/` | SI | **tribe** |
| www.mojekarte.si | `/si/vstopnice.html` | SI | render |
| www.visitljubljana.com | `/sl/obiskovalci/prireditve` | SI | render |
| kamdomesta.sk | `/koncerty` | SK | render |
| snd.sk | `/program` | SK | render |
| predpredaj.zoznam.sk | `/sk/` | SK | render |
| www.visitbratislava.com | `/sk/podujatia` | SK | render |

Country spread: AT 5, CZ 3, PL 5, SI 3, SK 4.

## Outcome — 8 rejected

| Host | Reason |
|---|---|
| `kosice.sk` | A hub article, not a calendar: 3-4 events, and their dates (May/June 2026) are already in the past. The first pass also said reject; independently upheld. |
| `opera.si` | `/sl/program/koledar/` returns HTTP 200 but 1.2 KB of text with zero events — a client-rendered shell loading `eventList.bundle.js` off a `data-startdate` attribute. `/sl/repertoar/` lists works without dates. The house's dated performances reach us through **mojekarte.si**, which is where opera.si itself sells tickets. |
| `salzburgerfestspiele.at` | `/karten/kalender` is likewise a JS shell (1.4 KB of text, no events); the 2026 festival ended 30 August and the 2027 edition is not on sale. |
| `ticketportal.sk` | Server HTML is an untranslated SPA template: literal `[SK|lbKategorie]` and `%ValidDate%` placeholders, Lorem ipsum, a 2017 demo event. **Zero** 2026/2027 date tokens and **zero** JSON-LD blocks in the whole document. |
| `ticketportal.cz` | Same shell, same evidence. |
| `eventim.si` | Unreachable. |
| `oeticket.com` | Unreachable. |
| `eventim.pl` | Unreachable. `curl` with a browser UA over IPv4 **and** IPv6, and WebFetch — two independent egress paths — all time out or get the connection reset on all three CTS Eventim / oeticket hosts. The V5 lesson stands: no live fetch, no source. |

## Endpoint corrections and notable robots constraints

- **`predpredaj.sk` → `predpredaj.zoznam.sk`.** The brand domain and the serving host
  differ; the guard keys on the serving host.
- **`musikverein.at` → `spielplan.musikverein.at`.** `robots.txt` is scoped per host:
  the root is fully permissive, the `spielplan` subdomain serves no `robots.txt` at all
  (404 → default-allow).
- **`wien.info` returns JSON, not HTML.** The proposal called it an HTML listing; the
  endpoint actually serves ~425 KB of `{"type":"events","items":[…]}` with ISO dates.
  `format` and `parser_strategy` record the real shape.
- **`prague.eu` sets `Crawl-delay: 600`** — ten minutes between requests, the strictest
  in the registry — plus `Disallow: /*?*` (no query strings at all) and `Disallow:
  /wp-json/`. One fetch yields ~870 events, so a single daily hit fits inside it.
- **`mojekarte.si` blocks `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `GPTBot`, `CCBot`,
  `PerplexityBot`** and ~50 more by name with `Disallow: /`. The generic `User-agent: *`
  group permits `/si/` with `Crawl-delay: 10`, so the collector must run under its own
  honest Hobbeast UA and never one of those tokens.
- **`wiener-staatsoper.at`** blocks the same AI crawler names and sets Cloudflare
  `Content-Signal: search=yes, ai-train=no, use=reference` as an express Article 4 EU
  DSM reservation. An event index that stores factual data and links back falls under
  `search=yes` / `use=reference`; training on this content does not.
- **`poznan.pl` and `snd.sk` set `Crawl-delay: 10`**; `kamdomesta.sk` serves a
  zero-byte `robots.txt`; `teatrwielki.pl` and `salzburgerfestspiele.at` serve none at
  all (404).
- **Browser User-Agent required** (403 otherwise) on: `events.at`, `mojekarte.si`,
  `wiener-staatsoper.at`.

## The wien.info exception

`www.wien.info` is approved but ships **`scrape_enabled=false`**. Its endpoint is
verified and robots-clear, but the payload is a bespoke `{items:[…]}` JSON shape and no
existing worker strategy can read it: `jsonld` requires `<script
type="application/ld+json">` tags, `wp-posts` expects the WordPress REST shape, and
`render` would drive Playwright at a JSON document. Enabling it would only accrue
`consecutive_failures`. It is registered so the endpoint and its robots clearance are
not lost. Flip `scrape_enabled` once a `site` adapter (or a json-items strategy) keyed
on `www.wien.info` exists.

## Strategy choices verified against the worker's own code

Two rows deviate from V6's uniform `render`, and both were checked against the code
path the worker actually runs, not inferred:

- **`kultura.maribor.si` → `tribe`.** `scrapeTribeSource()` derives
  `{origin}/wp-json/tribe/events/v1/events` from `endpoint_url`; that exact call returned
  HTTP 200, `total=29`, `total_pages=6`, with `title`, `start_date`, `venue.venue`,
  `venue.address`, `venue.city`, `url` — precisely the fields the adapter reads. (Its
  price regex only recognises Ft/HUF, so `price_min` stays null for EUR listings;
  harmless, but do not read that as a parse failure.)
- **`go2warsaw.pl` → `jsonld`.** One GET returned 490 KB containing **1034**
  `application/ld+json` blocks; all 1034 parsed and all 1034 are `@type=Event` carrying
  `name` + `startDate` + `location.name` — the exact contract `parseJsonLdEvents()`
  requires.

## Dedup

Checked against every endpoint URL recorded anywhere in `supabase/` and `scripts/`
(220 distinct hosts, covering all 378 `src_*` ids the repo carries): **zero collisions**,
including the apex forms of the two subdomain hosts (`zoznam.sk`, `musikverein.at`,
`maribor.si`).

The Supabase MCP was **not available in this session** (no Supabase MCP server is
configured, and there are no DB credentials in the worktree), so the live table could
not be queried directly. The repo-derived set is a proxy for it, and the migration's
host-level `NOT EXISTS` guard is the authoritative backstop — it runs against the live
table at apply time and is proven below to skip a colliding host.

## Runtime proof

`bun run db:verify` cannot gate this migration: `--mode=fresh` breaks at
`20260825090000_event_feed_registry_and_publish_safety.sql`, whose early statements need
the hosted platform's `auth` schema and `public.app_runtime_config` — a **pre-existing**
break that sorts long before this file. (`--mode=restore` would need a current dump; the
newest non-empty one on `E:\databasebackup\Hobbeast\backups` is 2026-06-18, which
predates the registry entirely.)

Instead, a disposable PostgreSQL 18 cluster was built with the platform objects stubbed
and the registry table, its two helper functions and the `scrape_*` columns/constraints
replayed verbatim from the real migrations; then V6 and V7 were applied **strictly**
(`ON_ERROR_STOP=1 --single-transaction`). All 17 assertions passed:

```
STRICT OK  20260905000746_seed_foreign_event_sources_v6.sql
STRICT OK  20260905143000_seed_foreign_event_sources_v7.sql

PASS  V6 rows still land untouched: got "14"
PASS  V7 rows inserted: got "20"
PASS  approved / legal approved / robots_allowed / enabled=false: got "20"
PASS  scrape_enabled true on 19: got "19"
PASS  wien.info deliberately scrape_enabled=false: got "f"
PASS  country spread: got "AT=5,CZ=3,PL=5,SI=3,SK=4"
PASS  strategy spread: got "jsonld=1,render=18,tribe=1"
PASS  fetch_hosts exact and equal to the endpoint host: got "20"
PASS  every endpoint passes the https/host gate: got "0"
PASS  enable-guard would accept every scrape_enabled row (dry run): got "0"
PASS  no duplicate endpoint host in the whole table: got "0"
PASS  none of the 8 rejected hosts leaked in: got "0"
PASS  categories non-empty on every row: got "0"
PASS  dedupe_priority is 0 or 1: got "0"
PASS  host guard skipped the colliding host (snd.sk), inserted the other 19: got "19"
PASS  the skipped row is exactly snd.sk: got "0"
PASS  re-applying V7 is a no-op (idempotent): got "34"

17/17 checks passed
```

The guard test is the one that matters most: a pre-existing row was planted on
`https://snd.sk/anything-else`, the migration was re-applied, and it inserted 19 rows
while silently skipping `snd.sk` — proving the host guard, not just `ON CONFLICT`, does
the deduplication.

## Operator note

Nothing here turns on scraping by itself. `enabled` stays `false` on every row (that
column drives the legacy no-JS feed pipeline). `scrape_enabled=true` puts the 19 rows in
the Playwright worker's queue; the operator can review or pause any of them at
`/admin?tab=scraper`. The robots constraints recorded in each row's `legal_basis` — the
crawl delays, the UA requirements, the query-string bans — are instructions for the
collector, not decoration.
