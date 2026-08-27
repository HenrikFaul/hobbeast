import { describe, expect, it } from 'vitest';
import {
  canTransitionParticipation,
  decideEventJoin,
  resolveEventLifecycle,
  type ParticipantLifecycleStatus,
  type ParticipationActor,
  type CanonicalEventLifecycle,
} from '@/lib/eventLifecycle';

/**
 * Slice A characterization: the participant state machine, pinned whole.
 *
 * The Ultimate Event Engine plan (§34) builds Blueprint, Truth Ledger,
 * Participant Pass, crew workspace and the B2B surface on top of exactly this
 * machine. Its existing tests cover each function, but not the full matrix —
 * so a later slice could quietly open a transition that is closed today, or
 * close one the product depends on, and no test would notice.
 *
 * This file records what the machine does TODAY. It asserts no opinion about
 * whether that is right: if a slice deliberately changes a rule, the diff here
 * is the evidence of what changed and for whom.
 */

const STATUSES: ParticipantLifecycleStatus[] = [
  'invited', 'interested', 'going', 'waitlist',
  'checked_in', 'completed', 'cancelled', 'no_show',
];

const ACTORS: ParticipationActor[] = ['participant', 'organizer', 'system'];

/** Every transition that is ALLOWED today, as `current>next` per actor. */
function allowedMatrix(actor: ParticipationActor): string[] {
  const allowed: string[] = [];
  for (const current of STATUSES) {
    for (const next of STATUSES) {
      if (current === next) continue; // a no-op is always allowed, tested below
      if (canTransitionParticipation(current, next, actor)) allowed.push(`${current}>${next}`);
    }
  }
  return allowed.sort();
}

describe('participant transitions — the full matrix as it stands', () => {
  it('lets any actor restate the status somebody already has', () => {
    // Idempotency: re-sending "going" for someone already going is not an error.
    for (const status of STATUSES) {
      for (const actor of ACTORS) {
        expect(canTransitionParticipation(status, status, actor), `${status} by ${actor}`).toBe(true);
      }
    }
  });

  it('a participant may only accept an invitation or withdraw', () => {
    expect(allowedMatrix('participant')).toEqual([
      'going>cancelled',
      'interested>cancelled',
      'invited>cancelled',
      'invited>going',
      'waitlist>cancelled',
    ]);
  });

  /**
   * Worth stating because it surprises: once someone is checked in they cannot
   * withdraw themselves. They are physically at the event, so "cancelled" is
   * no longer theirs to declare — an organizer marks the outcome.
   */
  it('does not let someone already checked in withdraw themselves', () => {
    expect(canTransitionParticipation('checked_in', 'cancelled', 'participant')).toBe(false);
    expect(canTransitionParticipation('checked_in', 'cancelled', 'organizer')).toBe(false);
  });

  it('the system may only promote from the waitlist and complete a check-in', () => {
    // Deliberately narrow: automatic movement a person did not ask for is the
    // kind of thing that must never grow by accident.
    expect(allowedMatrix('system')).toEqual([
      'checked_in>completed',
      'waitlist>going',
    ]);
  });

  it('an organizer may do everything the graph itself permits', () => {
    expect(allowedMatrix('organizer')).toEqual([
      'cancelled>going',
      'cancelled>waitlist',
      'checked_in>completed',
      'checked_in>going',
      'going>cancelled',
      'going>checked_in',
      'going>no_show',
      'interested>cancelled',
      'interested>going',
      'interested>waitlist',
      'invited>cancelled',
      'invited>going',
      'invited>waitlist',
      'no_show>checked_in',
      'no_show>going',
      'waitlist>cancelled',
      'waitlist>going',
    ]);
  });

  /**
   * Only `completed` is truly final.
   *
   * `cancelled` and `no_show` are reversible BY AN ORGANIZER, and that is a
   * product decision rather than an oversight: somebody who cancelled can be
   * let back in, and a no-show marked in error must be correctable. Any slice
   * that starts treating them as terminal changes real behaviour.
   */
  it('treats only completed as final, and cancelled and no_show as correctable', () => {
    for (const next of STATUSES) {
      if (next === 'completed') continue;
      for (const actor of ACTORS) {
        expect(
          canTransitionParticipation('completed', next, actor),
          `completed > ${next} by ${actor} must stay closed`,
        ).toBe(false);
      }
    }

    // Reversible, but only by an organizer — never by the participant or the system.
    expect(canTransitionParticipation('cancelled', 'going', 'organizer')).toBe(true);
    expect(canTransitionParticipation('cancelled', 'going', 'participant')).toBe(false);
    expect(canTransitionParticipation('cancelled', 'going', 'system')).toBe(false);
    expect(canTransitionParticipation('no_show', 'checked_in', 'organizer')).toBe(true);
    expect(canTransitionParticipation('no_show', 'checked_in', 'system')).toBe(false);
  });

  it('never lets a participant put themselves on the waitlist or check themselves in', () => {
    // Both are organizer or system decisions; a participant asking is not one.
    expect(canTransitionParticipation('going', 'waitlist', 'participant')).toBe(false);
    expect(canTransitionParticipation('going', 'checked_in', 'participant')).toBe(false);
    expect(canTransitionParticipation('waitlist', 'going', 'participant')).toBe(false);
  });
});

describe('joining an event — every branch', () => {
  const base = {
    lifecycle: 'published' as CanonicalEventLifecycle,
    maxAttendees: 10,
    activeAttendanceCount: 0,
    waitlistEnabled: true,
  };

  it('is idempotent for anybody already holding a place', () => {
    for (const existing of ['going', 'checked_in', 'completed'] as const) {
      expect(decideEventJoin({ ...base, existingStatus: existing }))
        .toEqual({ accepted: true, status: 'going', reason: 'idempotent' });
    }
    // Someone already waitlisted stays waitlisted rather than jumping the queue.
    expect(decideEventJoin({ ...base, existingStatus: 'waitlist' }))
      .toEqual({ accepted: true, status: 'waitlist', reason: 'idempotent' });
  });

  it('lets a cancelled or invited person join afresh', () => {
    for (const existing of ['cancelled', 'invited', 'interested', 'no_show'] as const) {
      expect(decideEventJoin({ ...base, existingStatus: existing }).reason).toBe('available');
    }
  });

  it('waitlists when full, and refuses when full with no waitlist', () => {
    const full = { ...base, activeAttendanceCount: 10 };
    expect(decideEventJoin(full))
      .toEqual({ accepted: true, status: 'waitlist', reason: 'waitlist' });
    expect(decideEventJoin({ ...full, waitlistEnabled: false }))
      .toEqual({ accepted: false, status: null, reason: 'full_without_waitlist' });
  });

  it('treats a missing or zero capacity as no limit at all', () => {
    for (const maxAttendees of [0, null, undefined] as const) {
      expect(decideEventJoin({ ...base, maxAttendees, activeAttendanceCount: 9999 }).reason)
        .toBe('available');
    }
  });

  it('refuses to join an event that is not open', () => {
    const closed: CanonicalEventLifecycle[] = ['draft', 'cancelled', 'completed', 'archived'];
    for (const lifecycle of closed) {
      expect(decideEventJoin({ ...base, lifecycle }), lifecycle)
        .toEqual({ accepted: false, status: null, reason: 'not_joinable' });
    }
  });

  /**
   * The one asymmetry worth stating out loud: an existing place is honoured
   * even after the event closes, so a cancelled event does not strand the
   * people who were already going.
   */
  it('still honours an existing place on a closed event', () => {
    expect(decideEventJoin({ ...base, lifecycle: 'cancelled', existingStatus: 'going' }))
      .toEqual({ accepted: true, status: 'going', reason: 'idempotent' });
  });
});

describe('event lifecycle resolution', () => {
  it('is stable for the states the catalogue depends on', () => {
    const now = new Date('2026-08-27T12:00:00Z');
    const future = '2026-12-01';
    const past = '2026-01-01';

    expect(resolveEventLifecycle({ outcomeStatus: 'draft', eventDate: future, now })).toBe('draft');
    expect(resolveEventLifecycle({ outcomeStatus: 'cancelled', eventDate: future, now })).toBe('cancelled');
    expect(resolveEventLifecycle({ outcomeStatus: 'archived', eventDate: past, now })).toBe('archived');
  });
});
