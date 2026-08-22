import type { GeodataTableName, SearchBody } from './requestContract.ts'
import { PLACE_SEARCH_RUNTIME_VERSION, restFetchJson, type FetchLike } from './runtime.ts'
import {
  bodyCenter,
  categoryAliasTerms,
  countValues,
  dedupePlaces,
  mapGeodataRow,
  normalizeCategoryTerms,
  normalizeFilterText,
  postgrestSafe,
  rawCategoryValuesFromRow,
  rowHasUsefulVenueSignal,
  rowMatchesCategoryExact,
  rowMatchesCategoryFuzzy,
  rowMatchesQueryFuzzy,
  scoreDbAutocompleteRow,
  semanticCategoryHints,
} from './normalization.ts'
import type { DbSearchTableConfig, GeodataAuth, ProviderPlace } from './types.ts'

const GEODATA_SELECT_COLUMNS: Record<GeodataTableName, string> = {
  'public.unified_pois': [
    'id', 'source_provider', 'source_id', 'name', 'name_international', 'categories', 'country', 'country_code', 'country_code_iso3', 'iso3166_2',
    'state_region', 'city', 'district', 'suburb', 'postal_code', 'street', 'street_number', 'formatted_address', 'address_line1', 'address_line2',
    'lat', 'lon', 'phone', 'email', 'website', 'facebook', 'instagram', 'tripadvisor', 'opening_hours', 'operator', 'brand', 'branch', 'cuisine',
    'diet', 'capacity', 'reservation', 'wheelchair', 'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking',
    'toilets', 'takeaway', 'delivery', 'payment_options', 'classification_code', 'osm_id', 'building_type', 'source_fetched_at', 'unified_at',
  ].join(','),
  'public.local_pois': [
    'id', 'provider_id', 'source_provider', 'name', 'name_international', 'categories', 'country', 'country_code', 'country_code_iso3', 'iso3166_2',
    'state_region', 'city', 'district', 'suburb', 'postal_code', 'street', 'street_number', 'formatted_address', 'address_line1', 'address_line2',
    'lat', 'lon', 'phone', 'email', 'website', 'facebook', 'instagram', 'tripadvisor', 'opening_hours', 'operator', 'brand', 'branch', 'cuisine',
    'diet', 'capacity', 'reservation', 'wheelchair', 'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking',
    'toilets', 'takeaway', 'delivery', 'payment_options', 'classification_code', 'osm_id', 'building_type', 'source_fetched_at', 'source_unified_at',
    'last_loaded_at', 'created_at', 'updated_at',
  ].join(','),
  'public.geoapify_pois': [
    'id', 'external_id', 'name', 'country', 'country_code', 'state', 'city', 'postcode', 'district', 'suburb', 'street', 'housenumber', 'iso3166_2',
    'lat', 'lon', 'formatted_address', 'address_line1', 'address_line2', 'categories', 'details', 'website', 'opening_hours', 'phone', 'email',
    'facebook', 'instagram', 'tripadvisor', 'operator', 'brand', 'branch', 'cuisine', 'diet', 'capacity', 'reservation', 'wheelchair',
    'outdoor_seating', 'indoor_seating', 'internet_access', 'air_conditioning', 'smoking', 'toilets', 'takeaway', 'delivery', 'payment_options',
    'name_international', 'name_other', 'datasource_name', 'osm_id', 'osm_type', 'building_type', 'fetch_category', 'fetched_at',
  ].join(','),
}

const DISCOVERY_SAMPLE_LIMIT = 5000

const DEFAULT_DB_TEST_COLUMNS = [
  'id',
  'name',
  'city',
  'district',
  'formatted_address',
  'lat',
  'lon',
  'categories',
  'source_provider',
  'datasource_name',
  'brand',
  'operator',
  'cuisine',
  'phone',
  'website',
] as const

export interface LocalDbRepositoryDependencies {
  resolveGeodataAuth: () => GeodataAuth
  fetchImpl?: FetchLike
  nowMs?: () => number
}

function geodataHeaders(key: string) {
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  }

  // Legacy service_role/anon JWT keys work as Bearer tokens. New sb_secret_ / sb_publishable_ keys are API keys, not JWT Bearer tokens.
  if (!/^sb_(secret|publishable)_/i.test(key)) {
    headers.Authorization = `Bearer ${key}`
  }

  return headers
}

function tablePath(table: GeodataTableName) {
  return table.split('.').pop() || table
}

function tableColumns(table: GeodataTableName) {
  return new Set(GEODATA_SELECT_COLUMNS[table].split(',').map((column) => column.trim()).filter(Boolean))
}

function sourceColumnForTable(table: GeodataTableName) {
  return table === 'public.geoapify_pois' ? 'datasource_name' : 'source_provider'
}

function normalizeRequestedColumns(table: GeodataTableName, requested?: unknown): string[] {
  const available = tableColumns(table)
  const raw = Array.isArray(requested) && requested.length > 0
    ? requested.map((item) => String(item || '').trim()).filter(Boolean)
    : Array.from(DEFAULT_DB_TEST_COLUMNS)
  const cleaned = Array.from(new Set(raw)).filter((column) => available.has(column))
  const fallback = Array.from(DEFAULT_DB_TEST_COLUMNS).filter((column) => available.has(column))
  return cleaned.length > 0 ? cleaned : fallback
}

function buildSelectColumns(table: GeodataTableName, resultColumns: string[]) {
  const available = tableColumns(table)
  const requiredForFilteringAndMapping = [
    'id', 'source_id', 'provider_id', 'external_id', 'osm_id',
    'source_provider', 'datasource_name', 'name', 'brand', 'operator',
    'formatted_address', 'address_line1', 'address_line2', 'street', 'street_number', 'housenumber',
    'postal_code', 'postcode', 'city', 'district', 'suburb', 'state_region', 'state',
    'lat', 'lon', 'categories', 'details', 'payment_options', 'diet', 'fetch_category',
    'classification_code', 'cuisine', 'building_type', 'phone', 'email', 'website',
    'facebook', 'instagram', 'tripadvisor', 'opening_hours', 'branch', 'capacity',
    'reservation', 'wheelchair', 'outdoor_seating', 'indoor_seating', 'internet_access',
    'air_conditioning', 'smoking', 'toilets', 'takeaway', 'delivery',
  ]
  return Array.from(new Set([...resultColumns, ...requiredForFilteringAndMapping])).filter((column) => available.has(column)).join(',')
}

function buildPseudoSql(
  table: GeodataTableName,
  columns: string[],
  filters: { city?: string; category?: string; query?: string; source?: string; sourceColumn?: string; limit?: number },
) {
  const selectedColumns = columns.length > 0 ? columns.join(', ') : '*'
  const where: string[] = []
  if (filters.city) where.push(`city ilike '%${filters.city}%'`)
  if (filters.source) where.push(`${filters.sourceColumn || 'source_provider'} ilike '%${filters.source}%'`)
  if (filters.query) where.push(`/* smart text filter */ searchable columns/categories contain '${filters.query}'`)
  if (filters.category) where.push(`/* smart category filter */ categories/details/cuisine contains '${filters.category}'`)
  return [
    `select ${selectedColumns}`,
    `from ${table}`,
    where.length ? `where ${where.join(' and ')}` : '',
    `limit ${Math.min(Math.max(Number(filters.limit || 24), 1), 200)}`,
  ].filter(Boolean).join('\n')
}

function pickColumns(row: Record<string, unknown>, columns: string[]) {
  return columns.reduce((acc, column) => {
    acc[column] = row[column] ?? null
    return acc
  }, {} as Record<string, unknown>)
}

function categoryDiscoverySelectColumns(table: GeodataTableName) {
  const available = tableColumns(table)
  const columns = [
    'id', 'city', sourceColumnForTable(table),
    'categories', 'details', 'cuisine', 'fetch_category', 'classification_code', 'building_type', 'brand', 'operator',
  ]
  return Array.from(new Set(columns)).filter((column) => available.has(column)).join(',')
}

export function createLocalDbRepository(dependencies: LocalDbRepositoryDependencies) {
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const nowMs = dependencies.nowMs ?? (() => performance.now())

  const fetchJson = <T>(url: string, init: RequestInit = {}) => restFetchJson<T>(url, init, fetchImpl)

  async function expandCategoryTermsWithMapper(tableConfig: DbSearchTableConfig, url: string, key: string, terms: string[]) {
    const normalizedTerms = Array.from(new Set(terms.map((term) => normalizeFilterText(term)).filter(Boolean)))
    if (normalizedTerms.length === 0) return { expandedTerms: normalizedTerms, matchedMappings: [] as Array<Record<string, unknown>> }

    try {
      const mapperUrl = new URL(`${url}/rest/v1/provider_category_mapper`)
      mapperUrl.searchParams.set('select', 'provider,source_table,provider_category_key,provider_category_en,provider_category_hu,hobbeast_category_slug,hobbeast_category_path_hu,hobbeast_category_path_en')
      mapperUrl.searchParams.set('source_table', `eq.${tableConfig.table}`)
      mapperUrl.searchParams.set('is_active', 'eq.true')
      mapperUrl.searchParams.set('limit', '1500')

      const rows = await fetchJson<Record<string, unknown>[]>(mapperUrl.toString(), { headers: geodataHeaders(key) }).catch(() => [])
      const matchedMappings = (Array.isArray(rows) ? rows : []).filter((row) => {
        const aliases = Array.from(new Set([
          ...categoryAliasTerms(String(row.provider_category_key || '')),
          ...categoryAliasTerms(String(row.provider_category_en || '')),
          ...categoryAliasTerms(String(row.provider_category_hu || '')),
          ...categoryAliasTerms(String(row.hobbeast_category_slug || '')),
          ...categoryAliasTerms(String(row.hobbeast_category_path_hu || '')),
          ...categoryAliasTerms(String(row.hobbeast_category_path_en || '')),
        ]))
        return normalizedTerms.some((term) => aliases.some((alias) => alias.includes(term) || term.includes(alias)))
      })

      const expandedTerms = Array.from(new Set([
        ...normalizedTerms,
        ...matchedMappings.flatMap((row) => {
          const keyValue = normalizeFilterText(String(row.provider_category_key || ''))
          const root = keyValue.split(' ')[0]
          return [keyValue, root].filter(Boolean)
        }),
      ].filter(Boolean)))

      return {
        expandedTerms,
        matchedMappings: matchedMappings.slice(0, 12).map((row) => ({
          provider: row.provider,
          provider_category_key: row.provider_category_key,
          provider_category_hu: row.provider_category_hu,
          hobbeast_category_slug: row.hobbeast_category_slug,
        })),
      }
    } catch (_error) {
      return { expandedTerms: normalizedTerms, matchedMappings: [] as Array<Record<string, unknown>> }
    }
  }

  async function autocompleteGeodataPlaces(
    tableConfig: DbSearchTableConfig,
    params: SearchBody,
  ): Promise<{ results: ProviderPlace[]; debug: Record<string, unknown> }> {
    const startedAt = nowMs()
    const { url, key } = dependencies.resolveGeodataAuth()
    const limit = Math.min(Math.max(Number(params.limit || 12), 1), 40)
    const city = postgrestSafe(params.city || '')
    const query = postgrestSafe(params.query || '')
    const source = postgrestSafe(params.source || '')
    const sourceColumn = sourceColumnForTable(tableConfig.table)
    const available = tableColumns(tableConfig.table)
    const center = bodyCenter(params)
    const explicitCategoryTerms = normalizeCategoryTerms(params.category || params.activityHint || '')
    const semanticTerms = semanticCategoryHints(params.query, params.activityHint, params.category)
    const requestedCategoryTerms = explicitCategoryTerms.length > 0 ? explicitCategoryTerms : semanticTerms
    const mapperExpansion = await expandCategoryTermsWithMapper(tableConfig, url, key, requestedCategoryTerms)
    const categoryTerms = mapperExpansion.expandedTerms.length > 0 ? mapperExpansion.expandedTerms : requestedCategoryTerms
    const selectColumns = buildSelectColumns(tableConfig.table, Array.from(DEFAULT_DB_TEST_COLUMNS))
    const fetchLimit = Math.min(Math.max(limit * 90, 900), 2500)

    const restUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
    restUrl.searchParams.set('select', selectColumns)
    restUrl.searchParams.set('limit', String(fetchLimit))
    if (available.has('name')) restUrl.searchParams.set('order', 'name.asc.nullslast')
    if (city && available.has('city')) restUrl.searchParams.set('city', `ilike.*${city}*`)
    if (source && available.has(sourceColumn)) restUrl.searchParams.set(sourceColumn, `ilike.*${source}*`)

    const fetchedRows = await fetchJson<Record<string, unknown>[]>(restUrl.toString(), { headers: geodataHeaders(key) })
    const rawRows = Array.isArray(fetchedRows) ? fetchedRows : []
    let categoryPrefetchRows: Record<string, unknown>[] = []
    if (categoryTerms.length > 0 && available.has('categories') && tableConfig.table !== 'public.local_pois') {
      const categoryKeys = Array.from(new Set(categoryTerms.flatMap((term) => {
        const dotted = term.replace(/\s+/g, '.')
        const root = dotted.split('.')[0]
        return [dotted, root]
      }).filter(Boolean))).slice(0, 20)
      if (categoryKeys.length > 0) {
        const categoryUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
        categoryUrl.searchParams.set('select', selectColumns)
        categoryUrl.searchParams.set('limit', String(fetchLimit))
        categoryUrl.searchParams.set('categories', `ov.{${categoryKeys.join(',')}}`)
        if (city && available.has('city')) categoryUrl.searchParams.set('city', `ilike.*${city}*`)
        if (source && available.has(sourceColumn)) categoryUrl.searchParams.set(sourceColumn, `ilike.*${source}*`)
        categoryPrefetchRows = await fetchJson<Record<string, unknown>[]>(categoryUrl.toString(), { headers: geodataHeaders(key) }).catch(() => [])
      }
    }
    const rowPool = categoryPrefetchRows.length > 0
      ? Array.from(new Map([...categoryPrefetchRows, ...rawRows].map((row) => [String(row.id || row.source_id || row.provider_id || row.external_id || JSON.stringify(row)), row])).values())
      : rawRows
    const queryRows = query ? rowPool.filter((row) => rowMatchesQueryFuzzy(row, query)) : rowPool
    const categoryRows = categoryTerms.length > 0 ? rowPool.filter((row) => rowMatchesCategoryFuzzy(row, categoryTerms)) : []

    let strategy = 'query_match'
    let candidateRows = queryRows
    if (candidateRows.length === 0 && categoryRows.length > 0) {
      strategy = 'semantic_category_fallback'
      candidateRows = categoryRows
    }
    if (candidateRows.length === 0 && rowPool.length > 0) {
      strategy = 'broad_db_fallback'
      candidateRows = rowPool.filter(rowHasUsefulVenueSignal)
      if (candidateRows.length === 0) candidateRows = rowPool
    }

    const mapped = candidateRows
      .map((row) => mapGeodataRow(row, tableConfig))
      .map((row) => ({ ...row, score: scoreDbAutocompleteRow(row, query, strategy, center) }))

    const results = dedupePlaces(mapped)
      .sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name, 'hu'))
      .slice(0, limit)

    return {
      results,
      debug: {
        mode: 'db_autocomplete_resilient',
        runtime_version: PLACE_SEARCH_RUNTIME_VERSION,
        geodata_url: url,
        table: tableConfig.table,
        provider: tableConfig.provider,
        query,
        city,
        source,
        source_column: sourceColumn,
        explicit_category_terms: explicitCategoryTerms,
        semantic_category_terms: semanticTerms,
        mapper_expanded_category_terms: mapperExpansion.expandedTerms,
        mapper_match_count: mapperExpansion.matchedMappings.length,
        mapper_matches: mapperExpansion.matchedMappings,
        applied_category_terms: categoryTerms,
        fallback_strategy: strategy,
        fetch_limit: fetchLimit,
        raw_candidate_count: rawRows.length,
        category_prefetch_count: categoryPrefetchRows.length,
        row_pool_count: rowPool.length,
        query_candidate_count: queryRows.length,
        semantic_candidate_count: categoryRows.length,
        returned_row_count: results.length,
        response_ms: Math.round(nowMs() - startedAt),
        note: strategy === 'query_match'
          ? 'A DB autocomplete közvetlen név/cím/kategória egyezést talált.'
          : strategy === 'semantic_category_fallback'
            ? 'A beírt szöveg inkább tevékenységnek tűnt, ezért élő DB kategóriák alapján adtunk venue javaslatokat.'
            : 'Nem volt pontos DB találat, ezért stabil, hasznos venue fallback javaslatok jelennek meg üres lista helyett.',
      },
    }
  }

  async function discoverGeodataTableFacets(tableConfig: DbSearchTableConfig, params: SearchBody) {
    const startedAt = nowMs()
    const { url, key } = dependencies.resolveGeodataAuth()
    const sourceColumn = sourceColumnForTable(tableConfig.table)
    const limit = Math.min(Math.max(Number(params.limit || DISCOVERY_SAMPLE_LIMIT), 100), 10000)

    const countUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
    countUrl.searchParams.set('select', 'id')
    countUrl.searchParams.set('limit', '1')

    let rowCount: number | null = null
    let tableReachable = false
    try {
      const countResponse = await fetchImpl(countUrl.toString(), { headers: { ...geodataHeaders(key), Prefer: 'count=exact' } })
      tableReachable = countResponse.ok
      const contentRange = countResponse.headers.get('content-range') || ''
      const match = contentRange.match(/\/(\d+)$/)
      rowCount = match ? Number(match[1]) : null
    } catch {
      tableReachable = false
    }

    const restUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
    restUrl.searchParams.set('select', categoryDiscoverySelectColumns(tableConfig.table))
    restUrl.searchParams.set('limit', String(limit))
    if (tableColumns(tableConfig.table).has('city')) restUrl.searchParams.set('order', 'city.asc.nullslast')

    const rows = await fetchJson<Record<string, unknown>[]>(restUrl.toString(), { headers: geodataHeaders(key) })
    const safeRows = Array.isArray(rows) ? rows : []
    const categories = countValues(safeRows, rawCategoryValuesFromRow).slice(0, 250)
    const sources = countValues(safeRows, (row) => [row[sourceColumn], row.source_provider, row.datasource_name]).slice(0, 100)
    const cities = countValues(safeRows, (row) => [row.city]).slice(0, 100)

    return {
      runtime_version: PLACE_SEARCH_RUNTIME_VERSION,
      table: tableConfig.table,
      provider: tableConfig.provider,
      rowCount,
      sampleLimit: limit,
      sampleSize: safeRows.length,
      categories,
      sources,
      cities,
      responseMs: Math.round(nowMs() - startedAt),
      diagnostics: {
        tableReachable,
        hasAnyRows: (rowCount ?? safeRows.length) > 0,
        categoryCount: categories.length,
        sourceCount: sources.length,
        sourceColumn,
        mode: 'dynamic_database_discovery',
        note: 'Kategóriák és források élő adatbázis-mintából, statikus mapping fájl nélkül.',
      },
    }
  }

  async function queryGeodataTable(
    tableConfig: DbSearchTableConfig,
    params: SearchBody,
  ): Promise<{ results: ProviderPlace[]; rows: Record<string, unknown>[]; columns: string[]; totalCount: number | null; debug: Record<string, unknown> }> {
    const startedAt = nowMs()
    const { url, key } = dependencies.resolveGeodataAuth()
    const limit = Math.min(Math.max(Number(params.limit || 24), 1), 200)
    const city = postgrestSafe(params.city || '')
    const query = postgrestSafe(params.query || '')
    const categoryTerms = normalizeCategoryTerms(params.categories && params.categories.length > 0 ? params.categories : (params.category || params.activityHint || ''))
    const category = categoryTerms.join(', ')
    const source = postgrestSafe(params.source || '')
    const resultColumns = normalizeRequestedColumns(tableConfig.table, params.columns)
    const sourceColumn = sourceColumnForTable(tableConfig.table)
    const available = tableColumns(tableConfig.table)
    const selectColumns = buildSelectColumns(tableConfig.table, resultColumns)

    const applyDatabaseFilters = (restUrl: URL) => {
      if (city && available.has('city')) restUrl.searchParams.set('city', `ilike.*${city}*`)
      if (source && available.has(sourceColumn)) restUrl.searchParams.set(sourceColumn, `ilike.*${source}*`)
    }

    const countUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
    countUrl.searchParams.set('select', 'id')
    countUrl.searchParams.set('limit', '1')
    applyDatabaseFilters(countUrl)

    let databaseCount: number | null = null
    try {
      const countResponse = await fetchImpl(countUrl.toString(), {
        headers: { ...geodataHeaders(key), Prefer: 'count=exact' },
      })
      const contentRange = countResponse.headers.get('content-range') || ''
      const match = contentRange.match(/\/(\d+)$/)
      databaseCount = match ? Number(match[1]) : null
    } catch {
      databaseCount = null
    }

    // This admin test intentionally runs a direct table projection instead of the normal venue-search mapper:
    // SELECT selected_columns FROM selected_table WHERE optional city/source filters LIMIT requested_limit.
    // Category is applied as a lightweight row-content filter because the three source tables use different
    // category column types (text[], jsonb, and provider-specific text fields).
    const fetchLimit = (category || query) ? Math.min(Math.max(limit * 20, 500), 2000) : limit
    const restUrl = new URL(`${url}/rest/v1/${tablePath(tableConfig.table)}`)
    restUrl.searchParams.set('select', selectColumns)
    restUrl.searchParams.set('limit', String(fetchLimit))
    if (available.has('name')) restUrl.searchParams.set('order', 'name.asc.nullslast')
    applyDatabaseFilters(restUrl)

    const fetchedRows = await fetchJson<Record<string, unknown>[]>(restUrl.toString(), {
      headers: geodataHeaders(key),
    })

    const rawRows = Array.isArray(fetchedRows) ? fetchedRows : []
    const queryRows = query ? rawRows.filter((row) => rowMatchesQueryFuzzy(row, query)) : rawRows
    const exactCategoryRows = categoryTerms.length > 0 ? queryRows.filter((row) => rowMatchesCategoryExact(row, categoryTerms)) : queryRows
    const fuzzyCategoryRows = categoryTerms.length > 0 && exactCategoryRows.length === 0
      ? queryRows.filter((row) => rowMatchesCategoryFuzzy(row, categoryTerms))
      : exactCategoryRows
    const filteredRows = fuzzyCategoryRows
    const categoryMatchStrategy = categoryTerms.length === 0
      ? 'no_category_filter'
      : exactCategoryRows.length > 0
        ? 'category_exact'
        : 'category_ilike_fallback'
    const limitedRows = filteredRows.slice(0, limit)
    const mapped = limitedRows.map((row) => ({ ...mapGeodataRow(row, tableConfig), score: 0 }))
    const totalCount = (categoryTerms.length > 0 || query) ? filteredRows.length : databaseCount

    return {
      results: mapped,
      rows: limitedRows.map((row) => pickColumns(row, resultColumns)),
      columns: resultColumns,
      totalCount,
      debug: {
        mode: 'direct_table_select',
        runtime_version: PLACE_SEARCH_RUNTIME_VERSION,
        pseudo_sql: buildPseudoSql(tableConfig.table, resultColumns, { city, category, query, source, sourceColumn, limit }),
        geodata_url: url,
        table: tableConfig.table,
        provider: tableConfig.provider,
        city,
        category,
        category_terms: categoryTerms,
        category_match_strategy: categoryMatchStrategy,
        source,
        source_column: sourceColumn,
        selected_columns: resultColumns,
        select_columns_sent_to_postgrest: selectColumns,
        requested_limit: limit,
        fetch_limit: fetchLimit,
        database_count_before_category_filter: databaseCount,
        total_count: totalCount,
        raw_candidate_count: rawRows.length,
        filtered_candidate_count: filteredRows.length,
        returned_row_count: limitedRows.length,
        response_ms: Math.round(nowMs() - startedAt),
        count_note: categoryTerms.length > 0
          ? 'Smart Filter: először pontos kategóriaegyezés, 0 találatnál tartalmazás/ilike jellegű fallback fut az élő DB-mintán.'
          : 'A számosság PostgREST exact count alapján jött a város/forrás szűrőkre.',
      },
    }
  }

  return {
    autocompleteGeodataPlaces,
    discoverGeodataTableFacets,
    queryGeodataTable,
  }
}

export type LocalDbRepository = ReturnType<typeof createLocalDbRepository>
