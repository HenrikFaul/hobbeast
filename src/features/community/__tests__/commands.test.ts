import { describe, expect, it } from 'vitest';
import { buildCreateCircleCommand, buildHubJoinCommand } from '../commands';

describe('community domain commands', () => {
  it('normalizes a circle command and clamps capacity without changing its idempotency key', () => {
    expect(buildCreateCircleCommand({
      name: '  Futó kör  ',
      purpose: '  Közös heti futás  ',
      cadence: 'weekly',
      capacity: 500,
      membershipPolicy: 'approval',
      visibility: 'members',
      safetyRules: '  Figyelünk egymásra.  ',
      creationKey: 'circle-session-1',
    })).toEqual({
      _name: 'Futó kör',
      _purpose: 'Közös heti futás',
      _cadence: 'weekly',
      _capacity: 50,
      _membership_policy: 'approval',
      _visibility: 'members',
      _safety_rules: 'Figyelünk egymásra.',
      _creation_key: 'circle-session-1',
    });
  });

  it('uses a stable per-user/per-hub identifier for double-submit safety', () => {
    const first = buildHubJoinCommand('user-1', 'hub-1', true);
    const replay = buildHubJoinCommand('user-1', 'hub-1', true);
    expect(replay).toEqual(first);
    expect(first._idempotency_key).toBe('hub-join:user-1:hub-1');
  });
});
