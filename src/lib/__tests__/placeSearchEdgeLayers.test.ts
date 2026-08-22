import { describe, expect, it, vi } from 'vitest'
import {
  bodyCenter,
  geoapifyCategoryFilter,
  mapGeodataRow,
  normalizeCategory,
  rankExternalPlaces,
  tomTomQuery,
} from '../../../supabase/functions/place-search/normalization'
import {
  searchExternalProviders,
  searchGeoapify,
  searchTomTom,
  type ProviderJsonFetcher,
} from '../../../supabase/functions/place-search/externalProviders'
import { fetchProviderJson, type FetchLike } from '../../../supabase/functions/place-search/runtime'
import type { DbSearchTableConfig, ProviderPlace } from '../../../supabase/functions/place-search/types'

const tableConfig: DbSearchTableConfig = {
  id: 'unified',
  provider: 'db:unified',
  label: 'Unified',
  table: 'public.unified_pois',
  enabled: true,
}

describe('place-search normalization and deterministic ranking', () => {
  it('keeps the historical category mapping and provider filters', () => {
    expect(normalizeCategory('Társasjáték')).toBe('pub')
    expect(normalizeCategory('gasztro')).toBe('restaurant')
    expect(geoapifyCategoryFilter('sport')).toBe('leisure,sport')
    expect(tomTomQuery('kávézó')).toBe('cafe')
  })

  it('maps a local geodata row to the existing provider response shape', () => {
    expect(mapGeodataRow({
      id: 'poi-1',
      source_provider: 'osm',
      name: 'Közösségi tér',
      categories: ['community.club'],
      formatted_address: 'Fő utca 1, Budapest',
      city: 'Budapest',
      lat: 47.5,
      lon: 19.05,
      phone: '+361234',
    }, tableConfig)).toMatchObject({
      provider: 'db:unified',
      external_id: 'poi-1',
      name: 'Közösségi tér',
      category: 'community.club',
      categories: ['community.club'],
      address: 'Fő utca 1, Budapest',
      city: 'Budapest',
      latitude: 47.5,
      longitude: 19.05,
      phone: '+361234',
      match_type: 'db',
    })
  })

  it('deduplicates by the historical identity and keeps stable order for score ties', () => {
    const places: ProviderPlace[] = [
      { provider: 'geoapify', external_id: 'a', name: 'A', address: 'X', match_type: 'nearby' },
      { provider: 'tomtom', external_id: 'b', name: 'B', address: 'Y', match_type: 'nearby' },
      { provider: 'tomtom', external_id: 'a2', name: 'A', address: 'X', match_type: 'query' },
    ]
    const ranked = rankExternalPlaces(places, '', null, 10)
    expect(ranked.map(({ external_id }) => external_id)).toEqual(['a2', 'b'])
    expect(rankExternalPlaces(places.slice(0, 2), '', null, 10).map(({ external_id }) => external_id)).toEqual(['a', 'b'])
  })

  it('preserves coordinate precedence', () => {
    expect(bodyCenter({ latitude: 47.5, longitude: 19.05, lat: 1, lon: 2 })).toEqual({ latitude: 47.5, longitude: 19.05 })
    expect(bodyCenter({ bias: { lat: 47.4, lon: 19.1 } })).toEqual({ latitude: 47.4, longitude: 19.1 })
  })
})

describe('place-search provider adapters with mocked network', () => {
  it('normalizes Geoapify and TomTom without exposing provider-specific response envelopes', async () => {
    const requestedUrls: string[] = []
    const fetchJson: ProviderJsonFetcher = async <T>(url: string) => {
      requestedUrls.push(url)
      if (url.includes('geoapify.com/v2/places')) {
        return {
          features: [{
            geometry: { coordinates: [19.05, 47.5] },
            properties: {
              place_id: 'geo-1',
              name: 'Geo kávézó',
              categories: ['catering.cafe'],
              formatted: 'Geo utca 1',
              city: 'Budapest',
              distance: 1000,
            },
          }],
        } as T
      }
      return {
        results: [{
          id: 'tom-1',
          dist: 2000,
          position: { lat: 47.51, lon: 19.06 },
          address: { freeformAddress: 'Tom utca 2', municipality: 'Budapest' },
          poi: { name: 'Tom kávézó', categories: ['cafe'], classifications: [{ code: 'CAFE' }] },
        }],
      } as T
    }

    const result = await searchExternalProviders({
      action: 'autocomplete',
      query: 'kávézó',
      lat: 47.5,
      lon: 19.05,
      limit: 10,
    }, { geoapifyKey: 'geo-key', tomtomKey: 'tom-key' }, fetchJson)

    expect(requestedUrls).toHaveLength(2)
    expect(requestedUrls[0]).toContain('api.geoapify.com/v2/places')
    expect(requestedUrls[1]).toContain('api.tomtom.com/search/2/search/k%C3%A1v%C3%A9z%C3%B3.json')
    expect(result.results.map(({ provider, external_id }) => `${provider}:${external_id}`)).toEqual([
      'geoapify:geo-1',
      'tomtom:tom-1',
    ])
    expect(result.debug).toMatchObject({ geoapify_count: 1, tomtom_count: 1, provider_mode: 'geoapify_tomtom' })
  })

  it('keeps provider failures isolated as an empty contribution', async () => {
    const fetchJson: ProviderJsonFetcher = async <T>(url: string) => {
      if (url.includes('geoapify')) throw new Error('geo down')
      return { results: [{ id: 'tom-1', poi: { name: 'Tom venue' }, position: { lat: 47.5, lon: 19.05 } }] } as T
    }
    const result = await searchExternalProviders(
      { action: 'autocomplete', lat: 47.5, lon: 19.05 },
      { geoapifyKey: 'geo-key', tomtomKey: 'tom-key' },
      fetchJson,
    )
    expect(result.results).toHaveLength(1)
    expect(result.debug).toMatchObject({ geoapify_count: 0, tomtom_count: 1 })
  })

  it('keeps individual adapter URLs and sparse payload fallback stable', async () => {
    const fetchJson: ProviderJsonFetcher = async <T>(url: string) => {
      if (url.includes('geoapify')) return { features: [{ properties: {}, geometry: { coordinates: [] } }] } as T
      return { results: [{ address: { freeformAddress: 'Ismeretlen cím' } }] } as T
    }
    expect((await searchGeoapify({ category: 'sport' }, 'key', null, '', fetchJson))[0]).toMatchObject({
      provider: 'geoapify', name: 'Helyszín', category: 'leisure', match_type: 'nearby',
    })
    expect((await searchTomTom({}, 'key', null, '', fetchJson))[0]).toMatchObject({
      provider: 'tomtom', name: 'Ismeretlen cím', category: 'venue', match_type: 'nearby',
    })
  })
})

describe('place-search provider fetch retry', () => {
  it('retries one 429 response and then returns JSON', async () => {
    const responses = [
      new Response('', { status: 429 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]
    const fetchImpl: FetchLike = vi.fn(async () => responses.shift() ?? new Response('', { status: 500 }))
    const wait = vi.fn(async () => undefined)
    await expect(fetchProviderJson<{ ok: boolean }>('https://provider.test', 1000, fetchImpl, wait)).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(150)
  })

  it('does not retry a non-rate-limited 400 response', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('', { status: 400 }))
    await expect(fetchProviderJson('https://provider.test', 1000, fetchImpl, vi.fn())).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

