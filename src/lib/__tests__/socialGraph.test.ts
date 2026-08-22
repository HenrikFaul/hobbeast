import { describe, expect, it } from 'vitest';
import {
  canAddCircleMember,
  connectionStrength,
  deriveEncounterPairs,
  filterBlocked,
  isBlockedBetween,
  resolveConnection,
  type BlockRow,
} from '../socialGraph';

describe('deriveEncounterPairs', () => {
  it('derives all unordered pairs from checked-in participants', () => {
    expect(deriveEncounterPairs('evt-1', ['u1', 'u2', 'u3'])).toEqual([
      { eventId: 'evt-1', userAId: 'u1', userBId: 'u2' },
      { eventId: 'evt-1', userAId: 'u1', userBId: 'u3' },
      { eventId: 'evt-1', userAId: 'u2', userBId: 'u3' },
    ]);
  });

  it('de-duplicates duplicate participant ids', () => {
    expect(deriveEncounterPairs('evt-1', ['u1', 'u1', 'u2'])).toEqual([
      { eventId: 'evt-1', userAId: 'u1', userBId: 'u2' },
    ]);
  });

  it('filters empty/falsy ids and never self-pairs', () => {
    expect(deriveEncounterPairs('evt-1', ['u1', '', 'u1'])).toEqual([]);
  });

  it('returns no pairs for fewer than 2 participants', () => {
    expect(deriveEncounterPairs('evt-1', [])).toEqual([]);
    expect(deriveEncounterPairs('evt-1', ['u1'])).toEqual([]);
  });

  it('orders each pair such that userAId < userBId', () => {
    const pairs = deriveEncounterPairs('evt-1', ['u3', 'u1', 'u2']);
    for (const p of pairs) {
      expect(p.userAId < p.userBId).toBe(true);
    }
  });
});

describe('resolveConnection', () => {
  it('forms a connection only on a mutual yes', () => {
    expect(resolveConnection(true, true)).toEqual({ kind: 'connection' });
  });

  it('keeps a one-sided yes pending with the correct direction', () => {
    expect(resolveConnection(true, false)).toEqual({
      kind: 'pending',
      direction: 'a_to_b',
    });
    expect(resolveConnection(false, true)).toEqual({
      kind: 'pending',
      direction: 'b_to_a',
    });
  });

  it('returns none when no one signals', () => {
    expect(resolveConnection(false, false)).toEqual({ kind: 'none' });
  });
});

describe('isBlockedBetween', () => {
  const rows: BlockRow[] = [
    { blockerId: 'u1', blockedId: 'u2' },
    { blockerId: 'u3', blockedId: 'u4' },
  ];

  it('detects a block in either direction', () => {
    expect(isBlockedBetween(rows, 'u1', 'u2')).toBe(true);
    expect(isBlockedBetween(rows, 'u2', 'u1')).toBe(true);
  });

  it('returns false when no block separates the pair', () => {
    expect(isBlockedBetween(rows, 'u1', 'u3')).toBe(false);
    expect(isBlockedBetween(rows, 'u3', 'u5')).toBe(false);
  });
});

describe('filterBlocked', () => {
  const rows: BlockRow[] = [{ blockerId: 'me', blockedId: 'u2' }];

  it('excludes blocked candidates and self, de-duplicates', () => {
    expect(filterBlocked('me', ['u1', 'u2', 'me', 'u1'], rows)).toEqual(['u1']);
  });

  it('does not mutate the input array', () => {
    const input = ['u1', 'u2'];
    const snapshot = [...input];
    filterBlocked('me', input, rows);
    expect(input).toEqual(snapshot);
  });
});

describe('canAddCircleMember', () => {
  it('allows the circle owner to add any member', () => {
    expect(canAddCircleMember('owner', 'owner', 'u2')).toBe(true);
  });

  it('allows a user to self-join', () => {
    expect(canAddCircleMember('u2', 'owner', 'u2')).toBe(true);
  });

  it('rejects a non-owner adding another user', () => {
    expect(canAddCircleMember('u3', 'owner', 'u2')).toBe(false);
  });
});

describe('connectionStrength', () => {
  it('returns the shared encounter count', () => {
    expect(connectionStrength(3)).toBe(3);
  });

  it('clamps negative and non-finite values to 0', () => {
    expect(connectionStrength(-1)).toBe(0);
    expect(connectionStrength(Number.NaN)).toBe(0);
    expect(connectionStrength(Number.POSITIVE_INFINITY)).toBe(0);
  });
});