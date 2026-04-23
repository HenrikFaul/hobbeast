// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import { PROVIDER_CATEGORIES } from '../address-manager-shared/constants.ts';

const COUNTRY_CENTER: Record<string, { lat: number; lon: number }> = {
  HU: { lat: 47.4979, lon: 19.0402 },
  DE: { lat: 52.52, lon: 13.405 },
  FR: { lat: 48.8566, lon: 2.3522 },
  IT: { lat: 41.9028, lon: 12.4964 },
  ES: { lat: 40.4168, lon: -3.7038 },
  NL: { lat: 52.3676, lon: 4.9041 },
  PL: { lat: 52.2297, lon: 21.0122 },
  AT: { lat: 48.2082, lon: 16.3738 },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalize(provider: 'geoapify' | 'tomtom', row: any, country: string, categoryKey: string) {
  if (provider === 'geoapify') {
    return {
      provider,
      provider_venue_id: String(row?.properties?.place_id || ''),
      country_code: country,
      category_key: categoryKey,
      name: row?.properties?.name || row?.properties?.address_line1 || 'Unknown',
      address: row?.properties?.formatted || null,
      city: row?.properties?.city || null,
      district: row?.properties?.district || null,
      postal_code: row?.properties?.postcode || null,
      latitude: row?.properties?.lat || null,
      longitude: row?.properties?.lon || null,
      phone: row?.properties?.contact?.phone || null,
      website: row?.properties?.website || null,
      open_now: row?.properties?.opening_hours?.open_now ?? null,
      rating: row?.properties?.datasource?.raw?.rating ?? null,
      review_count: row?.properties?.datasource?.raw?.reviews ?? null,
      metadata: row?.properties || {},
      updated_at: new Date().toISOString(),
    };
  }

  return {
    provider,
    provider_venue_id: String(row?.id || ''),
    country_code: country,
    category_key: categoryKey,
    name: row?.poi?.name || 'Unknown',
    address: row?.address?.freeformAddress || null,
    city: row?.address?.municipality || null,
    district: row?.address?.municipalitySubdivision || null,
    postal_code: row?.address?.postalCode || null,
    latitude: row?.position?.lat || null,
    longitude: row?.position?.lon || null,
    phone: row?.poi?.phone || null,
    website: row?.poi?.url || null,
    open_now: null,
    rating: null,
    review_count: null,
    metadata: row || {},
    updated_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseAdmin = getSupabaseAdmin(req);

  try {
    const body = await req.json();
    const task = body.task || {};
    const provider = String(task.provider) as 'geoapify' | 'tomtom';
    const country = String(task.country_code || 'HU').toUpperCase();
    const categoryKey = String(task.category_key || 'restaurant');
    const limits = task.limits || {};

    const category = PROVIDER_CATEGORIES.find((item) => item.key === categoryKey);
    if (!category) return json({ ok: false, error: `Unknown category key: ${categoryKey}` }, 400);

    const center = COUNTRY_CENTER[country] || COUNTRY_CENTER.HU;

    let normalizedRows: any[] = [];

    if (provider === 'geoapify') {
      const apiKey = Deno.env.get('GEOAPIFY_API_KEY');
      if (!apiKey) throw new Error('Missing GEOAPIFY_API_KEY');
      const params = new URLSearchParams({
        categories: String(category.geoapify || 'catering.restaurant'),
        filter: `circle:${center.lon},${center.lat},${Number(limits.radius_meters || 30000)}`,
        bias: `proximity:${center.lon},${center.lat}`,
        limit: String(Number(limits.geoapify_limit || 1000)),
        apiKey,
      });
      const res = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`);
      if (!res.ok) throw new Error(`Geoapify failed: ${res.status}`);
      const payload = await res.json();
      normalizedRows = (payload.features || []).map((item: any) => normalize('geoapify', item, country, categoryKey));
    } else {
      const apiKey = Deno.env.get('TOMTOM_API_KEY');
      if (!apiKey) throw new Error('Missing TOMTOM_API_KEY');
      const params = new URLSearchParams({
        key: apiKey,
        lat: String(center.lat),
        lon: String(center.lon),
        radius: String(Number(limits.radius_meters || 30000)),
        limit: String(Number(limits.tomtom_limit || 1000)),
        countrySet: country,
      });
      const res = await fetch(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(String(category.tomtom || 'restaurant'))}.json?${params.toString()}`);
      if (!res.ok) throw new Error(`TomTom failed: ${res.status}`);
      const payload = await res.json();
      normalizedRows = (payload.results || []).map((item: any) => normalize('tomtom', item, country, categoryKey));
    }

    const rows = normalizedRows.filter((row) => row.provider_venue_id);
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from('raw_venues')
        .upsert(rows, { onConflict: 'provider,provider_venue_id', ignoreDuplicates: false });
      if (error) throw error;
    }

    await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        status: 'completed',
        last_error: null,
        last_run_completed_at: new Date().toISOString(),
        stats: { fetched_rows: rows.length, provider, country, categoryKey },
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.matrix_id);

    return json({ ok: true, written: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
