import { useState } from 'react';
import { createResearchRandomCursor } from './contracts';

export function selectResearchClaimSlot(randomCursor: number, slotCount: number): number {
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new RangeError('Research claim slot count must be a positive integer.');
  }
  const cursor = Number.isFinite(randomCursor)
    ? Math.min(Math.max(randomCursor, 0), 1 - Number.EPSILON)
    : 0;
  return Math.floor(cursor * slotCount);
}

/**
 * Selects one of a page's pre-approved layout slots with equal probability.
 * The choice is stable for the browser tab/session, preventing a quote from
 * jumping after re-renders while still rotating naturally between sessions.
 */
export function useResearchClaimSlot(scope: string, slotCount: number): number {
  const [slot] = useState(() => {
    const storageKey = `hobbeast.research-claim-slot.v1.${scope}`;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const stored = Number.parseInt(sessionStorage.getItem(storageKey) ?? '', 10);
        if (Number.isInteger(stored) && stored >= 0 && stored < slotCount) return stored;
      } catch {
        // Storage can be blocked; random selection still works in-memory.
      }
    }

    const selected = selectResearchClaimSlot(createResearchRandomCursor(), slotCount);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(storageKey, String(selected));
      } catch {
        // Best-effort stability only; no functional dependency on storage.
      }
    }
    return selected;
  });

  return slot;
}
