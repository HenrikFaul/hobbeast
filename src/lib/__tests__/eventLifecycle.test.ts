import { describe, expect, it } from 'vitest';
import {
  buildOrganizerReadinessChecklist,
  canTransitionParticipation,
  completionStatusForParticipant,
  decideEventJoin,
  resolveEventLifecycle,
  resolveLocationPrecision,
} from '@/lib/eventLifecycle';

describe('event lifecycle invariants', () => {
  const before = new Date('2026-08-22T10:00:00Z');

  it('maps legacy scheduled and held values without a second status source', () => {
    expect(resolveEventLifecycle({ outcomeStatus: 'scheduled', eventDate: '2026-08-23', now: before })).toBe('published');
    expect(resolveEventLifecycle({ outcomeStatus: 'held', eventDate: '2026-08-20', now: before })).toBe('completed');
  });

  it('never completes an event merely because its start time passed', () => {
    expect(resolveEventLifecycle({ outcomeStatus: 'scheduled', eventDate: '2026-08-22', eventTime: '09:00', now: before })).toBe('started');
  });

  it('preserves cancellation and archival precedence', () => {
    expect(resolveEventLifecycle({ outcomeStatus: 'cancelled', isActive: true, now: before })).toBe('cancelled');
    expect(resolveEventLifecycle({ outcomeStatus: 'scheduled', isActive: false, now: before })).toBe('archived');
  });

  it('derives full only from active attendance and bounded capacity', () => {
    expect(resolveEventLifecycle({ outcomeStatus: 'published', maxAttendees: 2, activeAttendanceCount: 2, now: before })).toBe('full');
    expect(resolveEventLifecycle({ outcomeStatus: 'published', maxAttendees: null, activeAttendanceCount: 99, now: before })).toBe('published');
  });

  it('routes a capacity race loser to waitlist only when enabled', () => {
    expect(decideEventJoin({ lifecycle: 'published', maxAttendees: 1, activeAttendanceCount: 1, waitlistEnabled: true })).toEqual({ accepted: true, status: 'waitlist', reason: 'waitlist' });
    expect(decideEventJoin({ lifecycle: 'full', maxAttendees: 1, activeAttendanceCount: 1, waitlistEnabled: false })).toEqual({ accepted: false, status: null, reason: 'full_without_waitlist' });
  });

  it('makes duplicate joins idempotent', () => {
    expect(decideEventJoin({ lifecycle: 'published', activeAttendanceCount: 99, maxAttendees: 1, existingStatus: 'going' })).toEqual({ accepted: true, status: 'going', reason: 'idempotent' });
  });

  it('rejects joins after start, completion, cancellation and archive', () => {
    for (const lifecycle of ['started', 'completed', 'cancelled', 'archived'] as const) {
      expect(decideEventJoin({ lifecycle, activeAttendanceCount: 0 }).accepted).toBe(false);
    }
  });

  it('validates participant transitions by actor', () => {
    expect(canTransitionParticipation('going', 'checked_in', 'organizer')).toBe(true);
    expect(canTransitionParticipation('going', 'checked_in', 'participant')).toBe(false);
    expect(canTransitionParticipation('waitlist', 'going', 'system')).toBe(true);
    expect(canTransitionParticipation('going', 'completed', 'organizer')).toBe(false);
  });

  it('reveals private location progressively', () => {
    const start = new Date('2026-08-23T10:00:00Z');
    expect(resolveLocationPrecision({ isPrivate: true, eventStart: start, now: before })).toBe('coarse');
    expect(resolveLocationPrecision({ isPrivate: true, hasActiveRsvp: true, eventStart: start, now: before, revealWindowHours: 12 })).toBe('rsvp_detail');
    expect(resolveLocationPrecision({ isPrivate: true, hasActiveRsvp: true, eventStart: start, now: new Date('2026-08-23T00:00:00Z'), revealWindowHours: 12 })).toBe('full');
  });

  it('builds host tasks without inventing missing confidence data', () => {
    const checklist = buildOrganizerReadinessChecklist({ title: 'Séta', description: 'Közös séta', locationCity: 'Budapest', hostIdentityReady: true });
    expect(checklist.find((item) => item.key === 'description')?.complete).toBe(true);
    expect(checklist.find((item) => item.key === 'location')?.complete).toBe(false);
    expect(checklist.filter((item) => !item.complete).length).toBeGreaterThan(0);
  });

  it('derives attendance only from explicit check-in at completion', () => {
    expect(completionStatusForParticipant('checked_in')).toBe('completed');
    expect(completionStatusForParticipant('going')).toBe('no_show');
    expect(completionStatusForParticipant('waitlist')).toBe('waitlist');
  });
});
