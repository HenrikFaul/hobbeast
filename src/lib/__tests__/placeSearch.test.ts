import { describe, expect, it } from 'vitest';
import { mapEdgePlace } from '@/lib/placeSearch';

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

  it('clamps rating into a 0.4–1 confidence band', () => {
    expect(mapEdgePlace({ provider: 'geoapify', id: 'a', rating: 5 }).confidence).toBe(1);
    expect(mapEdgePlace({ provider: 'geoapify', id: 'b', rating: 0 }).confidence).toBe(0.4);
  });
});
