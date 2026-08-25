// Hobbeast event-scraper worker — registry-driven orchestrator (v2).
//
// Targets come from the Hobbeast DB registry (external_event_feed_sources with
// scrape_enabled=true), ordered master-first (scrape_priority) then
// least-recently-scraped, so every source rotates through across scheduled runs.
// Each source is rendered with Playwright, events are extracted from per-event
// JSON-LD (with og: fallbacks), enriched (image, description, venue, ticket
// price/currency/link), then upserted through the controlled service-role RPC —
// which also performs cross-source fingerprint dedup (master source wins).
// Every source's outcome is logged to scraper_runs for the admin dashboard.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Flags: --dry-run, --sources N (targets per run, default 25),
//        --details N (detail pages per source, default 12).

import { chromium } from 'playwright';
import { fetchStatic, robotsAllows } from './src/fetch.mjs';
import { scrapeGenericSource, normalizeEndpointUrl } from './src/sources/generic.mjs';
import { scrapeRssSource } from './src/sources/rss.mjs';
import { scrapeTribeSource } from './src/sources/tribe.mjs';
import { adapterForSource } from './src/sources/adapters.mjs';
import { ingestEvents } from './src/ingest.mjs';
import { listScraperTargets, logScraperRun } from './src/registry.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) || dflt : dflt; };
const dryRun = args.includes('--dry-run');
const sourcesPerRun = flag('--sources', 25);
const detailsPerSource = flag('--details', 40);
const log = (...m) => console.log(...m);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function guardedFetch(url) {
  if (!(await robotsAllows(url))) throw new Error('robots disallow');
  return fetchStatic(url);
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const started = Date.now();
  log(`Hobbeast scraper v2 (dryRun=${dryRun}, sources=${sourcesPerRun}, details=${detailsPerSource})`);

  const targets = await listScraperTargets({ supabaseUrl, serviceRoleKey, limit: sourcesPerRun });
  log(`Targets from registry: ${targets.length}`);

  // --disable-http2: some sites (eventim.hu) abort Chromium's HTTP/2 handshake.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http2'] });
  const summary = { sources: 0, events: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0 };
  try {
    for (const source of targets) {
      const t0 = Date.now();
      const label = `${source.publisher_name} (${source.source_id})`;
      const listing = normalizeEndpointUrl(source.endpoint_url);
      let events = [];
      let httpStatus = null;
      let status = 'succeeded';
      let error = null;
      const strategy = source.scrape_strategy || 'render';
      try {
        if (!listing) throw new Error('invalid endpoint url');
        if (!(await robotsAllows(listing))) throw new Error('robots disallow on listing');
        const opts = { browser, fetchStatic: guardedFetch, maxDetails: detailsPerSource, log };
        const adapter = strategy === 'site' ? adapterForSource(source) : null;
        ({ events, httpStatus } = adapter
          ? await adapter(source, opts)
          : strategy === 'tribe'
            ? await scrapeTribeSource(source, opts)
            : strategy === 'rss'
              ? await scrapeRssSource(source, opts)
              : await scrapeGenericSource(source, opts));
        if (events.length > 300) events = events.slice(0, 300);
        log(`  ${label} [${strategy}]: ${events.length} dated events (HTTP ${httpStatus ?? '?'})`);
      } catch (e) {
        status = 'failed';
        error = e.message.slice(0, 200);
        log(`  ${label}: FAILED ${error}`);
      }

      let totals = { inserted: 0, updated: 0, skipped: 0, duplicates: 0 };
      if (!dryRun && events.length) {
        try {
          totals = await ingestEvents(events, { supabaseUrl, serviceRoleKey, log: () => {} });
        } catch (e) {
          status = 'partial';
          error = `ingest: ${e.message.slice(0, 160)}`;
          log(`  ${label}: ingest error ${error}`);
        }
      }

      if (!dryRun) {
        await logScraperRun({
          supabaseUrl, serviceRoleKey, sourceId: source.source_id,
          discovered: events.length, inserted: totals.inserted || 0, updated: totals.updated || 0,
          skipped: totals.skipped || 0, duplicates: totals.duplicates || 0,
          status, error, durationMs: Date.now() - t0, httpStatus,
        }).catch(() => {});
      }

      summary.sources += 1;
      summary.events += events.length;
      summary.inserted += totals.inserted || 0;
      summary.updated += totals.updated || 0;
      summary.skipped += totals.skipped || 0;
      summary.duplicates += totals.duplicates || 0;
      if (status === 'failed') summary.failed += 1;
    }
  } finally {
    await browser.close();
  }

  log(`RUN SUMMARY: ${summary.sources} sources, ${summary.events} events extracted, `
    + `+${summary.inserted} inserted, ~${summary.updated} updated, ${summary.duplicates} cross-source duplicates skipped, `
    + `${summary.skipped} quality-skipped, ${summary.failed} failed (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
