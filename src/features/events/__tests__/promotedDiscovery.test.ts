import { describe, expect, it } from 'vitest';
import { normalizePromotedExperienceRows } from '@/features/events/promotedDiscovery';

describe('promoted discovery query contract', () => {
  it('accepts only exact Promoted disclosure and strips policy internals', () => {
    const rows = normalizePromotedExperienceRows([{
      event_id: '95000000-0000-4000-8000-000000000001',
      disclosure_label: 'Promoted',
      quality_score: 0.8,
      relevance_score: 0.9,
      starts_at: '2026-08-22T10:00:00Z',
      ends_at: '2026-08-23T10:00:00Z',
      policy_reason: 'private operator note',
      created_by: 'private actor',
    }]);
    expect(rows).toEqual([{
      eventId: '95000000-0000-4000-8000-000000000001',
      disclosureLabel: 'Promoted',
      qualityScore: 0.8,
      relevanceScore: 0.9,
      startsAt: '2026-08-22T10:00:00Z',
      endsAt: '2026-08-23T10:00:00Z',
    }]);
    expect(JSON.stringify(rows)).not.toMatch(/policy_reason|private operator|created_by|private actor/);
  });

  it('rejects ambiguous labels, malformed ids and invalid windows', () => {
    expect(normalizePromotedExperienceRows([
      { event_id: 'bad', disclosure_label: 'Promoted', starts_at: 'x', ends_at: 'y' },
      { event_id: '95000000-0000-4000-8000-000000000001', disclosure_label: 'Sponsored', starts_at: '2026-08-22T10:00:00Z', ends_at: '2026-08-23T10:00:00Z' },
    ])).toEqual([]);
  });
});
