import type { SearchBody } from './requestContract.ts'
import type { Coordinates, DbSearchTableConfig, ProviderPlace } from './types.ts'

const CATEGORY_SEGMENT_TRANSLATIONS: Record<string, string> = {
  sport: 'sport',
  fitness: 'fitnesz',
  fitness_club: 'fitnesz klub',
  sports_centre: 'sportkozpont',
  stadium: 'stadion',
  leisure: 'szabadido',
  entertainment: 'szorakozas',
  tourism: 'turizmus',
  attraction: 'latnivalo',
  sights: 'latnivalok',
  museum: 'muzeum',
  memorial: 'emlekhely',
  park: 'park',
  playground: 'jatszoter',
  catering: 'vendeglatas',
  restaurant: 'etterem',
  cafe: 'kavezo',
  pub: 'pub',
  bar: 'bar',
  bakery: 'pekseg',
  building: 'epulet',
  commercial: 'kereskedelmi',
  historic: 'tortenelmi',
  community: 'kozossegi',
  club: 'klub',
  event_venue: 'rendezvenyhelyszin',
  board_game: 'tarsasjatek',
  games: 'jatekok',
}

export function postgrestSafe(value: string) {
  return String(value || '')
    .trim()
    .replace(/[*,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export function stringifyForFilter(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => stringifyForFilter(item)).join(' ')
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, val]) => `${key} ${stringifyForFilter(val)}`).join(' ')
  return String(value)
}

export function normalizeFilterText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function categoryAliasTerms(value: string): string[] {
  const raw = String(value || '').trim()
  if (!raw) return []
  const segments = raw
    .split('.')
    .flatMap((segment) => segment.split('_'))
    .map((segment) => segment.trim())
    .filter(Boolean)
  const english = segments.map((segment) => segment.replace(/[_.-]+/g, ' '))
  const hungarian = segments.map((segment) => CATEGORY_SEGMENT_TRANSLATIONS[segment] || segment.replace(/[_.-]+/g, ' '))
  return Array.from(new Set([
    raw,
    raw.replace(/\./g, ' '),
    english.join(' '),
    hungarian.join(' '),
    ...english,
    ...hungarian,
  ].map((item) => normalizeFilterText(item)).filter(Boolean)))
}

export function semanticCategoryHints(...values: unknown[]): string[] {
  const text = normalizeFilterText(values.map((value) => stringifyForFilter(value)).join(' '))
  const terms: string[] = []
  const add = (...next: string[]) => terms.push(...next)

  if (/(hobbeast|board|boardgame|board game|tarsas|tarsasjatek|tarsas jatek|társas|társasjáték|jatek|játék|game|quiz|kvíz|kartya|kártya)/.test(text)) {
    add('catering', 'catering pub', 'catering cafe', 'catering restaurant', 'catering bar', 'entertainment', 'leisure')
  }
  if (/(vendeglatas|vendéglátás|restaurant|etterem|étterem|food|drink|cafe|kave|kávé|bar|pub|gasztro)/.test(text)) {
    add('catering', 'catering restaurant', 'catering cafe', 'catering pub', 'catering bar', 'restaurant', 'cafe', 'pub', 'bar')
  }
  if (/(sport|fitness|futas|futás|yoga|jóga|joga|edzes|edzés)/.test(text)) {
    add('sport', 'fitness', 'leisure')
  }
  if (/(turizmus|tourism|sight|latnivalo|látnivaló|memorial|muzeum|múzeum)/.test(text)) {
    add('tourism', 'tourism sights', 'tourism attraction')
  }
  return Array.from(new Set(terms.map((term) => normalizeFilterText(term)).filter(Boolean)))
}

export function rowHasUsefulVenueSignal(row: Record<string, unknown>) {
  const haystack = normalizeFilterText([
    stringifyForFilter(row.categories),
    stringifyForFilter(row.details),
    row.cuisine,
    row.brand,
    row.operator,
    row.formatted_address,
    row.name,
  ].filter(Boolean).join(' '))
  return /(catering|restaurant|cafe|pub|bar|entertainment|leisure|sport|tourism|community|club|park)/.test(haystack)
}

export function normalizeCategoryTerms(value?: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  return Array.from(new Set(raw.map((item) => normalizeFilterText(item)).filter(Boolean)))
}

export function rawCategoryValuesFromRow(row: Record<string, unknown>): string[] {
  const directValues = [
    row.categories,
    row.details,
    row.cuisine,
    row.fetch_category,
    row.classification_code,
    row.building_type,
    row.brand,
    row.operator,
  ]
  const values = directValues.flatMap((value) => {
    if (Array.isArray(value)) return value.map((item) => String(item))
    if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).flatMap(([key, val]) => val ? [key, String(val)] : [key])
    return value ? [String(value)] : []
  })
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

export function categoryValuesFromRow(row: Record<string, unknown>): string[] {
  return rawCategoryValuesFromRow(row).map((value) => normalizeFilterText(value)).filter(Boolean)
}

export function rowMatchesCategoryExact(row: Record<string, unknown>, categories: string[]) {
  if (categories.length === 0) return true
  const values = categoryValuesFromRow(row)
  return categories.some((category) => values.some((value) => value === category || value.split(' ').includes(category)))
}

export function rowMatchesCategoryFuzzy(row: Record<string, unknown>, categories: string[]) {
  if (categories.length === 0) return true
  const values = categoryValuesFromRow(row)
  const haystack = values.join(' ')
  return categories.some((category) => {
    const normalizedCategory = normalizeFilterText(category)
    if (!normalizedCategory) return true
    return haystack.includes(normalizedCategory) ||
      values.some((value) => normalizedCategory.split(' ').some((part) => part.length >= 3 && value.includes(part)))
  })
}

export function rowMatchesCategory(row: Record<string, unknown>, category?: unknown) {
  const categories = normalizeCategoryTerms(category)
  return rowMatchesCategoryFuzzy(row, categories)
}

export function rowMatchesQueryFuzzy(row: Record<string, unknown>, query?: string) {
  const normalizedQuery = normalizeFilterText(query)
  if (!normalizedQuery) return true
  const haystack = normalizeFilterText([
    row.name,
    row.formatted_address,
    row.address_line1,
    row.address_line2,
    row.street,
    row.city,
    row.district,
    row.suburb,
    row.brand,
    row.operator,
    row.cuisine,
    stringifyForFilter(row.categories),
    stringifyForFilter(row.details),
    stringifyForFilter(row.raw_data),
  ].filter(Boolean).join(' '))
  const terms = normalizedQuery.split(' ').filter((term) => term.length >= 2)
  return terms.length === 0 || terms.every((term) => haystack.includes(term))
}

export function countValues(
  rows: Record<string, unknown>[],
  extractor: (row: Record<string, unknown>) => unknown[],
): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const values = extractor(row).map((value) => String(value || '').trim()).filter(Boolean)
    for (const value of Array.from(new Set(values))) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value]
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => v === true ? k : `${k}:${String(v)}`)
  }
  return []
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function deriveStableProviderId(...parts: unknown[]) {
  const input = parts.map((part) => String(part ?? '').trim().toLocaleLowerCase('en-US')).join('|')
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `derived-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function buildAddress(row: Record<string, unknown>) {
  const formatted = firstString(row.formatted_address, row.address_line1)
  if (formatted) return formatted
  const streetNumber = firstString(row.street_number, row.housenumber)
  const street = firstString(row.street)
  const streetLine = [street, streetNumber].filter(Boolean).join(' ')
  const line = [row.postal_code || row.postcode, row.city, streetLine].filter(Boolean).join(', ')
  return line || firstString(row.address_line2, row.name, row.brand, row.operator)
}

export function rowCategories(row: Record<string, unknown>) {
  return Array.from(new Set([
    ...coerceStringArray(row.categories),
    ...coerceStringArray(row.details),
    ...coerceStringArray(row.payment_options),
    ...coerceStringArray(row.diet),
    firstString(row.fetch_category),
    firstString(row.classification_code),
    firstString(row.cuisine),
    firstString(row.building_type),
  ].filter(Boolean)))
}

export function mapGeodataRow(row: Record<string, unknown>, tableConfig: DbSearchTableConfig): ProviderPlace {
  const categories = rowCategories(row)
  const address = buildAddress(row)
  const providerLabel = firstString(row.source_provider, row.datasource_name, tableConfig.table)
  const lat = Number(row.lat)
  const lon = Number(row.lon)
  const externalId = firstString(row.source_id, row.provider_id, row.external_id, row.osm_id, row.id)
    || deriveStableProviderId(tableConfig.table, row.name, row.brand, address, row.city, lat, lon)

  return {
    provider: tableConfig.provider,
    external_id: externalId,
    name: firstString(row.name, row.brand, row.operator, address, 'Helyszín'),
    category: categories[0] || providerLabel || 'venue',
    categories,
    address,
    city: firstString(row.city),
    district: firstString(row.district, row.suburb, row.state_region, row.state),
    postal_code: firstString(row.postal_code, row.postcode),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lon) ? lon : undefined,
    phone: firstString(row.phone) || null,
    email: firstString(row.email) || null,
    website: firstString(row.website, row.facebook, row.instagram, row.tripadvisor) || null,
    opening_hours_text: coerceStringArray(row.opening_hours),
    match_type: 'db',
    metadata: {
      table: tableConfig.table,
      provider_key: tableConfig.provider,
      provider_label: tableConfig.label,
      source_provider: providerLabel,
      brand: row.brand ?? null,
      operator: row.operator ?? null,
      branch: row.branch ?? null,
      cuisine: row.cuisine ?? null,
      capacity: row.capacity ?? null,
      reservation: row.reservation ?? null,
      wheelchair: row.wheelchair ?? null,
      outdoor_seating: row.outdoor_seating ?? null,
      indoor_seating: row.indoor_seating ?? null,
      internet_access: row.internet_access ?? null,
      air_conditioning: row.air_conditioning ?? null,
      smoking: row.smoking ?? null,
      toilets: row.toilets ?? null,
      takeaway: row.takeaway ?? null,
      delivery: row.delivery ?? null,
    },
  }
}

export function categoryMatches(row: ProviderPlace, category?: string) {
  const normalized = String(category || '').trim().toLowerCase()
  if (!normalized) return true
  const haystack = [row.category, ...(row.categories || []), row.metadata?.brand, row.metadata?.operator, row.metadata?.cuisine]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalized)
}

export function textMatchesQuery(row: ProviderPlace, query?: string) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [row.name, row.address, row.city, row.category, ...(row.categories || []), row.metadata?.brand, row.metadata?.operator]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalizedQuery)
}

export function bodyCenter(body: SearchBody): Coordinates | null {
  if (Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude))) {
    return { latitude: Number(body.latitude), longitude: Number(body.longitude) }
  }
  if (Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lon))) {
    return { latitude: Number(body.lat), longitude: Number(body.lon) }
  }
  if (Number.isFinite(Number(body.bias?.lat)) && Number.isFinite(Number(body.bias?.lon))) {
    return { latitude: Number(body.bias?.lat), longitude: Number(body.bias?.lon) }
  }
  return null
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function scoreRow(row: ProviderPlace, query: string, center?: Coordinates | null) {
  let score = 0
  if (query && textMatchesQuery(row, query)) score += 100
  if (row.match_type === 'query') score += 40
  if (row.match_type === 'db') score += 35
  if (typeof row.rating === 'number') score += Math.min(row.rating, 5) * 2
  if (typeof row.distance_km === 'number') score += Math.max(0, 30 - row.distance_km)
  if (!row.distance_km && center && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    score += Math.max(0, 30 - haversineKm(center.latitude, center.longitude, row.latitude, row.longitude))
  }
  return score
}

export function scoreDbAutocompleteRow(row: ProviderPlace, query: string, strategy: string, center?: Coordinates | null) {
  let score = scoreRow(row, query, center)
  if (strategy === 'query_match') score += 80
  if (strategy === 'semantic_category_fallback') score += 45
  if (strategy === 'broad_db_fallback') score += 10
  if (row.categories?.some((category) => /catering|restaurant|cafe|pub|bar|entertainment|leisure/.test(normalizeFilterText(category)))) score += 15
  if (row.name && row.name !== 'Helyszín') score += 5
  return score
}

export function dedupePlaces(results: ProviderPlace[]) {
  const seen = new Map<string, ProviderPlace>()
  for (const row of results) {
    const key = `${row.name}|${row.address || ''}|${Math.round((row.latitude || 0) * 1000)}|${Math.round((row.longitude || 0) * 1000)}`.toLowerCase()
    const current = seen.get(key)
    if (!current || (row.score || 0) > (current.score || 0)) seen.set(key, row)
  }
  return Array.from(seen.values())
}

export function rankExternalPlaces(results: ProviderPlace[], query: string, center: Coordinates | null, limit: number) {
  return dedupePlaces(results.map((row) => ({ ...row, score: scoreRow(row, query, center) })))
    .map((row, stableIndex) => ({ row, stableIndex }))
    .sort((left, right) => (right.row.score || 0) - (left.row.score || 0) || left.stableIndex - right.stableIndex)
    .slice(0, limit)
    .map(({ row }) => row)
}

export function normalizeCategory(category?: string | string[], activityHint?: string) {
  const lower = `${category || ''} ${activityHint || ''}`.toLowerCase()
  if (/(restaurant|étterem|food|drink|gasztro)/.test(lower)) return 'restaurant'
  if (/(cafe|kávé|coffee)/.test(lower)) return 'cafe'
  if (/(bar|bár|nightlife|cocktail)/.test(lower)) return 'bar'
  if (/(pub|board game|tarsas|társas|game|jatek|játék)/.test(lower)) return 'pub'
  if (/(entertainment|music|concert|show)/.test(lower)) return 'entertainment'
  if (/(leisure|sport|fitness|outdoor|hike|tura|túra)/.test(lower)) return 'leisure'
  return 'venue'
}

export function geoapifyCategoryFilter(category?: string | string[], activityHint?: string) {
  const normalized = normalizeCategory(category, activityHint)
  if (normalized === 'restaurant') return 'catering.restaurant,catering.cafe,catering.bar,catering.pub'
  if (normalized === 'cafe') return 'catering.cafe,catering.restaurant'
  if (normalized === 'bar') return 'catering.bar,catering.pub'
  if (normalized === 'entertainment') return 'entertainment'
  if (normalized === 'leisure') return 'leisure,sport'
  return 'catering.restaurant,catering.cafe,catering.bar,catering.pub,entertainment,leisure'
}

export function tomTomQuery(category?: string | string[], activityHint?: string) {
  const normalized = normalizeCategory(category, activityHint)
  if (normalized === 'restaurant') return 'restaurant'
  if (normalized === 'cafe') return 'cafe'
  if (normalized === 'bar') return 'bar'
  if (normalized === 'entertainment') return 'entertainment'
  if (normalized === 'leisure') return 'leisure'
  return 'venue'
}
