/**
 * Social graph domain helpers (Prompt 04).
 *
 * Encodes the load-bearing social-graph invariants as a pure functional module
 * so they can be locked in by unit tests before any UI or DB surface adopts
 * them. No Supabase import — trivially unit-testable and side-effect free.
 *
 * Domain truths captured here:
 *  - Encounters derive ONLY from checked-in participation in a completed event.
 *  - A connection forms ONLY on a mutual reconnection signal (one-sided signals
 *    stay private and never surface to the other party).
 *  - Blocking removes a user from every social surface, in BOTH directions.
 *
 * The DB schema for a full social graph is intentionally NOT created here: the
 * live `events` table has no completion/outcome column yet, so a completion
 * trigger cannot be verified regression-free today. That remains a deferred
 * operator decision (see CHANGELOG "Deferred").
 */

export type UserId = string;

export interface EncounterPair {
  readonly eventId: string;
  /** Lexicographically ordered, so `userAId < userBId` always holds. */
  readonly userAId: UserId;
  readonly userBId: UserId;
}

export interface BlockRow {
  readonly blockerId: UserId;
  readonly blockedId: UserId;
}

export type ConnectionResolution =
  | { readonly kind: 'connection' }
  | { readonly kind: 'pending'; readonly direction: 'a_to_b' | 'b_to_a' }
  | { readonly kind: 'none' };

/**
 * Derive all unordered encounter pairs from the checked-in participants of a
 * single completed event.
 *
 * - De-duplicates inputs.
 * - Never emits a self-pair.
 * - Orders each pair so `userAId < userBId`, guaranteeing a canonical key.
 * - Less than 2 checked-in participants → no encounters.
 */
export function deriveEncounterPairs(
  eventId: string,
  checkedInUserIds: readonly UserId[],
): EncounterPair[] {
  const unique = Array.from(new Set(checkedInUserIds.filter((id) => id))).sort();
  const pairs: EncounterPair[] = [];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const a = unique[i];
      const b = unique[j];
      if (a === b) continue;
      pairs.push({ eventId, userAId: a, userBId: b });
    }
  }
  return pairs;
}

/**
 * Resolve a reconnection signal into a connection state.
 *
 * A connection forms only when BOTH parties signal yes. A one-sided yes stays
 * `pending` with a direction, which callers must never surface to the other
 * party. No signal on either side → `none`.
 */
export function resolveConnection(
  aSignalsYes: boolean,
  bSignalsYes: boolean,
): ConnectionResolution {
  if (aSignalsYes && bSignalsYes) return { kind: 'connection' };
  if (aSignalsYes && !bSignalsYes) return { kind: 'pending', direction: 'a_to_b' };
  if (!aSignalsYes && bSignalsYes) return { kind: 'pending', direction: 'b_to_a' };
  return { kind: 'none' };
}

/**
 * True when a block row separates the two users in EITHER direction.
 * Both directions remove a user from the other's social surface.
 */
export function isBlockedBetween(
  blockRows: readonly BlockRow[],
  userA: UserId,
  userB: UserId,
): boolean {
  for (const row of blockRows) {
    if (row.blockerId === userA && row.blockedId === userB) return true;
    if (row.blockerId === userB && row.blockedId === userA) return true;
  }
  return false;
}

/**
 * Exclude every candidate that is blocked (in either direction) from the
 * current user. Returns a new array; the input is never mutated.
 */
export function filterBlocked(
  currentUserId: UserId,
  candidateIds: readonly UserId[],
  blockRows: readonly BlockRow[],
): UserId[] {
  const seen = new Set<UserId>();
  const out: UserId[] = [];
  for (const id of candidateIds) {
    if (!id || id === currentUserId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!isBlockedBetween(blockRows, currentUserId, id)) {
      out.push(id);
    }
  }
  return out;
}

/**
 * Circle membership rule (explicit consent): a member may be added when the
 * actor is the circle owner, or the actor IS the target (self-join).
 */
export function canAddCircleMember(
  actorId: UserId,
  circleOwnerId: UserId,
  targetId: UserId,
): boolean {
  return actorId === circleOwnerId || actorId === targetId;
}

/**
 * Connection strength is simply the number of shared encounters. Kept as a pure
 * reducer so future weighting (recency, frequency) can replace it in one place.
 */
export function connectionStrength(sharedEncounterCount: number): number {
  const n = Number.isFinite(sharedEncounterCount) ? sharedEncounterCount : 0;
  return n > 0 ? n : 0;
}