import { describe, expect, it } from 'vitest';
import { selectResearchClaimSlot } from './useResearchClaimSlot';

describe('research claim placement selection', () => {
  it('maps equal cursor intervals to every approved slot', () => {
    expect(selectResearchClaimSlot(0, 3)).toBe(0);
    expect(selectResearchClaimSlot(0.333333, 3)).toBe(0);
    expect(selectResearchClaimSlot(1 / 3, 3)).toBe(1);
    expect(selectResearchClaimSlot(0.666666, 3)).toBe(1);
    expect(selectResearchClaimSlot(2 / 3, 3)).toBe(2);
    expect(selectResearchClaimSlot(0.999999, 3)).toBe(2);
  });

  it('clamps hostile cursors and rejects invalid slot registries', () => {
    expect(selectResearchClaimSlot(-5, 2)).toBe(0);
    expect(selectResearchClaimSlot(5, 2)).toBe(1);
    expect(() => selectResearchClaimSlot(0.5, 0)).toThrow(RangeError);
  });
});
