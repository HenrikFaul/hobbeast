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
