import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), functions: { invoke: vi.fn() } },
}));

import {
  listEventCities,
  listSafeDiscoverableEventsPage,
  listSafeExternalEventsPage,
} from '@/lib/eventOperations';

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { items: [], has_more: false, next_offset: null, offset: 0 }, error: null });
});

/**
 * The date range and the city were added to two RPCs that were already in use.
 * Omitting them has to mean exactly what it meant before, which is what these
 * assert: same call, NULL for the new arguments.
 */
describe('no regression when the new filters are not used', () => {
  it('external page sends NULL for the range and the city', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27' });
    expect(rpcMock).toHaveBeenCalledWith('list_external_events_safe_page', {
      p_from_date: '2026-08-27', p_limit: 48, p_offset: 0, p_to_date: null, p_city: null,
      p_countries: null,
    });
  });

  it('native page sends NULL for the range and the city', async () => {
    await listSafeDiscoverableEventsPage({ fromDate: '2026-08-27' });
    expect(rpcMock).toHaveBeenCalledWith('list_discoverable_events_safe_page', {
      p_from_date: '2026-08-27', p_requester_id: null, p_limit: 48, p_offset: 0,
      p_to_date: null, p_city: null,
    });
  });

  it('an empty string is sent as NULL, not as an empty filter', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27', toDate: '', city: '   ' });
    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_to_date).toBeNull();
    // A city of whitespace is a city the database would never match; the RPC
    // treats blank as "no filter" too, but the client should not send noise.
    expect(args.p_city).toBe('   ');
  });
});

describe('with the new filters', () => {
  it('passes a from-to range through', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-12-12', toDate: '2026-12-14', limit: 100 });
    expect(rpcMock).toHaveBeenCalledWith('list_external_events_safe_page', {
      p_from_date: '2026-12-12', p_limit: 100, p_offset: 0,
      p_to_date: '2026-12-14', p_city: null, p_countries: null,
    });
  });

  it('passes the city through', async () => {
    await listSafeDiscoverableEventsPage({ fromDate: '2026-08-27', city: 'Debrecen' });
    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_city).toBe('Debrecen');
  });

  it('still clamps the page size', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27', limit: 5000 });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_limit).toBe(100);
  });
});

describe('listEventCities', () => {
  it('keeps only rows that name a city', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { city: 'Budapest', events: 1024 },
        { city: '', events: 5 },
        { city: 'Debrecen', events: 61 },
      ],
      error: null,
    });
    expect(await listEventCities('2026-08-27')).toEqual([
      { city: 'Budapest', events: 1024, countryCode: null },
      { city: 'Debrecen', events: 61, countryCode: null },
    ]);
  });

  it('carries the country through when the RPC supplies it', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ city: 'Warszawa', events: 569, country_code: 'PL' }],
      error: null,
    });
    expect(await listEventCities('2026-08-27', ['PL'])).toEqual([
      { city: 'Warszawa', events: 569, countryCode: 'PL' },
    ]);
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toEqual(['PL']);
  });

  it('returns an empty list rather than throwing on a odd payload', async () => {
    rpcMock.mockResolvedValueOnce({ data: { nope: true }, error: null });
    expect(await listEventCities('2026-08-27')).toEqual([]);
  });
});

/**
 * v1.69.0 added the country filter. Omitting it must keep meaning "every
 * country", and an empty selection must not be sent as an empty array — the RPC
 * reads NULL as "no filter" and an empty array would be indistinguishable from
 * a deliberate "no countries at all".
 */
describe('country filter', () => {
  it('sends NULL when no country is selected', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27', countries: [] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toBeNull();
  });

  it('passes a selection through, uppercased and de-duplicated', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27', countries: ['hu', 'AT', 'hu'] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toEqual(['HU', 'AT']);
  });

  it('drops blank entries rather than sending them', async () => {
    await listSafeExternalEventsPage({ fromDate: '2026-08-27', countries: ['', '  ', 'PL'] });
    expect((rpcMock.mock.calls[0][1] as Record<string, unknown>).p_countries).toEqual(['PL']);
  });
});
