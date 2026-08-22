import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalDbRepository } from '../../../supabase/functions/place-search/localDbRepository'
import {
  getProviderConfigValue,
  requireProviderMode,
  sanitizeDbTableConfigs,
} from '../../../supabase/functions/place-search/providerConfigRepository'
import type { FetchLike } from '../../../supabase/functions/place-search/runtime'
import type { DbSearchTableConfig } from '../../../supabase/functions/place-search/types'

const tableConfig: DbSearchTableConfig = {
  id: 'unified',
  provider: 'db:unified',
  label: 'Unified',
  table: 'public.unified_pois',
  enabled: true,
}

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('place-search provider configuration repository', () => {
  it('keeps enabled allowlisted DB providers deterministic and collision-safe', () => {
    const rows = sanitizeDbTableConfigs([
      { table: 'public.unified_pois', label: 'Közös POI' },
      { table: 'public.local_pois', label: 'Közös POI' },
      { table: 'public.geoapify_pois', label: 'Kikapcsolt', enabled: false },
    ])
    expect(rows.map(({ id, provider, table, enabled }) => ({ id, provider, table, enabled }))).toEqual([
      { id: 'kozos-poi', provider: 'db:kozos-poi', table: 'public.unified_pois', enabled: true },
      { id: 'kozos-poi-2', provider: 'db:kozos-poi-2', table: 'public.local_pois', enabled: true },
    ])
    expect(() => sanitizeDbTableConfigs([{ table: 'public.profiles', label: 'Tiltott' }])).toThrow(/Invalid Geodata table/)
  })

  it('falls back from a missing group row to the persisted default provider', async () => {
    const requestedUrls: string[] = []
    const payloads = [[], [{ key: 'address_search', provider: 'db:unified', options: {} }]]
    const fetchImpl: FetchLike = vi.fn(async (input) => {
      requestedUrls.push(String(input))
      return jsonResponse(payloads.shift() ?? [])
    })
    vi.stubGlobal('fetch', fetchImpl)

    await expect(getProviderConfigValue('https://project.supabase.co', 'service-role', 'venue')).resolves.toBe('db:unified')
    expect(requestedUrls).toHaveLength(2)
    expect(requestedUrls[0]).toContain('key=eq.address_search%3Avenue')
    expect(requestedUrls[1]).toContain('key=eq.address_search&')
  })

  it('keeps provider validation fail-closed', () => {
    expect(requireProviderMode('geoapify_tomtom')).toBe('geoapify_tomtom')
    expect(requireProviderMode('db:unified')).toBe('db:unified')
    expect(() => requireProviderMode('{{provider}}')).toThrow(/Unresolved/)
    expect(() => requireProviderMode('shell')).toThrow(/Invalid provider/)
  })
})

describe('place-search local DB repository with mocked PostgREST', () => {
  it('preserves semantic-category fallback, mapping, deterministic ranking and debug shape', async () => {
    const requestedUrls: string[] = []
    const rows = [{
      id: 'poi-1',
      source_provider: 'osm',
      name: 'Közösségi pince',
      categories: ['catering.pub'],
      formatted_address: 'Fő utca 1',
      city: 'Budapest',
      lat: 47.5,
      lon: 19.05,
    }]
    const fetchImpl: FetchLike = vi.fn(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.includes('provider_category_mapper')) return jsonResponse([])
      if (url.includes('categories=ov.')) return jsonResponse([])
      return jsonResponse(rows)
    })
    let now = 0
    const repository = createLocalDbRepository({
      resolveGeodataAuth: () => ({ url: 'https://geodata.supabase.co', key: 'anon-jwt' }),
      fetchImpl,
      nowMs: () => {
        now += 12
        return now
      },
    })

    const result = await repository.autocompleteGeodataPlaces(tableConfig, {
      action: 'autocomplete',
      query: 'társasjáték est',
      city: 'Budapest',
      limit: 5,
    })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      provider: 'db:unified',
      external_id: 'poi-1',
      name: 'Közösségi pince',
      match_type: 'db',
    })
    expect(result.debug).toMatchObject({
      mode: 'db_autocomplete_resilient',
      fallback_strategy: 'semantic_category_fallback',
      raw_candidate_count: 1,
      returned_row_count: 1,
      response_ms: 12,
    })
    expect(requestedUrls.some((url) => url.includes('provider_category_mapper'))).toBe(true)
    expect(requestedUrls.some((url) => url.includes('unified_pois'))).toBe(true)
  })

  it('preserves direct-table projection and exact-count serialization', async () => {
    const fetchImpl: FetchLike = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.searchParams.get('select') === 'id' && url.searchParams.get('limit') === '1') {
        return jsonResponse([], { headers: { 'content-range': '0-0/12' } })
      }
      return jsonResponse([{
        id: 'poi-1',
        name: 'Kávézó',
        city: 'Budapest',
        categories: ['catering.cafe'],
        lat: 47.5,
        lon: 19.05,
      }])
    })
    let now = 0
    const repository = createLocalDbRepository({
      resolveGeodataAuth: () => ({ url: 'https://geodata.supabase.co', key: 'sb_secret_key' }),
      fetchImpl,
      nowMs: () => {
        now += 7
        return now
      },
    })

    const result = await repository.queryGeodataTable(tableConfig, {
      action: 'test_db_table_query',
      table: 'public.unified_pois',
      columns: ['id', 'name', 'city'],
      limit: 5,
    })
    expect(result.totalCount).toBe(12)
    expect(result.columns).toEqual(['id', 'name', 'city'])
    expect(result.rows).toEqual([{ id: 'poi-1', name: 'Kávézó', city: 'Budapest' }])
    expect(result.debug).toMatchObject({
      mode: 'direct_table_select',
      database_count_before_category_filter: 12,
      total_count: 12,
      response_ms: 7,
    })
  })
})

