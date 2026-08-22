import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';
import { assertExternalProviderAvailable, failExternalProviderRun, finishExternalProviderRun, startExternalProviderRun } from '../shared/externalProviderRuns.ts';
import { fetchTicketmasterEvents } from '../shared/ticketmaster.ts';
import { upsertExternalEvents } from '../shared/upsertExternalEvents.ts';
import { ExternalProviderRequestError, parseExternalProviderRequest } from '../shared/externalProviderRequest.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = getSupabaseAdmin(req);
  let runId: string | null = null;
  try {
    const adminUser = await requireAdminUser(req, admin);
    const { action, params } = await parseExternalProviderRequest(req, 'ticketmaster');
    await assertExternalProviderAvailable(admin, 'ticketmaster');
    runId = await startExternalProviderRun(admin, 'ticketmaster', action, adminUser.id);

    if (action === 'search_preview') {
      const result = await fetchTicketmasterEvents(params);
      await finishExternalProviderRun(admin, runId, 'ticketmaster', { itemCount: result.events.length, pageCount: 1, costUnits: 1, checkpoint: { page: result.pagination.page } });
      return jsonResponse(result);
    }

    if (action === 'sync') {
      const maxPages = Math.max(1, Math.min(params.maxPages ?? 2, 5));
      const collected = [];
      let fetchedPages = 0;

      for (let page = 0; page < maxPages; page += 1) {
        const result = await fetchTicketmasterEvents({ ...params, page });
        fetchedPages += 1;
        collected.push(...result.events);
        if (!result.pagination.hasMore) break;
      }

      const { upserted } = await upsertExternalEvents(collected);
      await finishExternalProviderRun(admin, runId, 'ticketmaster', { itemCount: upserted, pageCount: fetchedPages, costUnits: fetchedPages });
      return jsonResponse({ synced: upserted });
    }

    return jsonResponse({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('PROVIDER_DISABLED') && !message.includes('PROVIDER_CIRCUIT_OPEN')) {
      await failExternalProviderRun(admin, runId, 'ticketmaster', error).catch(() => undefined);
    }
    const status = error instanceof ExternalProviderRequestError ? 400 : message.includes('authorization') || message.includes('Unauthorized') ? 401 : message.includes('Admin access') ? 403 : message.includes('PROVIDER_') ? 503 : 500;
    const publicCode = status === 400 ? 'INVALID_REQUEST' : status === 503 ? 'PROVIDER_UNAVAILABLE' : status === 500 ? 'PROVIDER_OPERATION_FAILED' : 'AUTHORIZATION_FAILED';
    console.error(JSON.stringify({ scope: 'ticketmaster-sync', code: publicCode }));
    return jsonResponse({ error: publicCode }, status);
  }
});
