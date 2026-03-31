import { supabase } from '@/lib/supabase'

export interface PlaceSearchParams {
  query?: string
  category?: string
  latitude?: number
  longitude?: number
  radiusKm?: number
  openNow?: boolean
  limit?: number
}

export interface ExternalPlace {
  external_id: string
  provider: string
  name: string
  category?: string
  address?: string
  city?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  distance_km?: number
  rating?: number
  review_count?: number
  image_url?: string
  phone?: string
  website?: string
  price_level?: string
  open_now?: boolean
  description?: string
  opening_hours_text?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

function numberOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function normalizeExternalPlace(raw: any): ExternalPlace {
  return {
    external_id: String(raw?.external_id || raw?.id || raw?.place_id || raw?.tomtom_id || raw?.geoapify_id || ''),
    provider: String(raw?.provider || raw?.source || 'external'),
    name: String(raw?.name || raw?.title || 'Ismeretlen hely'),
    category: raw?.category || raw?.subcategory || raw?.class_name || raw?.type,
    address: raw?.address || raw?.formatted || raw?.formatted_address || raw?.freeformAddress,
    city: raw?.city,
    postal_code: raw?.postal_code || raw?.postcode,
    latitude: numberOrUndefined(raw?.latitude ?? raw?.lat),
    longitude: numberOrUndefined(raw?.longitude ?? raw?.lon ?? raw?.lng),
    distance_km: numberOrUndefined(raw?.distance_km ?? raw?.distanceKm ?? raw?.distance),
    rating: numberOrUndefined(raw?.rating),
    review_count: numberOrUndefined(raw?.review_count ?? raw?.reviews),
    image_url: raw?.image_url || raw?.photo || raw?.thumbnail,
    phone: raw?.phone || raw?.tel,
    website: raw?.website || raw?.url,
    price_level: raw?.price_level,
    open_now: typeof raw?.open_now === 'boolean' ? raw.open_now : raw?.is_open_now,
    description: raw?.description,
    opening_hours_text: Array.isArray(raw?.opening_hours_text)
      ? raw.opening_hours_text
      : Array.isArray(raw?.openingHoursText)
        ? raw.openingHoursText
        : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    metadata: typeof raw?.metadata === 'object' && raw.metadata ? raw.metadata : raw,
  }
}

async function searchCachedPlaces(params: PlaceSearchParams): Promise<ExternalPlace[]> {
  let request = supabase
    .from('places_cache')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(params.limit || 24, 1), 48))

  if (params.category) {
    request = request.ilike('category', `%${params.category}%`)
  }

  if (params.query?.trim()) {
    const safeQuery = params.query.trim().replace(/[%_]/g, '')
    request = request.or(`name.ilike.%${safeQuery}%,address.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`)
  }

  const { data, error } = await request
  if (error) return []

  const rows: any[] = Array.isArray(data) ? data : []
  return rows.map((row: any) => normalizeExternalPlace(row)).filter((row: ExternalPlace) => Boolean(row.external_id))
}

async function invokePlaceSearch(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('place-search', { body })
  if (error) return { rows: [] as ExternalPlace[], error: error.message, debug: null as Record<string, unknown> | null }

  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return {
      rows: [] as ExternalPlace[],
      error: String((data as { error: string }).error),
      debug: typeof data === 'object' ? (data as Record<string, unknown>) : null,
    }
  }

  const rows: any[] = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data)
      ? data
      : []

  const normalizedRows: ExternalPlace[] = rows.map((row: any) => normalizeExternalPlace(row))
  const filteredRows: ExternalPlace[] = normalizedRows.filter((row: ExternalPlace) => Boolean(row.external_id))
  const debug = typeof data === 'object' && data ? (data as Record<string, unknown>).debug as Record<string, unknown> | undefined : undefined
  return { rows: filteredRows, error: null as string | null, debug: debug || null }
}

export async function searchPlaces(params: PlaceSearchParams): Promise<ExternalPlace[]> {
  const payload = {
    query: params.query || '',
    category: params.category || '',
    latitude: params.latitude,
    longitude: params.longitude,
    radius_km: params.radiusKm ?? 10,
    open_now: params.openNow ?? false,
    limit: params.limit ?? 24,
  }

  const primary = await invokePlaceSearch(payload)
  if (primary.rows.length > 0) return primary.rows

  // If provider calls happened but the primary result set is still empty,
  // retry once with softer constraints before falling back to cache.
  const rawCandidateCount = Number(primary.debug?.raw_candidate_count || 0)
  if (rawCandidateCount > 0 || (params.query || '').trim()) {
    const fallback = await invokePlaceSearch({
      query: params.query || '',
      category: params.category || '',
      latitude: params.latitude,
      longitude: params.longitude,
      radius_km: Math.max(params.radiusKm ?? 10, 15),
      open_now: false,
      limit: params.limit ?? 24,
      lenient: true,
    })
    if (fallback.rows.length > 0) return fallback.rows
  }

  const cached = await searchCachedPlaces(params)
  return cached
}
