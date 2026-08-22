import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin } from '../shared/providerFetch.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';
import { assertExternalProviderAvailable, failExternalProviderRun, finishExternalProviderRun, startExternalProviderRun } from '../shared/externalProviderRuns.ts';
import { getExternalProjectAdmin } from '../shared/targetProject.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

type ExternalSourceRow = Record<string, unknown>;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const localClient = getSupabaseAdmin(req);
  let runId: string | null = null;
  try {
    const adminUser = await requireAdminUser(req, localClient);
    await assertExternalProviderAvailable(localClient, 'external_supabase');
    runId = await startExternalProviderRun(localClient, 'external_supabase', 'sync', adminUser.id);
    // Source: external Supabase project
    const extClient = getExternalProjectAdmin();

    // Fetch all active external events from the source project
    let allRows: ExternalSourceRow[] = [];
    let from = 0;
    const pageSize = 500;
    while (true) {
      const { data, error } = await extClient
        .from('external_events')
        .select('*')
        .eq('is_active', true)
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`Source fetch error: ${error.message}`);
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data as ExternalSourceRow[]);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (allRows.length === 0) {
      await finishExternalProviderRun(localClient, runId, 'external_supabase', { itemCount: 0, pageCount: 0, costUnits: 1 });
      return new Response(JSON.stringify({ synced: 0, message: 'No events found in source' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map rows - remove id so the local project generates its own
    const verifiedAt = new Date().toISOString();
    const rows = allRows.map((r) => ({
      external_source: r.external_source,
      external_id: r.external_id,
      external_url: r.external_url,
      title: r.title,
      category: r.category,
      subcategory: r.subcategory,
      tags: r.tags,
      description: r.description,
      event_date: r.event_date,
      event_time: r.event_time,
      location_type: r.location_type,
      location_city: r.location_city,
      location_address: r.location_address,
      location_free_text: r.location_free_text,
      location_lat: r.location_lat,
      location_lon: r.location_lon,
      price_min: r.price_min,
      price_max: r.price_max,
      currency: r.currency,
      is_free: r.is_free,
      max_attendees: r.max_attendees,
      image_url: r.image_url,
      organizer_name: r.organizer_name,
      source_payload: r.source_payload || {},
      source_last_synced_at: r.source_last_synced_at || new Date().toISOString(),
      last_verified_at: verifiedAt,
      freshness_state: 'fresh',
      normalization_version: r.normalization_version || 'external-event-v1',
      dedupe_confidence: typeof r.dedupe_confidence === 'number' ? Math.max(0, Math.min(r.dedupe_confidence, 1)) : 0,
      canonical_fingerprint: r.canonical_fingerprint || `${String(r.title || '').trim().toLowerCase()}|${r.event_date || ''}|${String(r.location_city || '').trim().toLowerCase()}`,
      import_state: r.import_state === 'cancelled' ? 'cancelled' : 'active',
      is_active: r.import_state !== 'cancelled' && r.is_active !== false,
    }));

    // Upsert in batches of 100
    let upserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await localClient
        .from('external_events')
        .upsert(batch, { onConflict: 'external_source,external_id' });
      if (error) throw new Error(`Upsert error: ${error.message}`);
      upserted += batch.length;
    }

    await finishExternalProviderRun(localClient, runId, 'external_supabase', {
      itemCount: upserted,
      pageCount: Math.ceil(allRows.length / pageSize),
      costUnits: Math.max(1, Math.ceil(allRows.length / pageSize)),
      checkpoint: { source_rows: allRows.length },
    });

    return new Response(JSON.stringify({ synced: upserted, total_source: allRows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('PROVIDER_DISABLED') && !message.includes('PROVIDER_CIRCUIT_OPEN')) {
      await failExternalProviderRun(localClient, runId, 'external_supabase', error).catch(() => undefined);
    }
    const status = message.includes('authorization') || message.includes('Unauthorized') ? 401 : message.includes('Admin access') ? 403 : message.includes('PROVIDER_') ? 503 : 500;
    const publicCode = status === 503 ? 'PROVIDER_UNAVAILABLE' : status === 500 ? 'PROVIDER_OPERATION_FAILED' : 'AUTHORIZATION_FAILED';
    console.error(JSON.stringify({ scope: 'external-supabase-sync', code: publicCode }));
    return new Response(JSON.stringify({ error: publicCode }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
