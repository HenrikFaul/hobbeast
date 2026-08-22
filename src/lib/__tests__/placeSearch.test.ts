import { describe, expect, it } from 'vitest';
import { coerceStringArray, derivePlaceSourceId, isValidCoordinate, mapEdgePlace, normalizeText, safeNumber } from '@/lib/placeSearch';

/**
 * Sprint 2 characterization test.
 *
 * Locks in the current normalization contract for rows returned by the
 * `place-search` edge function so future refactors (AdminEventbrite split,
 * provider config cleanup) cannot silently change the shape consumers
 * depend on.
 */
describe('mapEdgePlace', () => {
  it('normalizes a full Geoapify row', () => {
    const place = mapEdgePlace({
      provider: 'geoapify',
      external_id: 'geo-123',
      name: 'Kávézó',
      address: 'Fő utca 1, Budapest',
      city: 'Budapest',
      district: 'V. kerület',
      postal_code: '1051',
      latitude: 47.4979,
      longitude: 19.0402,
      categories: ['catering.cafe'],
      metadata: { country: 'Hungary' },
    });

    expect(place).toMatchObject({
      id: 'geoapify-geo-123',
      name: 'Kávézó',
      city: 'Budapest',
      district: 'V. kerület',
      country: 'Hungary',
      postcode: '1051',
      lat: 47.4979,
      lon: 19.0402,
      source: 'geoapify',
      sourceId: 'geo-123',
    });
    expect(place.categories).toEqual(['catering.cafe']);
  });

  it('falls back to metadata and defaults for a sparse TomTom row', () => {
    const place = mapEdgePlace({
      provider: 'tomtom',
      metadata: { name: 'Névtelen', formatted_address: 'Ismeretlen cím' },
    });

    expect(place.name).toBe('Névtelen');
    expect(place.address).toBe('Ismeretlen cím');
    expect(place.country).toBe('Hungary');
    expect(place.source).toBe('tomtom');
    expect(place.id.startsWith('tomtom-')).toBe(true);
    expect(place.confidence).toBeGreaterThan(0);
  });

  it('uses a stable derived identity instead of a random UUID when a provider ID is absent', () => {
    const row = {
      provider: 'tomtom',
      name: 'Közösségi tér',
      address: 'Fő utca 1',
      city: 'Budapest',
      latitude: 47.5,
      longitude: 19.05,
    };
    const first = mapEdgePlace(row);
    const second = mapEdgePlace(row);
    expect(first.sourceId).toBe(second.sourceId);
    expect(first.sourceId).toMatch(/^derived-[0-9a-f]{8}$/);
    expect(derivePlaceSourceId(['A', 1])).toBe(derivePlaceSourceId(['A', 1]));
  });

  it('clamps rating into a 0.4–1 confidence band', () => {
    expect(mapEdgePlace({ provider: 'geoapify', id: 'a', rating: 5 }).confidence).toBe(1);
    expect(mapEdgePlace({ provider: 'geoapify', id: 'b', rating: 0 }).confidence).toBe(0.4);
  });
});

describe('normalizeText (characterization)', () => {
  it('trims string input', () => {
    expect(normalizeText('  Budapest  ')).toBe('Budapest');
  });

  it('coerces null/undefined to empty string', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('stringifies non-string primitives', () => {
    expect(normalizeText(42)).toBe('42');
    expect(normalizeText(false)).toBe('false');
  });
});

describe('safeNumber (characterization)', () => {
  it('returns the first finite number', () => {
    expect(safeNumber('abc', 12, '7')).toBe(12);
  });

  it('falls back through multiple non-finite values to 0', () => {
    expect(safeNumber('abc', undefined, NaN)).toBe(0);
  });
});

describe('isValidCoordinate (characterization)', () => {
  it('accepts valid Budapest coordinates', () => {
    expect(isValidCoordinate(47.4979, 19.0402)).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
  });

  it('rejects null-island (0,0)', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isValidCoordinate(NaN, 19)).toBe(false);
    expect(isValidCoordinate(47, Infinity)).toBe(false);
  });
});

describe('coerceStringArray (characterization)', () => {
  it('maps an array of values trim + drops empties', () => {
    expect(coerceStringArray([' a ', '', 'b'])).toEqual(['a', 'b']);
  });

  it('wraps a non-empty string into a single-element array', () => {
    expect(coerceStringArray('catering.cafe')).toEqual(['catering.cafe']);
  });

  it('returns [] for empty string / null / undefined', () => {
    expect(coerceStringArray('')).toEqual([]);
    expect(coerceStringArray(null)).toEqual([]);
    expect(coerceStringArray(undefined)).toEqual([]);
  });

  it('flattens a truthy object into key[:value] entries', () => {
    expect(coerceStringArray({ cafe: true, beer: 'yes' })).toEqual(['cafe', 'beer:yes']);
  });
});
