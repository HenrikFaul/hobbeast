import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const eventbriteMocks = vi.hoisted(() => ({
  searchEventbriteEvents: vi.fn(),
  fetchEventbriteOrganizations: vi.fn(),
  fetchEventbriteEvents: vi.fn(),
}));

const ticketmasterMocks = vi.hoisted(() => ({
  previewTicketmasterEvents: vi.fn(),
  syncTicketmasterEvents: vi.fn(),
}));

const seatGeekMocks = vi.hoisted(() => ({
  previewSeatGeekEvents: vi.fn(),
  syncSeatGeekEvents: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  setAddressSearchProvider: vi.fn(),
  getAllFunctionGroupProviders: vi.fn(),
  getDbSearchTableConfigs: vi.fn(),
  saveDbSearchTableConfigs: vi.fn(),
  testDbSearchTableQuery: vi.fn(),
  discoverDbSearchTableFacets: vi.fn(),
}));

const placeMocks = vi.hoisted(() => ({ searchPlaces: vi.fn() }));
const edgeMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/lib/eventbrite', () => eventbriteMocks);
vi.mock('@/lib/external-events/ticketmaster', () => ticketmasterMocks);
vi.mock('@/lib/external-events/seatgeek', () => seatGeekMocks);
vi.mock('@/lib/searchProviderConfig', async () => {
  const actual = await vi.importActual<typeof import('@/lib/searchProviderConfig')>('@/lib/searchProviderConfig');
  return { ...actual, ...providerMocks };
});
vi.mock('@/lib/placeSearch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/placeSearch')>('@/lib/placeSearch');
  return { ...actual, ...placeMocks };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: edgeMocks.invoke } },
}));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { AdminEventbrite } from './AdminEventbrite';

let container: HTMLDivElement;
let root: Root;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([role="tab"])'))
    .find((candidate) => candidate.textContent?.trim() === label);
}

function tab(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
}

async function activateTab(label: string) {
  await act(async () => {
    tab(label)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await flushEffects();
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('AdminEventbrite safe-refactor characterization', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    providerMocks.getAllFunctionGroupProviders.mockResolvedValue({
      default: 'aws',
      personal: 'aws',
      venue: 'geoapify_tomtom',
      trip_planner: 'mapy',
    });
    providerMocks.getDbSearchTableConfigs.mockResolvedValue({ tables: [] });
    providerMocks.saveDbSearchTableConfigs.mockImplementation(async (tables: unknown[]) => ({ tables }));
    providerMocks.discoverDbSearchTableFacets.mockResolvedValue({
      table: 'public.unified_pois',
      label: 'Unified POI',
      categories: [{ value: 'catering.cafe', label: 'catering.cafe', count: 4 }],
      sources: [{ value: 'geoapify', label: 'geoapify', count: 4 }],
      rowCount: 4,
      sampleSize: 4,
      diagnostics: { tableReachable: true, hasAnyRows: true },
    });
    providerMocks.setAddressSearchProvider.mockResolvedValue(undefined);
    eventbriteMocks.searchEventbriteEvents.mockResolvedValue({ events: [] });
    eventbriteMocks.fetchEventbriteOrganizations.mockResolvedValue({ organizations: [] });
    eventbriteMocks.fetchEventbriteEvents.mockResolvedValue({ events: [] });
    ticketmasterMocks.previewTicketmasterEvents.mockResolvedValue({ events: [] });
    ticketmasterMocks.syncTicketmasterEvents.mockResolvedValue({ synced: 0 });
    seatGeekMocks.previewSeatGeekEvents.mockResolvedValue({ events: [] });
    seatGeekMocks.syncSeatGeekEvents.mockResolvedValue({ synced: 0 });
    placeMocks.searchPlaces.mockResolvedValue([]);
    edgeMocks.invoke.mockResolvedValue({ data: { ok: true, config: { webhook_id: null } }, error: null });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAdminEventbrite() {
    await act(async () => root.render(<AdminEventbrite />));
    await flushEffects();
  }

  it('keeps the four provider cards, adds Feedek and preserves the initial configuration load contract', async () => {
    await renderAdminEventbrite();

    expect(Array.from(document.querySelectorAll('[role="tab"]')).map((item) => item.textContent)).toEqual([
      'Eventbrite', 'Ticketmaster', 'SeatGeek', 'Címkereső', 'Feedek',
    ]);
    expect(document.body.textContent).toContain('Eventbrite integráció');
    expect(button('Keresés')).toBeDefined();
    expect(button('Token teszt')).toBeDefined();
    expect(button('Szervezeti események')).toBeDefined();
    expect(providerMocks.getAllFunctionGroupProviders).toHaveBeenCalledOnce();
    expect(providerMocks.getDbSearchTableConfigs).toHaveBeenCalledWith(true);
    expect(edgeMocks.invoke).not.toHaveBeenCalledWith('event-feed-ingest', expect.anything());
  });

  it('loads feed status lazily and keeps probe, sync, approve and disable on the event-feed-ingest contract', async () => {
    const sourceId = 'src_1234abcd';
    edgeMocks.invoke.mockImplementation(async (functionName: string, options?: { body?: Record<string, unknown> }) => {
      if (functionName !== 'event-feed-ingest') return { data: null, error: null };
      const action = options?.body?.action;
      if (action === 'status') {
        return {
          data: {
            summary: { total: 1, pending_review: 1, approved: 0, enabled: 0, healthy: 1, quarantined_items: 2 },
            sources: [{
              source_id: sourceId,
              publisher_name: 'Budapest Közösségi Ház',
              format: 'rss',
              city: 'Budapest',
              endpoint_url: 'https://events.example.test/feed.xml',
              fetch_hosts: ['events.example.test'],
              health_status: 'healthy',
              review_state: 'pending_review',
              legal_review_status: 'pending',
              robots_allowed: false,
              enabled: false,
              poll_interval_minutes: 1440,
              min_publish_quality: 80,
              last_successful_parse_at: '2026-08-25T08:00:00.000Z',
              next_poll_at: '2026-08-26T08:00:00.000Z',
            }],
            runs: [{
              id: 'run-1',
              source_id: sourceId,
              action: 'probe',
              status: 'succeeded',
              discovered_count: 3,
              quarantined_count: 1,
              published_count: 0,
              duplicate_count: 1,
              started_at: '2026-08-25T08:00:00.000Z',
              finished_at: '2026-08-25T08:00:02.000Z',
            }],
          },
          error: null,
        };
      }
      if (action === 'probe_source' || action === 'sync_source') {
        return {
          data: { ok: true, results: [{ source_id: sourceId, status: 'succeeded', discovered: 3, quarantined: 1, published: 1 }] },
          error: null,
        };
      }
      if (action === 'review_source') return { data: { ok: true, source: { source_id: sourceId } }, error: null };
      return { data: { error: 'UNEXPECTED_ACTION' }, error: null };
    });

    await renderAdminEventbrite();
    expect(edgeMocks.invoke).not.toHaveBeenCalledWith('event-feed-ingest', expect.anything());
    await activateTab('Feedek');
    await flushEffects();

    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'status', page: 1, limit: 20 },
    });
    expect(document.body.textContent).toContain('Budapest Közösségi Ház');
    expect(document.body.textContent).toContain('RSS');
    expect(document.body.textContent).toContain('Utolsó siker');
    expect(document.body.textContent).toContain('Következő poll');
    expect(document.body.textContent).toContain('Nem aktív');
    expect(document.body.textContent).not.toContain('Auditált · aktív');
    expect(document.body.textContent).toContain('3 észlelt · 1 karantén · 0 publikálási számláló · 1 duplikátum');
    expect(document.body.textContent).toContain('önmagukban nem jelentik, hogy a forrás auditált, aktív vagy nyilvánosan publikáló');

    const approveButton = button('Jóváhagyás');
    const disableButton = button('Kikapcsolás');
    expect(approveButton?.disabled).toBe(true);
    expect(disableButton?.disabled).toBe(true);

    await act(async () => button('Próba')?.click());
    await flushEffects();
    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'probe_source', source_id: sourceId },
    });

    await act(async () => button('Szinkron')?.click());
    await flushEffects();
    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'sync_source', source_id: sourceId },
    });

    const reason = document.querySelector<HTMLInputElement>('input[aria-label="Feed művelet indoklása"]');
    const host = document.querySelector<HTMLInputElement>('input[aria-label="Budapest Közösségi Ház exact fetch host"]');
    const legalReview = document.querySelector<HTMLButtonElement>('[aria-label="Budapest Közösségi Ház jogi ellenőrzése jóváhagyva"]');
    const robotsAllowed = document.querySelector<HTMLButtonElement>('[aria-label="Budapest Közösségi Ház robots engedélyezve"]');
    const enable = document.querySelector<HTMLButtonElement>('[aria-label="Budapest Közösségi Ház feed engedélyezése jóváhagyáskor"]');
    expect(reason).not.toBeNull();
    expect(host?.value).toBe('events.example.test');
    expect(legalReview?.getAttribute('aria-checked')).toBe('false');
    expect(robotsAllowed?.getAttribute('aria-checked')).toBe('false');
    setControlValue(reason!, 'Robots és jogi ellenőrzés rendben');
    expect(button('Jóváhagyás')?.disabled).toBe(true);

    await act(async () => {
      legalReview?.click();
      robotsAllowed?.click();
      enable?.click();
    });
    expect(button('Jóváhagyás')?.disabled).toBe(false);

    await act(async () => button('Jóváhagyás')?.click());
    await flushEffects();
    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: expect.objectContaining({
        action: 'review_source',
        source_id: sourceId,
        decision: 'approved',
        reason: 'Robots és jogi ellenőrzés rendben',
        enable: true,
        fetch_hosts: ['events.example.test'],
        legal_review_status: 'approved',
        robots_allowed: true,
        poll_interval_minutes: 1440,
        min_publish_quality: 80,
        request_id: expect.any(String),
        idempotency_key: expect.stringContaining(`feed-review:${sourceId}:approved:`),
      }),
    });

    setControlValue(reason!, 'Forrás ideiglenesen kikapcsolva');
    await act(async () => button('Kikapcsolás')?.click());
    await flushEffects();
    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: expect.objectContaining({
        action: 'review_source',
        source_id: sourceId,
        decision: 'disabled',
        reason: 'Forrás ideiglenesen kikapcsolva',
      }),
    });
  });

  it('reaches every feed registry page and applies publisher search on the server', async () => {
    edgeMocks.invoke.mockImplementation(async (functionName: string, options?: { body?: Record<string, unknown> }) => {
      if (functionName !== 'event-feed-ingest' || options?.body?.action !== 'status') {
        return { data: { ok: true }, error: null };
      }
      const page = Number(options.body.page || 1);
      const query = typeof options.body.query === 'string' ? options.body.query : '';
      const filtered = Boolean(query);
      return {
        data: {
          summary: { total: 185, pending_review: 185, approved: 0, enabled: 0, healthy: 0, quarantined_items: 0 },
          sources: [{
            source_id: page === 10 ? 'src_00000010' : 'src_00000001',
            publisher_name: filtered ? 'Budapest Park' : `Registry oldal ${page}`,
            format: 'rss',
            city: 'Budapest',
            health_status: 'unknown',
            review_state: 'pending_review',
            legal_review_status: 'pending',
            robots_allowed: false,
            enabled: false,
            poll_interval_minutes: 1440,
            min_publish_quality: 80,
          }],
          runs: [],
          pagination: { page, limit: 20, total: filtered ? 1 : 185 },
        },
        error: null,
      };
    });

    await renderAdminEventbrite();
    await activateTab('Feedek');
    await flushEffects();

    expect(document.body.textContent).toContain('1 / 10. oldal');
    await act(async () => button('Utolsó')?.click());
    await flushEffects();
    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'status', page: 10, limit: 20 },
    });
    expect(document.body.textContent).toContain('Registry oldal 10');
    expect(document.body.textContent).toContain('10 / 10. oldal');

    const queryInput = document.querySelector<HTMLInputElement>('#event-feed-source-search');
    const searchButton = document.querySelector<HTMLButtonElement>('form[role="search"] button[type="submit"]');
    expect(queryInput).not.toBeNull();
    expect(searchButton).not.toBeNull();
    setControlValue(queryInput!, 'Budapest Park');
    await act(async () => searchButton?.click());
    await flushEffects();

    expect(edgeMocks.invoke).toHaveBeenCalledWith('event-feed-ingest', {
      body: { action: 'status', page: 1, limit: 20, query: 'Budapest Park' },
    });
    expect(document.body.textContent).toContain('Budapest Park');
    expect(document.body.textContent).toContain('„Budapest Park” · 1–1 / 1 találat');
  });

  it('keeps Eventbrite loading disabled-state, normalized result rendering and visible error state', async () => {
    let resolveSearch: ((value: unknown) => void) | undefined;
    eventbriteMocks.searchEventbriteEvents.mockReturnValueOnce(new Promise((resolve) => {
      resolveSearch = resolve;
    }));
    await renderAdminEventbrite();

    act(() => button('Keresés')?.click());
    expect(button('Keresés')?.disabled).toBe(true);

    await act(async () => resolveSearch?.({
      events: [{
        id: 'eventbrite-1',
        title: 'Budapest Meetup',
        event_date: '2026-09-01',
        location_city: 'Budapest',
        image_emoji: '🎟️',
        category: 'Közösség',
        eventbrite_url: 'https://example.test/event',
      }],
    }));
    await flushEffects();
    expect(button('Keresés')?.disabled).toBe(false);
    expect(document.body.textContent).toContain('1 esemény betöltve');
    expect(document.body.textContent).toContain('Budapest Meetup');

    eventbriteMocks.searchEventbriteEvents.mockRejectedValueOnce(new Error('EVENTBRITE_DOWN'));
    await act(async () => button('Keresés')?.click());
    await flushEffects();
    expect(document.body.textContent).toContain('EVENTBRITE_DOWN');
  });

  it('keeps Ticketmaster preview and sync as one provider-specific workflow', async () => {
    ticketmasterMocks.previewTicketmasterEvents.mockResolvedValue({
      events: [{
        external_source: 'ticketmaster',
        external_id: 'tm-1',
        external_url: 'https://example.test/tm',
        title: 'Universe Concert',
        category: 'Music',
        subcategory: 'Concert',
        tags: ['live'],
        description: null,
        event_date: '2026-10-01',
        event_time: '19:00',
        location_type: 'address',
        location_city: 'Budapest',
        location_address: 'Arena',
        location_free_text: null,
        location_lat: null,
        location_lon: null,
        price_min: null,
        price_max: null,
        currency: null,
        is_free: null,
        max_attendees: null,
        image_url: null,
        organizer_name: null,
        source_payload: {},
        source_last_synced_at: '2026-08-23T00:00:00.000Z',
        freshness_state: 'fresh',
        normalization_version: 'v1',
      }],
    });
    ticketmasterMocks.syncTicketmasterEvents.mockResolvedValue({ synced: 1 });
    await renderAdminEventbrite();
    await activateTab('Ticketmaster');

    await act(async () => button('Előnézet')?.click());
    await flushEffects();
    expect(ticketmasterMocks.previewTicketmasterEvents).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'Budapest',
      countryCode: 'HU',
      source: 'ticketmaster',
    }));
    expect(document.body.textContent).toContain('Universe Concert');

    await act(async () => button('Import adatbázisba')?.click());
    await flushEffects();
    expect(ticketmasterMocks.syncTicketmasterEvents).toHaveBeenCalledWith(expect.objectContaining({ maxPages: 2 }));
    expect(ticketmasterMocks.previewTicketmasterEvents).toHaveBeenCalledTimes(2);
  });

  it('keeps provider config, DB run status and realtime column filtering together', async () => {
    providerMocks.testDbSearchTableQuery.mockResolvedValue({
      results: [
        { provider: 'db', external_id: '1', name: 'Alpha Café', city: 'Budapest', category: 'cafe' },
        { provider: 'db', external_id: '2', name: 'Beta Park', city: 'Budapest', category: 'park' },
      ],
      rows: [
        { id: '1', name: 'Alpha Café', city: 'Budapest' },
        { id: '2', name: 'Beta Park', city: 'Budapest' },
      ],
      columns: ['id', 'name', 'city'],
      totalCount: 2,
      debug: { response_ms: 42 },
    });
    await renderAdminEventbrite();
    await activateTab('Címkereső');

    expect(document.body.textContent).toContain('Címkereső provider — funkció csoportonként');
    expect(document.body.textContent).toContain('Adatbázistábla kapcsolat');
    expect(document.body.textContent).toContain('Személyes cím (profil, távolság)');
    expect(providerMocks.discoverDbSearchTableFacets).toHaveBeenCalled();

    await act(async () => button('Mentés')?.click());
    await flushEffects();
    expect(providerMocks.setAddressSearchProvider).toHaveBeenCalledWith('aws', 'default');

    await act(async () => button('Lekérdezés')?.click());
    await flushEffects();
    expect(providerMocks.testDbSearchTableQuery).toHaveBeenCalledWith(expect.objectContaining({
      table: 'public.unified_pois',
      city: 'Budapest',
    }));
    expect(document.body.textContent).toContain('2 találat / 2 látható sor / 2 sor lekérve');

    const nameFilter = document.querySelector<HTMLInputElement>('input[placeholder="name szűrés..."]');
    expect(nameFilter).not.toBeNull();
    setControlValue(nameFilter!, 'Alpha');
    expect(document.body.textContent).toContain('2 találat / 1 látható sor / 2 sor lekérve');

    providerMocks.testDbSearchTableQuery.mockRejectedValueOnce(new Error('DB_QUERY_DENIED'));
    await act(async () => button('Lekérdezés')?.click());
    await flushEffects();
    expect(document.body.textContent).toContain('A lekérdezés nem sikerült');
    expect(document.body.textContent).toContain('DB_QUERY_DENIED');
  });
});
