import { supabase } from '@/integrations/supabase/client';

/**
 * The operator's controls over the source-discovery crawl.
 *
 * Everything the crawl does is driven by a single editable config row, so the
 * depth, the budget, the per-host cap, the politeness delay and the countries
 * can be turned up and down live without a deploy — the operator wanted to try
 * 10, then 100, then 50 and watch what happens. No country is hardcoded here or
 * in the worker; allowed_countries is just data.
 */

export interface CrawlConfig {
  enabled: boolean;
  max_depth: number;
  max_pages_per_run: number;
  per_host_cap: number;
  delay_ms: number;
  auto_promote_min_score: number;
  strict_mode: boolean;
  allowed_countries: string[];
  exclude_url_prefixes: string[];
  exclude_substrings: string[];
  extra_allowed_hosts: string[];
  extra_seeds: string[];
  updated_at: string;
}

export interface CrawlRun {
  id: string;
  trigger: string;
  status: string;
  seed_count: number;
  pages_fetched: number;
  pages_not_modified: number;
  hosts_seen: number;
  candidates_found: number;
  auto_promoted: number;
  near_duplicates_skipped: number;
  errors: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  config_snapshot: Record<string, unknown>;
}

export interface CrawlPage {
  url: string;
  host: string;
  depth: number;
  http_status: number | null;
  outcome: string;
  word_count: number | null;
  title: string | null;
  is_listing: boolean;
  score: number | null;
  candidate_host: string | null;
  discovered_from_url: string | null;
  duration_ms: number | null;
  error_text: string | null;
  fetched_at: string;
}

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

export async function getCrawlConfig(): Promise<CrawlConfig | null> {
  const { data, error } = await rpc.rpc('admin_get_crawl_config');
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CrawlConfig) ?? null;
}

/** Sends only the fields given; the RPC leaves the rest untouched. */
export async function updateCrawlConfig(
  patch: Partial<CrawlConfig>,
): Promise<{ ok: true; config: CrawlConfig } | { ok: false; message: string }> {
  const { data, error } = await rpc.rpc('admin_update_crawl_config', {
    p_enabled: patch.enabled ?? null,
    p_max_depth: patch.max_depth ?? null,
    p_max_pages_per_run: patch.max_pages_per_run ?? null,
    p_per_host_cap: patch.per_host_cap ?? null,
    p_delay_ms: patch.delay_ms ?? null,
    p_auto_promote_min_score: patch.auto_promote_min_score ?? null,
    p_strict_mode: patch.strict_mode ?? null,
    p_allowed_countries: patch.allowed_countries ?? null,
    p_exclude_url_prefixes: patch.exclude_url_prefixes ?? null,
    p_exclude_substrings: patch.exclude_substrings ?? null,
    p_extra_allowed_hosts: patch.extra_allowed_hosts ?? null,
    p_extra_seeds: patch.extra_seeds ?? null,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes('CAPABILITY_REQUIRED')
        ? 'Ehhez providers.manage jogosultság kell.'
        : error.message.includes('crawl_config_sane')
          ? 'Valamelyik érték a megengedett tartományon kívül esik.'
          : 'A mentés nem sikerült.',
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, config: row as CrawlConfig };
}

export async function listCrawlRuns(limit = 15): Promise<CrawlRun[]> {
  const { data, error } = await rpc.rpc('admin_list_crawl_runs', { p_limit: limit });
  return error || !Array.isArray(data) ? [] : (data as CrawlRun[]);
}

export async function listCrawlPages(runId: string, limit = 200): Promise<CrawlPage[]> {
  const { data, error } = await rpc.rpc('admin_list_crawl_pages', { p_run_id: runId, p_limit: limit });
  return error || !Array.isArray(data) ? [] : (data as CrawlPage[]);
}

/** Dispatches a crawl run now, through the same control plane as a scrape run. */
export async function runCrawlNow(
  crawlPages?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await rpc.functions.invoke('scraper-control', {
    body: { action: 'run', crawl: true, crawl_pages: crawlPages && crawlPages > 0 ? crawlPages : undefined },
  });
  if (error || !(data as { dispatched?: boolean })?.dispatched) {
    return { ok: false, message: 'A crawl indítása nem sikerült.' };
  }
  return { ok: true };
}

/**
 * Parses a textarea of one-per-line values into a clean array, and back.
 * Kept here so the component and its tests agree on the round-trip.
 */
export function linesToArray(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function arrayToLines(values: string[] | null | undefined): string {
  return (values ?? []).join('\n');
}
