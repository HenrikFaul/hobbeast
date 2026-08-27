// DB-driven target registry access for the scraper worker.
// Targets come from public.external_event_feed_sources (scrape_enabled=true),
// ordered by scrape_priority (master sources first) then least-recently scraped.
// Run outcomes go to public.scraper_runs via log_scraper_run.

function headers(key) {
  return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

export async function listScraperTargets({ supabaseUrl, serviceRoleKey, limit = 25 }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/list_scraper_targets`, {
    method: 'POST', headers: headers(serviceRoleKey), body: JSON.stringify({ p_limit: limit }),
  });
  if (!res.ok) throw new Error(`list_scraper_targets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function listScraperTargetsByIds({ supabaseUrl, serviceRoleKey, ids }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/list_scraper_targets_by_ids`, {
    method: 'POST', headers: headers(serviceRoleKey), body: JSON.stringify({ p_ids: ids }),
  });
  if (!res.ok) throw new Error(`list_scraper_targets_by_ids ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function recordDiscoveredEndpoint({ supabaseUrl, serviceRoleKey, sourceId, url }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/record_discovered_endpoint`, {
    method: 'POST', headers: headers(serviceRoleKey),
    body: JSON.stringify({ p_source_id: sourceId, p_url: url }),
  });
  if (!res.ok) console.warn(`record_discovered_endpoint ${sourceId} failed: ${res.status}`);
  return res.ok;
}

export async function logScraperRun({ supabaseUrl, serviceRoleKey, sourceId, discovered, inserted, updated, skipped, duplicates, status, error, durationMs, httpStatus }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/log_scraper_run`, {
    method: 'POST', headers: headers(serviceRoleKey),
    body: JSON.stringify({
      p_source_id: sourceId, p_discovered: discovered, p_inserted: inserted,
      p_updated: updated, p_skipped: skipped, p_duplicates: duplicates,
      p_status: status, p_error: error || null, p_duration_ms: durationMs,
      p_http_status: Number.isInteger(httpStatus) ? httpStatus : null,
    }),
  });
  if (!res.ok) console.warn(`log_scraper_run ${sourceId} failed: ${res.status}`);
}

/**
 * The hosts the collector already knows, so discovery never suggests one of
 * them. Read once per run rather than per source.
 */
export async function listKnownHosts({ supabaseUrl, serviceRoleKey }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/external_event_feed_sources?select=endpoint_url`, {
    headers: headers(serviceRoleKey),
  });
  if (!res.ok) return new Set();
  const rows = await res.json();
  const hosts = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      hosts.add(new URL(row.endpoint_url).hostname.replace(/^www\./i, '').toLowerCase());
    } catch { /* a malformed endpoint simply teaches us nothing */ }
  }
  return hosts;
}

/**
 * Files discovered leads. Never throws: discovery is a bonus pass, and it must
 * not be able to fail a collection run.
 */
export async function recordSourceCandidates({ supabaseUrl, serviceRoleKey, candidates }) {
  if (!candidates?.length) return 0;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/record_source_candidates`, {
      method: 'POST', headers: headers(serviceRoleKey),
      body: JSON.stringify({ p_candidates: candidates }),
    });
    if (!res.ok) {
      console.warn(`record_source_candidates failed: ${res.status}`);
      return 0;
    }
    return Number(await res.json()) || 0;
  } catch (error) {
    console.warn(`record_source_candidates threw: ${error.message}`);
    return 0;
  }
}

// --- crawl control & telemetry ---------------------------------------------

/** The operator's live crawl config, or null if it cannot be read. */
export async function getCrawlConfig({ supabaseUrl, serviceRoleKey }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/crawl_config?id=eq.true&limit=1`, {
    headers: headers(serviceRoleKey),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Listing URLs of enabled, event-producing sources in the chosen countries,
 * to seed the crawl from. Country is a filter, never a hardcode: an empty or
 * absent list means "any".
 */
export async function listCrawlSeeds({ supabaseUrl, serviceRoleKey, countries = [], limit = 12 }) {
  const countryFilter = Array.isArray(countries) && countries.length
    ? `&country_code=in.(${countries.map((c) => encodeURIComponent(c)).join(',')})`
    : '';
  const res = await fetch(
    `${supabaseUrl}/rest/v1/external_event_feed_sources`
    + `?select=endpoint_url&scrape_enabled=eq.true&scrape_total_event_count=gt.0${countryFilter}`
    + `&order=scrape_total_event_count.desc&limit=${limit}`,
    { headers: headers(serviceRoleKey) },
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((r) => r.endpoint_url).filter(Boolean);
}

async function rpc(name, body, { supabaseUrl, serviceRoleKey }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(serviceRoleKey), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function recordCrawlRunStart(ctx, { trigger, config, seedCount }) {
  try {
    return await rpc('record_crawl_run_start', { p_trigger: trigger, p_config: config, p_seed_count: seedCount }, ctx);
  } catch (e) {
    console.warn(`record_crawl_run_start: ${e.message}`);
    return null;
  }
}

export async function recordCrawlRunFinish(ctx, runId, { status, stats, error = null }) {
  if (!runId) return;
  try {
    await rpc('record_crawl_run_finish', { p_run_id: runId, p_status: status, p_stats: stats, p_error: error }, ctx);
  } catch (e) { console.warn(`record_crawl_run_finish: ${e.message}`); }
}

export async function recordCrawlPages(ctx, runId, pages) {
  if (!runId || !pages?.length) return 0;
  try {
    // Chunk so one very large run does not send a giant body.
    let total = 0;
    for (let i = 0; i < pages.length; i += 100) {
      total += Number(await rpc('record_crawl_pages', { p_run_id: runId, p_pages: pages.slice(i, i + 100) }, ctx)) || 0;
    }
    return total;
  } catch (e) { console.warn(`record_crawl_pages: ${e.message}`); return 0; }
}

export async function autoPromoteCrawledSource(ctx, { url, publisherName, country, strategy = 'site' }) {
  try {
    const id = await rpc('auto_promote_crawled_source', {
      p_url: url, p_publisher_name: publisherName, p_country: country, p_strategy: strategy,
    }, ctx);
    return typeof id === 'string' ? id : null;
  } catch (e) { console.warn(`auto_promote_crawled_source: ${e.message}`); return null; }
}

/** The most recent conditional-GET validators we hold for a URL, if any. */
export async function getUrlValidators({ supabaseUrl, serviceRoleKey }, url) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/crawl_page_results`
      + `?select=etag,last_modified&url=eq.${encodeURIComponent(url)}`
      + `&or=(etag.not.is.null,last_modified.not.is.null)&order=fetched_at.desc&limit=1`,
      { headers: headers(serviceRoleKey) },
    );
    if (!res.ok) return {};
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? { etag: rows[0].etag, lastModified: rows[0].last_modified } : {};
  } catch { return {}; }
}
