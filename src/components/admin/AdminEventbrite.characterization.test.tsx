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

  it('keeps the four provider cards and the initial configuration load contract', async () => {
    await renderAdminEventbrite();

    expect(Array.from(document.querySelectorAll('[role="tab"]')).map((item) => item.textContent)).toEqual([
      'Eventbrite', 'Ticketmaster', 'SeatGeek', 'Címkereső',
    ]);
    expect(document.body.textContent).toContain('Eventbrite integráció');
    expect(button('Keresés')).toBeDefined();
    expect(button('Token teszt')).toBeDefined();
    expect(button('Szervezeti események')).toBeDefined();
    expect(providerMocks.getAllFunctionGroupProviders).toHaveBeenCalledOnce();
    expect(providerMocks.getDbSearchTableConfigs).toHaveBeenCalledWith(true);
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
