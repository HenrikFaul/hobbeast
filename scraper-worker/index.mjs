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
import { harvestLinks, scoreCandidate, isWorthReviewing } from './src/sources/discovery.mjs';
import { crawlFrontier } from './src/sources/crawlFrontier.mjs';
import { simhash64 } from './src/sources/fingerprint.mjs';
import { scrapeGenericSource, normalizeEndpointUrl } from './src/sources/generic.mjs';
import { scrapeRssSource } from './src/sources/rss.mjs';
import { scrapeTribeSource } from './src/sources/tribe.mjs';
import { adapterForSource } from './src/sources/adapters.mjs';
import {
  scrapeRecipeSource, scrapeSelectorSource, supportsRecipeStrategy,
} from './src/sources/recipeRunner.mjs';
import { ingestEvents } from './src/ingest.mjs';
import {
  listScraperTargets, listScraperTargetsByIds, logScraperRun, recordDiscoveredEndpoint,
  listKnownHosts,
  recordSourceCandidates,
} from './src/registry.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) || dflt : dflt; };
const strFlag = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || '') : ''; };
const dryRun = args.includes('--dry-run');
const sourcesPerRun = flag('--sources', 25);
const detailsPerSource = flag('--details', 40);
// Manual targeted run from the admin panel: exact source ids, bypassing rotation.
const onlyIds = strFlag('--only').split(',').map((s) => s.trim()).filter((s) => /^src_[a-f0-9]{8}$/.test(s));
// How many of this run's sources also get a discovery pass. Capped on purpose:
// a night's collection must never quietly become a crawl. `--discover 0` off.
const discoverLimit = flag('--discover', 8);
// A deeper BFS crawl from the sources that produced events this run, following
// links a couple of levels out to find publishers we do not yet know. Off by
// default (`--crawl 6` turns it on); strictly bounded when on.
const crawlSeeds = flag('--crawl', 0);
const crawlMaxPages = flag('--crawl-pages', 40);
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

  const targets = onlyIds.length
    ? await listScraperTargetsByIds({ supabaseUrl, serviceRoleKey, ids: onlyIds })
    : await listScraperTargets({ supabaseUrl, serviceRoleKey, limit: sourcesPerRun });
  log(`Targets from registry: ${targets.length}${onlyIds.length ? ' (targeted manual run)' : ''}`);

  // --disable-http2: some sites (eventim.hu) abort Chromium's HTTP/2 handshake.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http2'] });
  const summary = { sources: 0, events: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0, discovered: 0 };

  /**
   * Source discovery: the pages we already read link outward, and those links
   * are the best-qualified leads there are.
   *
   * Kept strictly separate from collection. It only looks at sources that just
   * produced events (a proven publisher), it is capped per run so a night's
   * work never turns into a crawl, and every failure is swallowed — a bonus
   * pass must never be able to break a collection run.
   */
  const knownHosts = discoverLimit > 0
    ? await listKnownHosts({ supabaseUrl, serviceRoleKey }).catch(() => new Set())
    : new Set();
  let discoveryBudget = discoverLimit;
  const provenSeeds = [];
  try {
    for (const source of targets) {
      const t0 = Date.now();
      const label = `${source.publisher_name} (${source.source_id})`;
      const listing = normalizeEndpointUrl(source.endpoint_url);
      let events = [];
      let httpStatus = null;
      let discoveredUrl = null;
      let status = 'succeeded';
      let error = null;
      const strategy = source.scrape_strategy || 'render';
      try {
        if (!listing) throw new Error('invalid endpoint url');
        if (!(await robotsAllows(listing))) throw new Error('robots disallow on listing');
        const opts = { browser, fetchStatic: guardedFetch, maxDetails: detailsPerSource, log };
        const adapter = strategy === 'site' ? adapterForSource(source) : null;
        ({ events, httpStatus, discoveredUrl = null } = adapter
          ? await adapter(source, opts)
          : strategy === 'selector'
            ? await scrapeSelectorSource(source, opts)
            : supportsRecipeStrategy(strategy)
              ? await scrapeRecipeSource(source, opts)
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

      // A hub retry that produced events means the registered URL was wrong;
      // persist the working one so the fix survives future runs.
      if (!dryRun && discoveredUrl && events.length > 0) {
        log(`  ${label}: belepesi pont javitva -> ${discoveredUrl}`);
        await recordDiscoveredEndpoint({
          supabaseUrl, serviceRoleKey, sourceId: source.source_id, url: discoveredUrl,
        }).catch(() => {});
      }

      if (!dryRun) {
        await logScraperRun({
          supabaseUrl, serviceRoleKey, sourceId: source.source_id,
          discovered: events.length, inserted: totals.inserted || 0, updated: totals.updated || 0,
          skipped: totals.skipped || 0, duplicates: totals.duplicates || 0,
          status, error, durationMs: Date.now() - t0, httpStatus,
        }).catch(() => {});
      }

      if (crawlSeeds > 0 && events.length > 0 && listing && provenSeeds.length < crawlSeeds) {
        provenSeeds.push(listing);
      }

      if (discoveryBudget > 0 && events.length > 0 && listing) {
        discoveryBudget -= 1;
        try {
          const { body } = await guardedFetch(listing);
          const leads = harvestLinks(body, listing, { knownHosts, limit: 15 })
            .map((lead) => {
              const scored = scoreCandidate({ url: lead.url, linkText: lead.linkText ?? '' });
              return { ...lead, ...scored };
            })
            .filter(isWorthReviewing)
            .map((lead) => ({
              host: lead.host,
              url: lead.url,
              link_text: lead.linkText,
              score: lead.score,
              reasons: lead.reasons,
              signals: lead.signals,
              depth: 1,
              discovered_from_source_id: source.source_id,
              discovered_from_url: listing,
            }));

          if (leads.length && !dryRun) {
            const written = await recordSourceCandidates({ supabaseUrl, serviceRoleKey, candidates: leads });
            summary.discovered += written;
            // Do not suggest the same host twice in one run.
            for (const lead of leads) knownHosts.add(lead.host);
            if (written) log(`  ${label}: ${written} lehetseges uj forras`);
          }
        } catch (e) {
          log(`  ${label}: discovery skipped (${e.message.slice(0, 80)})`);
        }
      }

      summary.sources += 1;
      summary.events += events.length;
      summary.inserted += totals.inserted || 0;
      summary.updated += totals.updated || 0;
      summary.skipped += totals.skipped || 0;
      summary.duplicates += totals.duplicates || 0;
      if (status === 'failed') summary.failed += 1;
    }

    // The deep pass: a bounded frontier crawl from the sources that just
    // produced events. Kept entirely separate from collection — it runs after
    // the loop, respects robots, dedups by content, and cannot fail the run.
    if (crawlSeeds > 0 && provenSeeds.length > 0) {
      try {
        const knownHosts = await listKnownHosts({ supabaseUrl, serviceRoleKey }).catch(() => new Set());
        const result = await crawlFrontier({
          seeds: provenSeeds,
          fetchPage: async (url) => {
            const html = await guardedFetch(url);
            return { html, status: 200 };
          },
          robotsAllows,
          knownHosts,
          maxDepth: 2,
          maxPages: crawlMaxPages,
          perHostCap: 6,
          log,
        });
        // Fingerprint each candidate against its own discovery page so a later
        // run can recognise a re-slugged copy (K4 cross-run dedup).
        const candidates = result.candidates.map((candidate) => ({
          ...candidate,
          content_simhash: candidate.content_simhash
            ?? (candidate.discovered_from_url ? simhash64(candidate.discovered_from_url) : null),
        }));
        if (candidates.length && !dryRun) {
          const written = await recordSourceCandidates({ supabaseUrl, serviceRoleKey, candidates });
          summary.discovered += written;
        }
        log(`CRAWL: ${result.pagesFetched} pages, ${result.hostsSeen} hosts, `
          + `${result.nearDuplicatesSkipped} near-dup skipped, ${candidates.length} candidates`);
      } catch (e) {
        log(`CRAWL: skipped (${e.message.slice(0, 100)})`);
      }
    }
  } finally {
    await browser.close();
  }

  log(`RUN SUMMARY: ${summary.sources} sources, ${summary.events} events extracted, `
    + `+${summary.inserted} inserted, ~${summary.updated} updated, ${summary.duplicates} cross-source duplicates skipped, `
    + `${summary.skipped} quality-skipped, ${summary.failed} failed, `
    + `${summary.discovered} new source leads (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
