import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Provider interfaces ─────────────────────────────────────────────────────

interface NormalizedPlace {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  country: string;
  postcode: string;
  lat: number;
  lon: number;
  categories: string[];
  source: 'geoapify' | 'tomtom';
  sourceId: string;
  confidence: number;
}

// ─── Geoapify provider ──────────────────────────────────────────────────────

async function geoapifyAutocomplete(query: string, apiKey: string, bias?: { lat: number; lon: number }): Promise<NormalizedPlace[]> {
  const params = new URLSearchParams({
    text: query,
    apiKey,
    lang: 'hu',
    limit: '6',
    format: 'json',
  });
  if (bias) params.set('bias', `proximity:${bias.lon},${bias.lat}`);

  const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`);
  if (!res.ok) {
    console.error('Geoapify error:', res.status, await res.text().catch(() => ''));
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((r: any, i: number) => ({
    id: `geoapify-${r.place_id || i}`,
    name: r.name || r.formatted || '',
    address: r.address_line1 || r.street || '',
    city: r.city || r.town || r.village || '',
    district: r.district || r.suburb || '',
    country: r.country || '',
    postcode: r.postcode || '',
    lat: r.lat,
    lon: r.lon,
    categories: r.categories || [],
    source: 'geoapify' as const,
    sourceId: r.place_id || `${i}`,
    confidence: r.rank?.confidence || (1 - i * 0.1),
  }));
}

async function geoapifyReverse(lat: number, lon: number, apiKey: string): Promise<NormalizedPlace[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    apiKey,
    lang: 'hu',
    format: 'json',
  });
  const res = await fetch(`https://api.geoapify.com/v1/geocode/reverse?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, 1).map((r: any) => ({
    id: `geoapify-${r.place_id || 'rev'}`,
    name: r.name || r.formatted || '',
    address: r.address_line1 || r.street || '',
    city: r.city || r.town || r.village || '',
    district: r.district || r.suburb || '',
    country: r.country || '',
    postcode: r.postcode || '',
    lat: r.lat,
    lon: r.lon,
    categories: r.categories || [],
    source: 'geoapify' as const,
    sourceId: r.place_id || 'rev',
    confidence: 0.9,
  }));
}

// ─── TomTom provider (enrichment/fallback) ──────────────────────────────────

async function tomtomSearch(query: string, apiKey: string, bias?: { lat: number; lon: number }): Promise<NormalizedPlace[]> {
  const params = new URLSearchParams({
    key: apiKey,
    language: 'hu-HU',
    limit: '5',
    typeahead: 'true',
  });
  if (bias) {
    params.set('lat', String(bias.lat));
    params.set('lon', String(bias.lon));
    params.set('radius', '100000');
  }
  const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`);
  if (!res.ok) {
    console.error('TomTom error:', res.status, await res.text().catch(() => ''));
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((r: any, i: number) => ({
    id: `tomtom-${r.id || i}`,
    name: r.poi?.name || r.address?.freeformAddress || '',
    address: r.address?.streetName ? `${r.address.streetName} ${r.address.streetNumber || ''}`.trim() : r.address?.freeformAddress || '',
    city: r.address?.municipality || r.address?.localName || '',
    district: r.address?.municipalitySubdivision || '',
    country: r.address?.country || '',
    postcode: r.address?.postalCode || '',
    lat: r.position?.lat || 0,
    lon: r.position?.lon || 0,
    categories: r.poi?.categories || [],
    source: 'tomtom' as const,
    sourceId: r.id || `${i}`,
    confidence: r.score ? Math.min(1, r.score / 10) : (0.8 - i * 0.1),
  }));
}

async function tomtomReverse(lat: number, lon: number, apiKey: string): Promise<NormalizedPlace[]> {
  const params = new URLSearchParams({ key: apiKey, language: 'hu-HU' });
  const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.addresses || []).slice(0, 1).map((r: any) => ({
    id: `tomtom-rev`,
    name: r.address?.freeformAddress || '',
    address: r.address?.streetName ? `${r.address.streetName} ${r.address.streetNumber || ''}`.trim() : '',
    city: r.address?.municipality || '',
    district: r.address?.municipalitySubdivision || '',
    country: r.address?.country || '',
    postcode: r.address?.postalCode || '',
    lat,
    lon,
    categories: [],
    source: 'tomtom' as const,
    sourceId: 'rev',
    confidence: 0.85,
  }));
}

// ─── Merge / Dedup / Rank ───────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mergeAndRank(primary: NormalizedPlace[], secondary: NormalizedPlace[]): NormalizedPlace[] {
  const merged = [...primary];

  for (const sec of secondary) {
    const isDuplicate = merged.some(
      (m) => haversineKm(m.lat, m.lon, sec.lat, sec.lon) < 0.05 &&
        m.name.toLowerCase().includes(sec.name.toLowerCase().slice(0, 5))
    );
    if (!isDuplicate) {
      // Lower confidence for secondary provider results
      merged.push({ ...sec, confidence: sec.confidence * 0.8 });
    }
  }

  return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getCached(key: string): Promise<NormalizedPlace[] | null> {
  const { data } = await supabase
    .from('places_cache')
    .select('response_data')
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return data ? (data.response_data as unknown as NormalizedPlace[]) : null;
}

async function setCache(key: string, results: NormalizedPlace[], provider: string) {
  await supabase.from('places_cache').upsert({
    cache_key: key,
    provider,
    response_data: results as any,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'cache_key' });
}

// ─── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtomKey = Deno.env.get('TOMTOM_API_KEY');

  if (!geoapifyKey && !tomtomKey) {
    return json({ error: 'No place provider API keys configured' }, 500);
  }

  try {
    const body = await req.json();
    const { action, query, lat, lon, bias } = body as {
      action: 'autocomplete' | 'reverse' | 'geocode';
      query?: string;
      lat?: number;
      lon?: number;
      bias?: { lat: number; lon: number };
    };

    if (!action) return json({ error: 'Missing action parameter' }, 400);

    const defaultBias = bias || { lat: 47.4979, lon: 19.0402 }; // Budapest

    if (action === 'autocomplete' || action === 'geocode') {
      if (!query || query.trim().length < 2) return json({ error: 'Query too short' }, 400);

      const cacheKey = `autocomplete:${query.trim().toLowerCase()}`;
      const cached = await getCached(cacheKey);
      if (cached) return json({ results: cached, cached: true });

      let primary: NormalizedPlace[] = [];
      let secondary: NormalizedPlace[] = [];

      // Geoapify primary
      if (geoapifyKey) {
        primary = await geoapifyAutocomplete(query, geoapifyKey, defaultBias);
      }

      // TomTom fallback/enrichment
      if (tomtomKey) {
        secondary = await tomtomSearch(query, tomtomKey, defaultBias);
      }

      // If primary failed but secondary worked, swap
      if (primary.length === 0 && secondary.length > 0) {
        primary = secondary;
        secondary = [];
      }

      const results = mergeAndRank(primary, secondary);
      if (results.length > 0) await setCache(cacheKey, results, 'merged');

      return json({ results, cached: false });
    }

    if (action === 'reverse') {
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return json({ error: 'Missing lat/lon for reverse geocode' }, 400);
      }

      const cacheKey = `reverse:${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cached = await getCached(cacheKey);
      if (cached) return json({ results: cached, cached: true });

      let results: NormalizedPlace[] = [];

      if (geoapifyKey) {
        results = await geoapifyReverse(lat, lon, geoapifyKey);
      }

      if (results.length === 0 && tomtomKey) {
        results = await tomtomReverse(lat, lon, tomtomKey);
      }

      if (results.length > 0) await setCache(cacheKey, results, results[0].source);

      return json({ results, cached: false });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('place-search error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
