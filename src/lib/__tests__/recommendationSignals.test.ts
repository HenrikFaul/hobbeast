import { describe, expect, it } from 'vitest';
import { normalizeNativeRecommendationSignals } from '@/lib/recommendationSignals';

describe('native recommendation signal contract', () => {
  it('keeps only allowlisted, privacy-safe server fields and reason codes', () => {
    const rows = normalizeNativeRecommendationSignals([{
      event_id: '95000000-0000-4000-8000-000000000001',
      ranking_score: 84.125,
      reason_codes: ['explicit_interest', 'nearby', 'friend_count', 'fits_availability'],
      distance_km: 4,
      attended_similar: true,
      availability_match: true,
      host_reliability: 0.8,
      exposure_share: 0.2,
      impression_count: 12,
      user_id: 'must-not-survive',
      exact_latitude: 47.4979,
    }]);

    expect(rows).toEqual([{
      eventId: '95000000-0000-4000-8000-000000000001',
      rankingScore: 84.125,
      reasonCodes: ['explicit_interest', 'nearby', 'fits_availability'],
      distanceKm: 4,
      attendedSimilar: true,
      availabilityMatch: true,
      hostReliability: 0.8,
      exposureShare: 0.2,
      impressionCount: 12,
    }]);
    expect(JSON.stringify(rows)).not.toMatch(/user_id|latitude|must-not-survive/);
  });

  it('rejects malformed identities and bounds numeric provider values', () => {
    expect(normalizeNativeRecommendationSignals([{ event_id: 'not-a-uuid' }])).toEqual([]);
    const [row] = normalizeNativeRecommendationSignals([{
      event_id: '95000000-0000-4000-8000-000000000001',
      ranking_score: 9999,
      reason_codes: [],
      host_reliability: -3,
      exposure_share: 9,
      impression_count: -1,
    }]);
    expect(row).toMatchObject({ rankingScore: 200, hostReliability: 0, exposureShare: 1, impressionCount: 0 });
  });
});
