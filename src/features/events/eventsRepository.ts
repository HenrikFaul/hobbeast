import { supabase } from '@/integrations/supabase/client';
import type { ProfileLocation } from './discoveryModel';

export interface EventsRepositoryResult<T> {
  data: T;
  errorCode: 'EVENTS_REPOSITORY_UNAVAILABLE' | null;
}

export async function loadJoinedEventIds(userId: string): Promise<EventsRepositoryResult<Set<string>>> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('event_id')
    .eq('user_id', userId);
  if (error) return { data: new Set(), errorCode: 'EVENTS_REPOSITORY_UNAVAILABLE' };
  return {
    data: new Set((data || []).map((row) => row.event_id)),
    errorCode: null,
  };
}

export async function loadDiscoveryProfileLocation(userId: string): Promise<EventsRepositoryResult<ProfileLocation | null>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('city,address,location_lat,location_lon,hobbies')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, errorCode: 'EVENTS_REPOSITORY_UNAVAILABLE' };
  return { data: data ?? null, errorCode: null };
}
