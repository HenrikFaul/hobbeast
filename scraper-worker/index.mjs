// Hobbeast event-scraper worker — orchestrator.
//
// Renders JS-heavy Hungarian event sites offline with Playwright, extracts dated
// events from the static per-event JSON-LD, normalizes them, and upserts them into
// Hobbeast via the controlled service-role ingest RPC. Runs from GitHub Actions on
// a schedule (see .github/workflows/event-scraper.yml). The Supabase Edge feed
// pipeline is untouched.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (GitHub Actions secrets).
// Flags: --dry-run (scrape + print, no push), --limit N (cap per listing).

import { chromium } from 'playwright';
import { fetchStatic, robotsAllows } from './src/fetch.mjs';
import { scrapeJegyHu } from './src/sources/jegyhu.mjs';
import { ingestEvents } from './src/ingest.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const maxPerListing = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 40 : 40;
const log = (...m) => console.log(...m);

async function guardedFetch(url) {
  if (!(await robotsAllows(url))) throw new Error('robots disallow');
  return fetchStatic(url);
}

const SOURCES = [
  { name: 'jegy.hu', run: (ctx) => scrapeJegyHu(ctx) },
];

async function main() {
  const started = Date.now();
  log(`Hobbeast event-scraper starting (dryRun=${dryRun}, maxPerListing=${maxPerListing})`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const all = [];
  try {
    for (const source of SOURCES) {
      log(`Source: ${source.name}`);
      try {
        const events = await source.run({ browser, fetchStatic: guardedFetch, maxPerListing, log });
        log(`  ${source.name}: ${events.length} events extracted`);
        all.push(...events);
      } catch (e) {
        log(`  ${source.name} error: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  // De-dupe within this run on (source, id).
  const map = new Map();
  for (const ev of all) map.set(`${ev.external_source}:${ev.external_id}`, ev);
  const events = [...map.values()].filter((e) => e.title && e.event_date);
  log(`Total unique dated events: ${events.length}`);

  if (dryRun) {
    for (const e of events.slice(0, 10)) log(`  • ${e.event_date} ${e.event_time || ''} — ${e.title} @ ${e.location_address || '?'}`);
    log(`(dry-run) not pushed. ${events.length} events ready.`);
    return;
  }

  if (!events.length) { log('No events to push.'); return; }
  const totals = await ingestEvents(events, {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    log,
  });
  log(`Ingest complete: +${totals.inserted} inserted, ~${totals.updated} updated, ${totals.skipped} skipped (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
