import { describe, expect, it } from 'vitest';
import {
  buildFirstEventConfidencePayload,
  firstEventConfidenceVisibilityLabel,
  normalizeFirstEventFormats,
} from '../firstEventConfidence';
import { buildDataRequestIdempotencyKey } from '../privacyRuntimeRepository';

describe('first-event confidence privacy contract', () => {
  it('deduplicates, sorts and rejects unknown formats', () => {
    expect(normalizeFirstEventFormats([
      'small_group_intro',
      'unknown',
      'guided_beginner',
      'small_group_intro',
    ])).toEqual(['guided_beginner', 'small_group_intro']);
  });

  it('builds a bounded, trimmed optional payload', () => {
    expect(buildFirstEventConfidencePayload({
      preferredEventFormats: ['buddy_welcome'],
      beginnerFriendly: true,
      soloArrivalComfort: 'prefer_buddy',
      preferredGroupSize: 'small',
      accessibilityNeeds: '  lépcsőmentes bejárat  ',
      communicationPreference: 'minimal',
      visibility: 'event_host_after_join',
    })).toEqual({
      preferred_event_formats: ['buddy_welcome'],
      beginner_friendly: true,
      solo_arrival_comfort: 'prefer_buddy',
      preferred_group_size: 'small',
      accessibility_needs: 'lépcsőmentes bejárat',
      communication_preference: 'minimal',
      visibility: 'event_host_after_join',
    });
  });

  it('explains the host-after-join consent boundary', () => {
    expect(firstEventConfidenceVisibilityLabel('event_host_after_join')).toContain('amelyhez már csatlakoztál');
    expect(firstEventConfidenceVisibilityLabel('private')).toContain('Csak te látod');
  });

  it('uses a stable minute bucket for double-submit protection', () => {
    const now = new Date('2026-08-23T09:15:42.000Z');
    expect(buildDataRequestIdempotencyKey('user-1', 'export', now))
      .toBe('data-subject:export:user-1:2026-08-23T09:15');
  });
});

