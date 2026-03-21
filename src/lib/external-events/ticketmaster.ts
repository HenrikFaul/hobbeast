import { supabase } from '@/integrations/supabase/client';
import type { ExternalEventsSearchResult, TicketmasterSearchParams } from './types';

export async function previewTicketmasterEvents(params: TicketmasterSearchParams): Promise<ExternalEventsSearchResult> {
  const { data, error } = await supabase.functions.invoke('sync-ticketmaster-events', {
    body: { action: 'search_preview', params },
  });
  if (error) throw new Error(error.message);
  return data as ExternalEventsSearchResult;
}

export async function syncTicketmasterEvents(params: TicketmasterSearchParams & { maxPages?: number }): Promise<{ synced: number }> {
  const { data, error } = await supabase.functions.invoke('sync-ticketmaster-events', {
    body: { action: 'sync', params },
  });
  if (error) throw new Error(error.message);
  return data as { synced: number };
}
