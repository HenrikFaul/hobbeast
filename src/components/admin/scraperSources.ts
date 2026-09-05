/**
 * Pure data logic behind the scraper source table: the row shape, the labels,
 * and the filter/sort pipeline. Kept out of the component file so the table
 * stays a single-export module (react-refresh) and so this can be unit-tested
 * without rendering anything.
 */

export interface ScraperDestination {
  source_id: string;
  publisher_name: string;
  endpoint_url: string;
  city: string | null;
  country_code: string | null;
  scrape_enabled: boolean;
  scrape_priority: number;
  last_run_at: string | null;
  last_events: number;
  total_events: number;
  scrape_strategy: string | null;
  scrape_note: string | null;
  categories: string[] | null;
  access: string;
  active_events: number;
  expired_events: number;
}

export const STRATEGY_LABELS: Record<string, string> = {
  render: 'böngészős',
  rss: 'hírfolyam',
  tribe: 'esemény-API',
  site: 'egyedi adapter',
  ics: 'naptár-feed',
  'wp-ics-calendar': 'naptár-rács',
  jsonld: 'strukturált adat',
  'wp-posts': 'cikkekből',
  'page-prose': 'egy esemény oldala',
};

const COUNTRY_LABELS: Record<string, string> = {
  HU: '🇭🇺 Magyarország',
  CZ: '🇨🇿 Csehország',
  SK: '🇸🇰 Szlovákia',
  PL: '🇵🇱 Lengyelország',
  AT: '🇦🇹 Ausztria',
  SI: '🇸🇮 Szlovénia',
};

export function countryLabel(code: string | null): string {
  if (!code) return '—';
  return COUNTRY_LABELS[code] ?? code;
}

export type SortKey =
  | 'publisher_name' | 'country_code' | 'scrape_strategy' | 'categories'
  | 'access' | 'last_run_at' | 'total_events' | 'active_events' | 'status';

export type SortDir = 'asc' | 'desc';

/** The badge text the old table derived inline; now also a filterable value. */
export function statusOf(d: ScraperDestination): string {
  if (d.active_events > 0) return 'termel';
  return d.last_run_at ? 'nincs találat' : 'várakozik';
}

/** The distinct values a categorical column offers, in display order. */
export function distinctValues(rows: ScraperDestination[], key: SortKey): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (key === 'categories') {
      for (const c of row.categories ?? []) seen.add(c);
    } else if (key === 'status') {
      seen.add(statusOf(row));
    } else if (key === 'scrape_strategy') {
      seen.add(row.scrape_strategy || 'render');
    } else if (key === 'country_code') {
      if (row.country_code) seen.add(row.country_code);
    } else if (key === 'last_run_at') {
      seen.add(row.last_run_at ? 'futott már' : 'még nem futott');
    } else {
      const v = row[key as keyof ScraperDestination];
      if (typeof v === 'string' && v) seen.add(v);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'hu'));
}

/** Does one row satisfy one column's selected values? An empty set means "no filter". */
function matchesColumn(row: ScraperDestination, key: SortKey, chosen: Set<string>): boolean {
  if (chosen.size === 0) return true;
  if (key === 'categories') return (row.categories ?? []).some((c) => chosen.has(c));
  if (key === 'status') return chosen.has(statusOf(row));
  if (key === 'scrape_strategy') return chosen.has(row.scrape_strategy || 'render');
  if (key === 'country_code') return row.country_code ? chosen.has(row.country_code) : false;
  if (key === 'last_run_at') return chosen.has(row.last_run_at ? 'futott már' : 'még nem futott');
  const v = row[key as keyof ScraperDestination];
  return typeof v === 'string' ? chosen.has(v) : false;
}

/** Compare two rows on a column, typed by what the column holds. */
function compare(a: ScraperDestination, b: ScraperDestination, key: SortKey): number {
  switch (key) {
    case 'total_events':
      return a.total_events - b.total_events;
    case 'active_events':
      return a.active_events - b.active_events;
    case 'last_run_at': {
      const av = a.last_run_at ? Date.parse(a.last_run_at) : -Infinity;
      const bv = b.last_run_at ? Date.parse(b.last_run_at) : -Infinity;
      return av - bv;
    }
    case 'categories':
      return (a.categories?.length ?? 0) - (b.categories?.length ?? 0);
    case 'status':
      return statusOf(a).localeCompare(statusOf(b), 'hu');
    case 'scrape_strategy':
      return (a.scrape_strategy || 'render').localeCompare(b.scrape_strategy || 'render', 'hu');
    case 'country_code':
      return (a.country_code ?? '').localeCompare(b.country_code ?? '', 'hu');
    default:
      return String(a[key as keyof ScraperDestination] ?? '')
        .localeCompare(String(b[key as keyof ScraperDestination] ?? ''), 'hu');
  }
}

/** Pure pipeline: text query -> per-column multi-selects -> sort. Exported for tests. */
export function applyQuery(
  rows: ScraperDestination[],
  query: string,
  filters: Record<string, Set<string>>,
  sort: { key: SortKey; dir: SortDir } | null,
): ScraperDestination[] {
  const q = query.trim().toLowerCase();
  let out = rows.filter((row) => {
    if (q && !(`${row.publisher_name} ${row.endpoint_url} ${row.city ?? ''}`.toLowerCase().includes(q))) return false;
    for (const [key, chosen] of Object.entries(filters)) {
      if (!matchesColumn(row, key as SortKey, chosen)) return false;
    }
    return true;
  });
  if (sort) {
    const factor = sort.dir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => compare(a, b, sort.key) * factor);
  }
  return out;
}
