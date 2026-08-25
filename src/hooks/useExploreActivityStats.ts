import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ExploreActivityStats {
  upcoming_events: number;
  interested_people: number;
}

/**
 * Batch-loads aggregate counts (upcoming events + interested members) for the
 * activity tiles currently visible on the Explore page. Results accumulate in a
 * name-keyed map so switching views reuses already-fetched entries.
 */
export function useExploreActivityStats(names: string[]) {
  const [stats, setStats] = useState<Record<string, ExploreActivityStats>>({});
  const key = useMemo(() => JSON.stringify(names.slice(0, 60)), [names]);

  useEffect(() => {
    const list = JSON.parse(key) as string[];
    if (!list.length) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc('explore_activity_stats', { p_names: list });
      if (cancelled || error || !Array.isArray(data)) return;
      setStats((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ name: string; upcoming_events: number; interested_people: number }>) {
          next[row.name] = {
            upcoming_events: row.upcoming_events ?? 0,
            interested_people: row.interested_people ?? 0,
          };
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [key]);

  return stats;
}
