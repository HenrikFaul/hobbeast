import { describe, expect, it } from 'vitest';
import { normalizeCircleVenueSearchContext } from '@/features/community/eventPlanning';

describe('Circle venue planning contract', () => {
  it('accepts only a k-anonymous coarse context and strips private fields', () => {
    const context = normalizeCircleVenueSearchContext({
      available: true,
      privacy_mode: 'coarse_k_anonymous',
      threshold: 3,
      contributor_count: 4,
      center: { lat: 47.5, lon: 19.1 },
      city: 'Budapest',
      max_travel_distance_km: 15,
      reason_codes: ['explicit_location_consent', 'coarse_group_center', 'member_ids'],
      member_ids: ['private'],
      exact_coordinates: [[47.4979, 19.0402]],
    });
    expect(context).toMatchObject({
      available: true,
      contributorCount: 4,
      center: { lat: 47.5, lon: 19.1 },
      city: 'Budapest',
      maxTravelDistanceKm: 15,
      reasonCodes: ['explicit_location_consent', 'coarse_group_center'],
    });
    expect(JSON.stringify(context)).not.toMatch(/member_ids|exact_coordinates|private|47\.4979/);
  });

  it('fails closed below the privacy threshold or without valid coordinates', () => {
    expect(normalizeCircleVenueSearchContext({
      available: true, contributor_count: 2, center: { lat: 47.5, lon: 19.1 },
    })).toMatchObject({ available: false, contributorCount: 0, center: null });
    expect(normalizeCircleVenueSearchContext({
      available: true, contributor_count: 3, center: { lat: 999, lon: 19.1 },
    })).toMatchObject({ available: false, contributorCount: 0, center: null });
  });
});
