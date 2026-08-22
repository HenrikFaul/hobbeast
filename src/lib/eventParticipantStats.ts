import { getPublicParticipantCounts } from '@/lib/eventOperations';

export interface ParticipantStats {
  total: number;
  going: number;
  waitlist: number;
  checkedIn: number;
  cancelled: number;
}

const EMPTY_STATS: ParticipantStats = { total: 0, going: 0, waitlist: 0, checkedIn: 0, cancelled: 0 };

export async function getParticipantStats(eventId: string): Promise<ParticipantStats> {
  const map = await getParticipantStatsMap([eventId]);
  return map.get(eventId) ?? { ...EMPTY_STATS };
}

export async function getParticipantStatsMap(eventIds: string[]): Promise<Map<string, ParticipantStats>> {
  const uniqueIds = Array.from(new Set(eventIds.filter(Boolean)));
  const statsMap = new Map<string, ParticipantStats>();
  uniqueIds.forEach((id) => statsMap.set(id, { ...EMPTY_STATS }));
  if (uniqueIds.length === 0) return statsMap;

  let rows;
  try {
    rows = await getPublicParticipantCounts(uniqueIds);
  } catch (error) {
    console.error('participant aggregate stats failed', error);
    return statsMap;
  }

  rows.forEach((row) => {
    statsMap.set(row.event_id, {
      total: row.total,
      going: row.going,
      waitlist: row.waitlist,
      checkedIn: row.checked_in + row.completed,
      cancelled: row.cancelled,
    });
  });

  return statsMap;
}
