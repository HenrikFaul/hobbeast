import { describe, expect, it } from 'vitest';
import {
  applyQuery,
  countryLabel,
  distinctValues,
  frontierBucketOf,
  statusOf,
  type ScraperDestination,
} from '@/components/admin/scraperSources';

/**
 * The scraper source table's filter/sort pipeline. These pin the semantics an
 * operator relies on: OR inside one column, AND across columns, an empty
 * selection meaning "no filter", and type-appropriate ordering.
 */

function row(over: Partial<ScraperDestination> & { source_id: string }): ScraperDestination {
  return {
    publisher_name: 'X', endpoint_url: 'https://x.test/', city: null, country_code: 'HU',
    scrape_enabled: true, scrape_priority: 100, last_run_at: null, last_events: 0,
    total_events: 0, scrape_strategy: 'render', scrape_note: null, categories: [],
    access: 'ingyenes', active_events: 0, expired_events: 0,
    frontier_pending: null, frontier_done: null, frontier_error: null, frontier_events: null, ...over,
  };
}

const ROWS: ScraperDestination[] = [
  row({ source_id: 'a', publisher_name: 'A38', country_code: 'HU', total_events: 50, active_events: 5, categories: ['Koncert'], last_run_at: '2026-09-01T10:00:00Z', scrape_strategy: 'render', frontier_pending: 10, frontier_done: 40, frontier_error: 2, frontier_events: 35 }),
  row({ source_id: 'b', publisher_name: 'Ticketmaster PL', country_code: 'PL', total_events: 300, active_events: 0, categories: ['Koncert', 'Színház'], last_run_at: null, scrape_strategy: 'jsonld' }),
  row({ source_id: 'c', publisher_name: 'Prague.eu', country_code: 'CZ', total_events: 120, active_events: 9, categories: ['Fesztivál'], last_run_at: '2026-09-03T10:00:00Z', scrape_strategy: 'render', frontier_pending: 0, frontier_done: 120, frontier_error: 0, frontier_events: 200 }),
];

describe('statusOf', () => {
  it('derives the badge the table shows', () => {
    expect(statusOf(ROWS[0])).toBe('termel');          // has active events
    expect(statusOf(ROWS[1])).toBe('várakozik');        // never ran
    expect(statusOf(row({ source_id: 'd', active_events: 0, last_run_at: '2026-09-01T10:00:00Z' }))).toBe('nincs találat');
  });
});

describe('frontierBucketOf', () => {
  it('derives the three buckets the frontier filter offers', () => {
    expect(frontierBucketOf(ROWS[0])).toBe('van hátralék');   // URLs still pending
    expect(frontierBucketOf(ROWS[2])).toBe('kész');           // fetched, nothing pending
    expect(frontierBucketOf(ROWS[1])).toBe('nincs adat');     // nulls: the stats carry no frontier
    expect(frontierBucketOf(row({ source_id: 'd', frontier_pending: 0, frontier_done: 0 }))).toBe('nincs adat');
  });

  it('counts a pending backlog as backlog even when nothing is done yet', () => {
    expect(frontierBucketOf(row({ source_id: 'e', frontier_pending: 3, frontier_done: 0 }))).toBe('van hátralék');
  });
});

describe('distinctValues', () => {
  it('lists the countries present', () => {
    expect(distinctValues(ROWS, 'country_code')).toEqual(['CZ', 'HU', 'PL']);
  });

  it('offers the frontier as its three buckets', () => {
    expect(distinctValues(ROWS, 'frontier')).toEqual(['kész', 'nincs adat', 'van hátralék']);
  });

  it('flattens the categories array rather than treating it as one value', () => {
    expect(distinctValues(ROWS, 'categories')).toEqual(['Fesztivál', 'Koncert', 'Színház']);
  });

  it('turns the date column into a ran / never-ran choice', () => {
    expect(distinctValues(ROWS, 'last_run_at').sort()).toEqual(['futott már', 'még nem futott']);
  });
});

describe('filtering', () => {
  it('treats an empty selection as no filter at all', () => {
    expect(applyQuery(ROWS, '', {}, null)).toHaveLength(3);
    expect(applyQuery(ROWS, '', { country_code: new Set() }, null)).toHaveLength(3);
  });

  it('ORs the values chosen inside one column', () => {
    const out = applyQuery(ROWS, '', { country_code: new Set(['PL', 'CZ']) }, null);
    expect(out.map((r) => r.source_id).sort()).toEqual(['b', 'c']);
  });

  it('ANDs across different columns', () => {
    const out = applyQuery(ROWS, '', {
      country_code: new Set(['PL', 'CZ']),
      scrape_strategy: new Set(['render']),
    }, null);
    expect(out.map((r) => r.source_id)).toEqual(['c']);
  });

  it('matches a row when ANY of its categories is chosen', () => {
    const out = applyQuery(ROWS, '', { categories: new Set(['Színház']) }, null);
    expect(out.map((r) => r.source_id)).toEqual(['b']);
  });

  it('filters on the derived status', () => {
    expect(applyQuery(ROWS, '', { status: new Set(['várakozik']) }, null).map((r) => r.source_id)).toEqual(['b']);
  });

  it('filters on the frontier bucket', () => {
    expect(applyQuery(ROWS, '', { frontier: new Set(['van hátralék']) }, null).map((r) => r.source_id)).toEqual(['a']);
    expect(applyQuery(ROWS, '', { frontier: new Set(['kész']) }, null).map((r) => r.source_id)).toEqual(['c']);
    const rest = applyQuery(ROWS, '', { frontier: new Set(['kész', 'nincs adat']) }, null);
    expect(rest.map((r) => r.source_id).sort()).toEqual(['b', 'c']);
  });

  it('searches name, url and city with the free-text box', () => {
    expect(applyQuery(ROWS, 'prague', {}, null).map((r) => r.source_id)).toEqual(['c']);
    expect(applyQuery(ROWS, 'NINCS ILYEN', {}, null)).toEqual([]);
  });
});

describe('sorting', () => {
  it('orders numerically, not lexically, on event counts', () => {
    const asc = applyQuery(ROWS, '', {}, { key: 'total_events', dir: 'asc' });
    expect(asc.map((r) => r.total_events)).toEqual([50, 120, 300]);
    const desc = applyQuery(ROWS, '', {}, { key: 'total_events', dir: 'desc' });
    expect(desc.map((r) => r.total_events)).toEqual([300, 120, 50]);
  });

  it('orders dates chronologically and puts never-ran first ascending', () => {
    const asc = applyQuery(ROWS, '', {}, { key: 'last_run_at', dir: 'asc' });
    expect(asc.map((r) => r.source_id)).toEqual(['b', 'a', 'c']);
  });

  it('orders countries alphabetically', () => {
    const asc = applyQuery(ROWS, '', {}, { key: 'country_code', dir: 'asc' });
    expect(asc.map((r) => r.country_code)).toEqual(['CZ', 'HU', 'PL']);
  });

  it('orders the frontier numerically on done, nulls as zero', () => {
    const asc = applyQuery(ROWS, '', {}, { key: 'frontier', dir: 'asc' });
    expect(asc.map((r) => r.source_id)).toEqual(['b', 'a', 'c']);   // null -> 0, 40, 120
    const desc = applyQuery(ROWS, '', {}, { key: 'frontier', dir: 'desc' });
    expect(desc.map((r) => r.source_id)).toEqual(['c', 'a', 'b']);
  });

  it('breaks a frontier tie on done by the pending count', () => {
    const tie = [
      row({ source_id: 'p', frontier_done: 40, frontier_pending: 5 }),
      row({ source_id: 'q', frontier_done: 40, frontier_pending: 25 }),
      row({ source_id: 'r', frontier_done: 9, frontier_pending: 999 }),
    ];
    const desc = applyQuery(tie, '', {}, { key: 'frontier', dir: 'desc' });
    expect(desc.map((r) => r.source_id)).toEqual(['q', 'p', 'r']);
    const asc = applyQuery(tie, '', {}, { key: 'frontier', dir: 'asc' });
    expect(asc.map((r) => r.source_id)).toEqual(['r', 'p', 'q']);
  });

  it('does not mutate the input array', () => {
    const before = ROWS.map((r) => r.source_id);
    applyQuery(ROWS, '', {}, { key: 'total_events', dir: 'desc' });
    expect(ROWS.map((r) => r.source_id)).toEqual(before);
  });

  it('combines a filter with a sort', () => {
    const out = applyQuery(ROWS, '', { scrape_strategy: new Set(['render']) }, { key: 'active_events', dir: 'desc' });
    expect(out.map((r) => r.source_id)).toEqual(['c', 'a']);
  });
});

describe('countryLabel', () => {
  it('renders a readable label for known codes and falls back otherwise', () => {
    expect(countryLabel('HU')).toContain('Magyarország');
    expect(countryLabel('PL')).toContain('Lengyelország');
    expect(countryLabel('XX')).toBe('XX');
    expect(countryLabel(null)).toBe('—');
  });
});
