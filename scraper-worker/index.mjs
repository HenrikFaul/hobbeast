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
import { fetchStatic, robotsAllows, fetchConditional } from './src/fetch.mjs';
import { harvestLinks, scoreCandidate, isWorthReviewing } from './src/sources/discovery.mjs';
import { crawlFrontier } from './src/sources/crawlFrontier.mjs';
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
  listKnownHosts, recordSourceCandidates,
  getCrawlConfig, listCrawlSeeds, recordCrawlRunStart, recordCrawlRunFinish,
  recordCrawlPages, autoPromoteCrawledSource, getUrlValidators,
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
// The deep frontier crawl is driven by the editable crawl_config row, so the
// operator tunes it live. `--crawl` forces it on for an ad-hoc run even when
// the stored config is disabled; `--crawl-pages N` overrides the page budget.
const forceCrawl = args.includes('--crawl');
const crawlPagesOverride = flag('--crawl-pages', 0);
const crawlTrigger = strFlag('--crawl-trigger') || (forceCrawl ? 'manual' : 'scheduled');
const log = (...m) => console.log(...m);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ctx = { supabaseUrl, serviceRoleKey };

async function guardedFetch(url) {
  if (!(await robotsAllows(url))) throw new Error('robots disallow');
  return fetchStatic(url);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The deep frontier crawl, driven by the operator's crawl_config.
 *
 * Everything the operator asked to control lives in that row — depth, page
 * budget, per-host cap, the politeness delay, which countries to seed from,
 * strict mode, the exclude lists — so it is all tunable live without a deploy.
 * The crawl runs after collection, records a detailed page-by-page trail, and
 * auto-promotes a page whose evidence clears the operator's threshold into the
 * collector, tagged with its country. Nothing here can fail the collection run.
 */
async function runCrawlPass({ provenSeeds, summary }) {
  let config;
  try {
    config = await getCrawlConfig(ctx);
  } catch {
    config = null;
  }
  if (!config) {
    if (forceCrawl) log('CRAWL: no config row; skipping'); // never guess defaults silently
    return;
  }
  if (!config.enabled && !forceCrawl) return;

  const maxPages = crawlPagesOverride > 0 ? crawlPagesOverride : config.max_pages_per_run;
  const countries = Array.isArray(config.allowed_countries) ? config.allowed_countries : [];
  const promoteCountry = countries.length === 1 ? countries[0] : null;

  // Seeds: the operator's own extra seeds, this run's proven publishers, and
  // the top event-producing sources in the chosen countries.
  const configuredSeeds = await listCrawlSeeds({ ...ctx, countries, limit: 12 }).catch(() => []);
  const seeds = [...new Set([...(config.extra_seeds || []), ...provenSeeds, ...configuredSeeds])].slice(0, 20);
  if (!seeds.length) { log('CRAWL: no seeds for the chosen countries'); return; }

  const excludePrefixes = config.exclude_url_prefixes || [];
  const excludeSubstrings = config.exclude_substrings || [];
  const isExcluded = (url) => excludePrefixes.some((p) => p && url.startsWith(p))
    || excludeSubstrings.some((sub) => sub && url.includes(sub));

  const runId = dryRun ? null : await recordCrawlRunStart(ctx, {
    trigger: crawlTrigger,
    config: { max_depth: config.max_depth, max_pages: maxPages, per_host_cap: config.per_host_cap,
      delay_ms: config.delay_ms, strict: config.strict_mode, countries, auto_promote_min_score: config.auto_promote_min_score },
    seedCount: seeds.length,
  });

  const knownHosts = await listKnownHosts(ctx).catch(() => new Set());
  const pageRows = [];
  const lastFetchByHost = new Map();
  let notModified = 0;

  const started = Date.now();
  try {
    const result = await crawlFrontier({
      seeds,
      knownHosts,
      maxDepth: config.max_depth,
      maxPages,
      perHostCap: config.per_host_cap,
      strict: config.strict_mode,
      allowedHosts: config.extra_allowed_hosts || [],
      isExcluded,
      robotsAllows,
      log,
      // Conditional GET plus a per-host politeness delay from the config.
      fetchPage: async (url) => {
        const host = (() => { try { return new URL(url).hostname; } catch { return null; } })();
        if (host) {
          const wait = config.delay_ms - (Date.now() - (lastFetchByHost.get(host) ?? 0));
          if (wait > 0) await sleep(Math.min(wait, config.delay_ms));
          lastFetchByHost.set(host, Date.now());
        }
        const validators = dryRun ? {} : await getUrlValidators(ctx, url).catch(() => ({}));
        return fetchConditional(url, { etag: validators.etag ?? null, lastModified: validators.lastModified ?? null });
      },
      onPage: (row) => {
        if (row.outcome === 'not_modified') notModified += 1;
        pageRows.push(row);
      },
    });

    // Auto-promote the strong ones; the rest go to the review frontier.
    const threshold = config.auto_promote_min_score;
    let autoPromoted = 0;
    const toReview = [];
    for (const candidate of result.candidates) {
      if (!dryRun && candidate.score >= threshold) {
        const id = await autoPromoteCrawledSource(ctx, {
          url: candidate.url,
          publisherName: candidate.link_text || candidate.host,
          country: promoteCountry,
        });
        if (id) {
          autoPromoted += 1;
          pageRows.push({ url: candidate.url, host: candidate.host, depth: candidate.depth,
            outcome: 'auto_promoted', score: candidate.score, candidate_host: candidate.host,
            discovered_from_url: candidate.discovered_from_url, content_simhash: candidate.content_simhash });
          continue;
        }
      }
      toReview.push({ ...candidate, country_code: promoteCountry });
    }

    if (!dryRun && toReview.length) {
      summary.discovered += await recordSourceCandidates({ ...ctx, candidates: toReview });
    }
    if (!dryRun) {
      await recordCrawlPages(ctx, runId, pageRows);
      await recordCrawlRunFinish(ctx, runId, {
        status: 'succeeded',
        stats: { pages_fetched: result.pagesFetched, pages_not_modified: notModified,
          hosts_seen: result.hostsSeen, candidates_found: result.candidates.length,
          auto_promoted: autoPromoted, near_duplicates_skipped: result.nearDuplicatesSkipped,
          errors: pageRows.filter((r) => r.outcome === 'error').length, duration_ms: Date.now() - started },
      });
    }
    log(`CRAWL: ${result.pagesFetched} pages (${notModified} unchanged), ${result.hostsSeen} hosts, `
      + `${result.nearDuplicatesSkipped} near-dup, ${result.candidates.length} candidates, ${autoPromoted} auto-promoted`);
  } catch (e) {
    log(`CRAWL: failed (${e.message.slice(0, 120)})`);
    if (!dryRun) await recordCrawlRunFinish(ctx, runId, { status: 'failed', stats: { duration_ms: Date.now() - started }, error: e.message.slice(0, 400) });
  }
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

      // Sources that produced events this run are proven publishers and make
      // the freshest crawl seeds. Capped so the seed set stays small.
      if (events.length > 0 && listing && provenSeeds.length < 12) {
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

    // The deep pass: a bounded frontier crawl. Config-driven so the operator
    // tunes depth, budget, countries and filters live from the admin screen;
    // the CLI can still force or override for an ad-hoc run. Entirely separate
    // from collection — it runs after the loop and cannot fail the run.
    await runCrawlPass({ provenSeeds, summary });
  } finally {
    await browser.close();
  }

  log(`RUN SUMMARY: ${summary.sources} sources, ${summary.events} events extracted, `
    + `+${summary.inserted} inserted, ~${summary.updated} updated, ${summary.duplicates} cross-source duplicates skipped, `
    + `${summary.skipped} quality-skipped, ${summary.failed} failed, `
    + `${summary.discovered} new source leads (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
