// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Tag mapping for venue types
const VENUE_QUERIES: { tags: string[]; tomtomQuery: string; geoapifyCategories: string }[] = [
  { tags: ['board_game', 'tabletop', 'cafe', 'entertainment'], tomtomQuery: 'board game cafe', geoapifyCategories: 'entertainment,catering.cafe' },
  { tags: ['escape_room', 'entertainment'], tomtomQuery: 'escape room', geoapifyCategories: 'entertainment' },
  { tags: ['dance', 'dance_studio'], tomtomQuery: 'dance studio', geoapifyCategories: 'entertainment,sport' },
  { tags: ['sport', 'fitness', 'gym'], tomtomQuery: 'fitness gym', geoapifyCategories: 'sport.fitness' },
  { tags: ['sport', 'swimming', 'pool'], tomtomQuery: 'swimming pool', geoapifyCategories: 'sport.swimming_pool' },
  { tags: ['sport', 'tennis'], tomtomQuery: 'tennis court', geoapifyCategories: 'sport.tennis' },
  { tags: ['sport', 'climbing', 'boulder'], tomtomQuery: 'climbing wall boulder', geoapifyCategories: 'sport.climbing' },
  { tags: ['sport', 'stadium', 'ball'], tomtomQuery: 'sport stadium', geoapifyCategories: 'sport.stadium,sport.pitch' },
  { tags: ['restaurant', 'dining', 'gastro'], tomtomQuery: 'restaurant', geoapifyCategories: 'catering.restaurant' },
  { tags: ['bar', 'pub', 'nightlife'], tomtomQuery: 'bar pub', geoapifyCategories: 'catering.pub,catering.bar' },
  { tags: ['cafe', 'coffee'], tomtomQuery: 'cafe coffee', geoapifyCategories: 'catering.cafe' },
  { tags: ['music', 'concert', 'venue'], tomtomQuery: 'concert hall music venue', geoapifyCategories: 'entertainment.culture' },
  { tags: ['theater', 'culture'], tomtomQuery: 'theater', geoapifyCategories: 'entertainment.culture' },
  { tags: ['park', 'outdoor', 'nature'], tomtomQuery: 'park', geoapifyCategories: 'leisure.park' },
  { tags: ['gaming', 'esport', 'internet_cafe'], tomtomQuery: 'gaming internet cafe', geoapifyCategories: 'entertainment' },
  { tags: ['workshop', 'creative', 'art'], tomtomQuery: 'workshop art studio', geoapifyCategories: 'education' },
  { tags: ['wine', 'beer', 'tasting'], tomtomQuery: 'wine bar brewery', geoapifyCategories: 'catering.pub' },
  { tags: ['community', 'coworking'], tomtomQuery: 'community center coworking', geoapifyCategories: 'office.coworking,building.civic' },
  { tags: ['martial_arts', 'dojo', 'boxing'], tomtomQuery: 'martial arts dojo', geoapifyCategories: 'sport' },
  { tags: ['yoga', 'wellness', 'spa'], tomtomQuery: 'yoga wellness spa', geoapifyCategories: 'sport.fitness,healthcare.spa' },
  { tags: ['axe_throwing', 'entertainment'], tomtomQuery: 'axe throwing', geoapifyCategories: 'entertainment' },
  { tags: ['bowling', 'entertainment'], tomtomQuery: 'bowling', geoapifyCategories: 'entertainment' },
  { tags: ['cinema', 'entertainment'], tomtomQuery: 'cinema', geoapifyCategories: 'entertainment.cinema' },
  { tags: ['museum', 'culture'], tomtomQuery: 'museum', geoapifyCategories: 'entertainment.museum' },
  { tags: ['library', 'education'], tomtomQuery: 'library', geoapifyCategories: 'education.library' },
]

// Hungarian cities to cover
const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Budapest', lat: 47.4979, lon: 19.0402 },
  { name: 'Debrecen', lat: 47.5316, lon: 21.6273 },
  { name: 'Szeged', lat: 46.2530, lon: 20.1414 },
  { name: 'Miskolc', lat: 48.1035, lon: 20.7784 },
  { name: 'Pécs', lat: 46.0727, lon: 18.2323 },
  { name: 'Győr', lat: 47.6875, lon: 17.6504 },
  { name: 'Nyíregyháza', lat: 47.9554, lon: 21.7167 },
  { name: 'Kecskemét', lat: 46.8964, lon: 19.6897 },
  { name: 'Székesfehérvár', lat: 47.1860, lon: 18.4221 },
  { name: 'Szombathely', lat: 47.2307, lon: 16.6218 },
]

interface VenueRow {
  provider: string
  external_id: string
  name: string
  category: string | null
  tags: string[]
  address: string | null
  city: string | null
  postal_code: string | null
  country: string
  lat: number
  lon: number
  phone: string | null
  website: string | null
  rating: number | null
  image_url: string | null
  opening_hours_text: string[] | null
  details: Record<string, unknown>
}

async function fetchTomTom(query: string, city: { lat: number; lon: number }, tags: string[], apiKey: string): Promise<VenueRow[]> {
  const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(query)}.json?lat=${city.lat}&lon=${city.lon}&radius=30000&limit=50&countrySet=HU&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      provider: 'tomtom',
      external_id: r.id || '',
      name: r.poi?.name || r.address?.freeformAddress || 'Ismeretlen',
      category: r.poi?.classifications?.[0]?.code || null,
      tags,
      address: r.address?.freeformAddress || null,
      city: r.address?.municipality || null,
      postal_code: r.address?.postalCode || null,
      country: 'HU',
      lat: r.position?.lat,
      lon: r.position?.lon,
      phone: r.poi?.phone || null,
      website: r.poi?.url || null,
      rating: null,
      image_url: null,
      opening_hours_text: null,
      details: r,
    })).filter((v: VenueRow) => v.lat && v.lon && v.external_id)
  } catch {
    return []
  }
}

async function fetchGeoapify(categories: string, city: { lat: number; lon: number }, tags: string[], apiKey: string): Promise<VenueRow[]> {
  const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${city.lon},${city.lat},30000&bias=proximity:${city.lon},${city.lat}&limit=50&apiKey=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []).map((f: any) => {
      const p = f.properties || {}
      return {
        provider: 'geoapify',
        external_id: p.place_id || '',
        name: p.name || p.address_line1 || 'Ismeretlen',
        category: p.categories?.[0] || null,
        tags,
        address: p.formatted || null,
        city: p.city || null,
        postal_code: p.postcode || null,
        country: 'HU',
        lat: p.lat,
        lon: p.lon,
        phone: p.contact?.phone || null,
        website: p.website || null,
        rating: p.datasource?.raw?.rating || null,
        image_url: p.datasource?.raw?.image || null,
        opening_hours_text: Array.isArray(p.opening_hours?.text) ? p.opening_hours.text : null,
        details: p,
      }
    }).filter((v: VenueRow) => v.lat && v.lon && v.external_id)
  } catch {
    return []
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await request.json().catch(() => ({})) as { cityFilter?: string; batch?: number }
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY') || ''
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Missing Supabase config' }, 500)
    }
    if (!tomtomKey && !geoapifyKey) {
      return json({ error: 'No API keys configured' }, 500)
    }

    // Filter cities if requested
    const citiesToProcess = body.cityFilter
      ? CITIES.filter(c => c.name.toLowerCase() === body.cityFilter!.toLowerCase())
      : [CITIES[0]] // Default to Budapest only

    // Process only a batch of queries (5 at a time)
    const batchIdx = body.batch || 0
    const batchSize = 5
    const queryBatch = VENUE_QUERIES.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize)

    if (queryBatch.length === 0) {
      return json({ success: true, message: 'No more batches', total_batches: Math.ceil(VENUE_QUERIES.length / batchSize) })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let totalInserted = 0
    const errors: string[] = []

    // Process each city × query combination
    for (const city of citiesToProcess) {
      for (const vq of queryBatch) {
        const allRows: VenueRow[] = []

        // Fetch from both providers in parallel
        const [tomtomRows, geoapifyRows] = await Promise.all([
          tomtomKey ? fetchTomTom(vq.tomtomQuery, city, vq.tags, tomtomKey) : Promise.resolve([]),
          geoapifyKey ? fetchGeoapify(vq.geoapifyCategories, city, vq.tags, geoapifyKey) : Promise.resolve([]),
        ])

        allRows.push(...tomtomRows, ...geoapifyRows)

        if (allRows.length === 0) continue

        // Upsert in batches of 50
        for (let i = 0; i < allRows.length; i += 50) {
          const batch = allRows.slice(i, i + 50).map(r => ({
            ...r,
            updated_at: new Date().toISOString(),
          }))

          const { error } = await supabaseAdmin
            .from('venue_cache')
            .upsert(batch, { onConflict: 'provider,external_id' })

          if (error) {
            errors.push(`${city.name}/${vq.tomtomQuery}: ${error.message}`)
          } else {
            totalInserted += batch.length
          }
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200))
      }
    }

    return json({
      success: true,
      total_upserted: totalInserted,
      cities_covered: CITIES.length,
      query_types: VENUE_QUERIES.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
})
