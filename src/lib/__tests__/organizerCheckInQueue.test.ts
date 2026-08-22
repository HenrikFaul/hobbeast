import { describe, expect, it } from 'vitest';
import { enqueueCheckIn, pruneCheckInQueue, type QueuedCheckIn } from '@/lib/organizerCheckInQueue';

describe('offline organizer check-in queue', () => {
  const item = (id: string, queuedAt = '2026-08-22T10:00:00Z'): QueuedCheckIn => ({
    participationId: id,
    idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
    queuedAt,
  });

  it('deduplicates repeat scans of the same participant', () => {
    expect(enqueueCheckIn([item('1')], { ...item('1'), idempotencyKey: 'new-key' })).toEqual([
      { ...item('1'), idempotencyKey: 'new-key' },
    ]);
  });

  it('caps local pending work to prevent unbounded storage growth', () => {
    const rows = Array.from({ length: 105 }, (_, index) => item(String(index)));
    const result = rows.reduce((current, row) => enqueueCheckIn(current, row), [] as QueuedCheckIn[]);
    expect(result).toHaveLength(100);
    expect(result[0].participationId).toBe('5');
  });

  it('drops stale queued scans after 24 hours', () => {
    const now = new Date('2026-08-23T12:00:00Z').getTime();
    expect(pruneCheckInQueue([item('1', '2026-08-22T11:59:59Z'), item('2', '2026-08-22T12:00:01Z')], now)).toEqual([
      item('2', '2026-08-22T12:00:01Z'),
    ]);
  });
});
