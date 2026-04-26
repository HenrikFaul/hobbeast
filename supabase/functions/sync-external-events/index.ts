import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { getSupabaseAdmin } from '../shared/providerFetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Source: external Supabase project
    const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    if (!extUrl || !extKey) {
      throw new Error('Missing EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    }

    const extClient = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const localClient = getSupabaseAdmin(req);

    // Fetch all active external events from the source project
    let allRows: any[] = [];
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
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (allRows.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: 'No events found in source' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map rows - remove id so the local project generates its own
    const rows = allRows.map((r: any) => ({
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
      is_active: true,
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

    return new Response(JSON.stringify({ synced: upserted, total_source: allRows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('sync-external-events error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
