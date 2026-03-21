import { supabase } from '@/integrations/supabase/client';
import type { ExternalEventsSearchResult, SeatGeekSearchParams } from './types';

export async function previewSeatGeekEvents(params: SeatGeekSearchParams): Promise<ExternalEventsSearchResult> {
  const { data, error } = await supabase.functions.invoke('sync-seatgeek-events', {
    body: { action: 'search_preview', params },
  });
  if (error) throw new Error(error.message);
  return data as ExternalEventsSearchResult;
}

export async function syncSeatGeekEvents(params: SeatGeekSearchParams & { maxPages?: number }): Promise<{ synced: number }> {
  const { data, error } = await supabase.functions.invoke('sync-seatgeek-events', {
    body: { action: 'sync', params },
  });
  if (error) throw new Error(error.message);
  return data as { synced: number };
}
