import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse } from '../shared/providerFetch.ts';
import { fetchSeatGeekEvents, type SeatGeekSearchParams } from '../shared/seatgeek.ts';
import { upsertExternalEvents } from '../shared/upsertExternalEvents.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action = 'search_preview', params = {} } = await req.json() as { action?: 'search_preview' | 'sync'; params?: SeatGeekSearchParams & { maxPages?: number } };

    if (action === 'search_preview') {
      const result = await fetchSeatGeekEvents(params);
      return jsonResponse(result);
    }

    if (action === 'sync') {
      const maxPages = Math.max(1, Math.min(params.maxPages ?? 2, 5));
      const collected = [];

      for (let page = 1; page <= maxPages; page += 1) {
        const result = await fetchSeatGeekEvents({ ...params, page });
        collected.push(...result.events);
        if (!result.pagination.hasMore) break;
      }

      const { upserted } = await upsertExternalEvents(collected);
      return jsonResponse({ synced: upserted });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('sync-seatgeek-events error', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
