import { supabase } from '@/integrations/supabase/client';

export interface ParticipantStats {
  total: number;
  going: number;
  waitlist: number;
  checkedIn: number;
  cancelled: number;
}

const EMPTY_STATS: ParticipantStats = { total: 0, going: 0, waitlist: 0, checkedIn: 0, cancelled: 0 };

export async function getParticipantStatsMap(eventIds: string[]): Promise<Map<string, ParticipantStats>> {
  const uniqueIds = Array.from(new Set(eventIds.filter(Boolean)));
  const statsMap = new Map<string, ParticipantStats>();
  uniqueIds.forEach((id) => statsMap.set(id, { ...EMPTY_STATS }));
  if (uniqueIds.length === 0) return statsMap;

  const { data, error } = await supabase
    .from('event_participants')
    .select('event_id,status')
    .in('event_id', uniqueIds);

  if (error) {
    console.error('participant stats failed', error);
    return statsMap;
  }

  (data ?? []).forEach((row: any) => {
    const current = { ...(statsMap.get(row.event_id) ?? EMPTY_STATS) };
    current.total += 1;
    if (row.status === 'going') current.going += 1;
    if (row.status === 'waitlist') current.waitlist += 1;
    if (row.status === 'checked_in') current.checkedIn += 1;
    if (row.status === 'cancelled' || row.status === 'no_show') current.cancelled += 1;
    statsMap.set(row.event_id, current);
  });

  return statsMap;
}
