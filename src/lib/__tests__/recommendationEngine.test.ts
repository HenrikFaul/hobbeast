import { describe, expect, it } from 'vitest';
import {
  buildCanonicalEventIdentity,
  dedupeRecommendationCandidates,
  diversityRerank,
  evaluateRecommendationReplay,
  rankRecommendations,
  scoreRecommendation,
  upsertDiscoveryFeedback,
  type RecommendationCandidate,
} from '@/lib/recommendationEngine';

const base: RecommendationCandidate = {
  id: '1',
  canonicalIdentity: 'native:1',
  source: 'native',
  title: 'Kezdő túra',
  category: 'Túra',
  city: 'Budapest',
  startsAt: '2026-08-24T09:00:00Z',
  beginnerFriendly: true,
  hostReliability: 0.8,
  freshness: 0.9,
  marketplaceExposure: 0.2,
};

describe('recommendation engine', () => {
  it('builds stable provider identities and normalized fallback identities', () => {
    expect(buildCanonicalEventIdentity({ provider: 'Ticketmaster', externalId: 'A-1', title: 'Ignored' })).toBe('ticketmaster:a-1');
    expect(buildCanonicalEventIdentity({ title: 'Árvíztűrő Túra', startsAt: '2026-08-24T09:00:00Z', city: 'Pécs' })).toBe('arvizturo tura|2026-08-24T09:00|pecs');
  });

  it('is deterministic for the same fixture', () => {
    const context = { explicitInterests: ['túra'], preferredCity: 'Budapest', now: new Date('2026-08-22T09:00:00Z') };
    expect(rankRecommendations([base], context)).toEqual(rankRecommendations([base], context));
  });

  it('returns privacy-safe reason codes without people counts', () => {
    const result = scoreRecommendation(base, { explicitInterests: ['túra'], preferredCity: 'Budapest', now: new Date('2026-08-22T09:00:00Z') });
    expect(result?.reasons).toContain('explicit_interest');
    expect(JSON.stringify(result?.reasons)).not.toMatch(/friend_count|user_id|ismeros|\b\d+\b/);
  });

  it('removes blocked social context before scoring', () => {
    expect(scoreRecommendation({ ...base, isBlockedContext: true }, { explicitInterests: ['túra'] })).toBeNull();
  });

  it('uses the server-side activity-context score and safe availability reason when present', () => {
    const result = scoreRecommendation({
      ...base,
      serverRankingScore: 73.25,
      attendedSimilar: true,
      availabilityMatch: true,
    }, { explicitInterests: [] });
    expect(result?.score).toBe(73.25);
    expect(result?.reasons).toEqual(expect.arrayContaining(['attended_similar', 'fits_availability']));
  });

  it('gives cold-start users a diverse, quality-aware feed', () => {
    const results = rankRecommendations([
      base,
      { ...base, id: '2', canonicalIdentity: 'external:2', source: 'external', category: 'Zene', title: 'Koncert' },
    ], { explicitInterests: [], coldStart: true, now: new Date('2026-08-22T09:00:00Z') });
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.reasons.includes('discovery_pick'))).toBe(true);
  });

  it('dedupes cross-provider copies and prefers native ownership semantics', () => {
    const duplicate = { ...base, id: 'external', source: 'external' as const };
    expect(dedupeRecommendationCandidates([duplicate, base])).toEqual([base]);
  });

  it('breaks category and source streaks when alternatives exist', () => {
    const ranked = [
      { candidate: base, score: 10, reasons: [] },
      { candidate: { ...base, id: '2', canonicalIdentity: 'n:2' }, score: 9, reasons: [] },
      { candidate: { ...base, id: '3', canonicalIdentity: 'n:3' }, score: 8, reasons: [] },
      { candidate: { ...base, id: '4', canonicalIdentity: 'e:4', source: 'external' as const, category: 'Zene' }, score: 7, reasons: [] },
    ];
    const output = diversityRerank(ranked, { maxConsecutiveCategory: 2, maxConsecutiveSource: 2 });
    expect(output[2].candidate.id).toBe('4');
  });

  it('upserts reversible preference feedback idempotently', () => {
    const once = upsertDiscoveryFeedback([], { candidateIdentity: 'x', preference: 'less_like_this' });
    const twice = upsertDiscoveryFeedback(once, { candidateIdentity: 'x', preference: 'neutral' });
    expect(twice).toEqual([{ candidateIdentity: 'x', preference: 'neutral' }]);
  });

  it('provides a deterministic offline relevance and exposure gate', () => {
    const external = {
      ...base,
      id: '2',
      canonicalIdentity: 'external:2',
      source: 'external' as const,
      category: 'Zene',
      title: 'Koncert',
      marketplaceExposure: 0.8,
    };
    const fixture = [{
      candidates: [base, external],
      context: { explicitInterests: ['túra'], preferredCity: 'Budapest', now: new Date('2026-08-22T09:00:00Z') },
      positiveCanonicalIdentities: ['native:1'],
    }];
    const first = evaluateRecommendationReplay(fixture, 2);
    const second = evaluateRecommendationReplay(fixture, 2);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ cases: 1, labeledCases: 1, hitRateAtK: 1, meanUniqueSourcesAtK: 2, lowExposureShareAtK: 0.5 });
    expect(first.sourceExposureAtK).toMatchObject({ native: 1, external: 1 });
  });
});
