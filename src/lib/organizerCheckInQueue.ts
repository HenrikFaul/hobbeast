import { transitionEventParticipant } from '@/lib/eventOperations';

const STORAGE_KEY = 'hobbeast.organizer.checkin-queue.v1';
const MAX_QUEUE_ITEMS = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface QueuedCheckIn {
  participationId: string;
  idempotencyKey: string;
  queuedAt: string;
}

export function enqueueCheckIn(current: QueuedCheckIn[], item: QueuedCheckIn) {
  const active = current.filter((queued) => queued.participationId !== item.participationId);
  return [...active, item].slice(-MAX_QUEUE_ITEMS);
}

export function pruneCheckInQueue(current: QueuedCheckIn[], now = Date.now()) {
  return current.filter((item) => {
    const queuedAt = new Date(item.queuedAt).getTime();
    return Number.isFinite(queuedAt) && now - queuedAt <= MAX_AGE_MS;
  });
}

export function readQueuedCheckIns(storage: Pick<Storage, 'getItem'> = localStorage): QueuedCheckIn[] {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return pruneCheckInQueue(parsed.filter((item): item is QueuedCheckIn => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.participationId === 'string'
        && typeof row.idempotencyKey === 'string'
        && typeof row.queuedAt === 'string';
    }));
  } catch {
    return [];
  }
}

export function queueOrganizerCheckIn(
  participationId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
) {
  const item: QueuedCheckIn = {
    participationId,
    idempotencyKey: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  const next = enqueueCheckIn(readQueuedCheckIns(storage), item);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return item;
}

export async function flushOrganizerCheckIns(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
) {
  const pending = readQueuedCheckIns(storage);
  const failed: QueuedCheckIn[] = [];
  const sentParticipationIds: string[] = [];
  for (const item of pending) {
    try {
      await transitionEventParticipant({
        participationId: item.participationId,
        nextStatus: 'checked_in',
        reason: 'offline_checkin_replay',
        idempotencyKey: item.idempotencyKey,
      });
      sentParticipationIds.push(item.participationId);
    } catch {
      failed.push(item);
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(failed));
  return {
    sent: sentParticipationIds.length,
    sentParticipationIds,
    failed: failed.length,
  };
}
