import { describe, expect, it } from 'vitest';
import { evaluateExperimentGuardrails } from '@/lib/experiments';
import { interleavePromotedContent } from '@/lib/promotedContent';

describe('experiment guardrail evaluation', () => {
  it('auto-stops only after the registered sample and threshold are breached', () => {
    const evaluation = evaluateExperimentGuardrails([
      { metricKey: 'report_rate', direction: 'maximum', threshold: 0.05, minimumSampleSize: 100, autoStop: true },
      { metricKey: 'completion_rate', direction: 'minimum', threshold: 0.4, minimumSampleSize: 100, autoStop: true },
    ], [
      { metricKey: 'report_rate', metricValue: 0.2, sampleSize: 50, windowEndedAt: '2026-08-22T10:00:00Z' },
      { metricKey: 'report_rate', metricValue: 0.07, sampleSize: 120, windowEndedAt: '2026-08-22T11:00:00Z' },
      { metricKey: 'completion_rate', metricValue: 0.6, sampleSize: 120, windowEndedAt: '2026-08-22T11:00:00Z' },
    ]);
    expect(evaluation.shouldAutoStop).toBe(true);
    expect(evaluation.breaches.map((breach) => breach.metricKey)).toEqual(['report_rate']);
  });

  it('reports missing evidence without inventing a pass or breach', () => {
    const evaluation = evaluateExperimentGuardrails([
      { metricKey: 'error_rate', direction: 'maximum', threshold: 0.01, minimumSampleSize: 100, autoStop: true },
    ], []);
    expect(evaluation).toEqual({ shouldAutoStop: false, breaches: [], missingMetrics: ['error_rate'] });
  });
});

describe('promoted-content ranking boundary', () => {
  const organic = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map((eventId) => ({ eventId }));
  const now = new Date('2026-08-22T12:00:00Z');

  it('preserves organic order and inserts only an explicitly labelled eligible candidate', () => {
    const ranked = interleavePromotedContent(organic, [{
      item: { eventId: 'p1' },
      disclosureLabel: 'Promoted',
      policyStatus: 'approved',
      qualityScore: 0.8,
      relevanceScore: 0.9,
      startsAt: '2026-08-22T10:00:00Z',
      endsAt: '2026-08-23T10:00:00Z',
    }], { now, maxPromoted: 1, organicBeforeFirst: 3, minimumOrganicBetween: 4 });

    expect(ranked.filter((entry) => !entry.isPromoted).map((entry) => entry.item.eventId)).toEqual(organic.map((item) => item.eventId));
    expect(ranked[3]).toEqual({ item: { eventId: 'p1' }, isPromoted: true, disclosureLabel: 'Promoted' });
  });

  it('rejects missing disclosure and expired policy without suppressing organic results', () => {
    const candidate = {
      item: { eventId: 'o1' },
      disclosureLabel: 'Sponsored',
      policyStatus: 'approved' as const,
      qualityScore: 1,
      relevanceScore: 1,
      startsAt: '2026-08-20T10:00:00Z',
      endsAt: '2026-08-21T10:00:00Z',
    };
    const ranked = interleavePromotedContent(organic, [candidate], { now });
    expect(ranked.every((entry) => !entry.isPromoted)).toBe(true);
    expect(ranked).toHaveLength(organic.length);
  });

  it('moves an eligible organic candidate exactly once while preserving every other organic rank', () => {
    const promotedOrganic = organic.find((item) => item.eventId === 'o5')!;
    const ranked = interleavePromotedContent(organic, [{
      item: promotedOrganic,
      disclosureLabel: 'Promoted',
      policyStatus: 'approved',
      qualityScore: 0.8,
      relevanceScore: 0.9,
      startsAt: '2026-08-22T10:00:00Z',
      endsAt: '2026-08-23T10:00:00Z',
    }], { now, organicBeforeFirst: 3 });

    expect(ranked.map((entry) => entry.item.eventId)).toEqual(['o1', 'o2', 'o3', 'o5', 'o4', 'o6']);
    expect(ranked.filter((entry) => entry.item.eventId === 'o5')).toEqual([{
      item: promotedOrganic,
      isPromoted: true,
      disclosureLabel: 'Promoted',
    }]);
  });

  it('keeps a candidate organic when the result set is too short for the disclosure boundary', () => {
    const shortOrganic = organic.slice(0, 2);
    const ranked = interleavePromotedContent(shortOrganic, [{
      item: shortOrganic[0],
      disclosureLabel: 'Promoted',
      policyStatus: 'approved',
      qualityScore: 1,
      relevanceScore: 1,
      startsAt: '2026-08-22T10:00:00Z',
      endsAt: '2026-08-23T10:00:00Z',
    }], { now, organicBeforeFirst: 3 });

    expect(ranked).toEqual(shortOrganic.map((item) => ({
      item,
      isPromoted: false,
      disclosureLabel: null,
    })));
  });
});
