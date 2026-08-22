import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPlaceSearchHandler,
  type PlaceSearchHandlerDependencies,
  type ProviderConfigRepositoryApi,
} from '../../../supabase/functions/place-search/handler'
import type { LocalDbRepository } from '../../../supabase/functions/place-search/localDbRepository'
import { PLACE_SEARCH_RUNTIME_VERSION } from '../../../supabase/functions/place-search/runtime'
import type { DbSearchTableConfig } from '../../../supabase/functions/place-search/types'

const tableConfig: DbSearchTableConfig = {
  id: 'unified',
  provider: 'db:unified',
  label: 'Unified',
  table: 'public.unified_pois',
  enabled: true,
}

const requireAdminUser = vi.fn(async (_request: Request) => ({ id: 'admin-1' }))
const logEdgeEvent = vi.fn()
const getProviderConfigValue = vi.fn(async () => 'geoapify_tomtom' as const)
const getAllProviderConfigValues = vi.fn(async () => ({
  default: 'geoapify_tomtom' as const,
  personal: 'geoapify_tomtom' as const,
  venue: 'db:unified' as const,
  trip_planner: 'mapy' as const,
}))
const saveProviderConfigValue = vi.fn(async () => 'geoapify_tomtom' as const)
const getDbTableConfigs = vi.fn(async () => [tableConfig])
const saveDbTableConfigs = vi.fn(async () => [tableConfig])
const resolveDbTableConfig = vi.fn(async () => tableConfig)
const autocompleteGeodataPlaces = vi.fn(async () => ({ results: [], debug: { mode: 'db_autocomplete_resilient' } }))
const discoverGeodataTableFacets = vi.fn(async () => ({ table: tableConfig.table, categories: [] }))
const queryGeodataTable = vi.fn(async () => ({ results: [], rows: [], columns: ['id'], totalCount: 0, debug: { mode: 'direct_table_select' } }))
const searchExternalProviders = vi.fn(async () => ({
  results: [{ provider: 'geoapify', external_id: 'place-1', name: 'Kávézó' }],
  debug: { provider_mode: 'geoapify_tomtom', geoapify_count: 1, tomtom_count: 0 },
}))

const providerConfigRepository: ProviderConfigRepositoryApi = {
  getProviderConfigValue,
  getAllProviderConfigValues,
  saveProviderConfigValue,
  getDbTableConfigs,
  saveDbTableConfigs,
  resolveDbTableConfig,
}

const localDbRepository: LocalDbRepository = {
  autocompleteGeodataPlaces,
  discoverGeodataTableFacets,
  queryGeodataTable,
}

function dependencies(): PlaceSearchHandlerDependencies {
  let time = 0
  return {
    requireAdminUser,
    correlationIdFromRequest: () => 'corr-123',
    logEdgeEvent,
    resolveInternalSupabaseUrl: () => 'https://project.supabase.co',
    resolveInternalServiceRoleKey: () => 'service-role',
    providerConfigRepository,
    localDbRepository,
    searchExternalProviders,
    nowMs: () => {
      time += 5
      return time
    },
  }
}

function post(body: Record<string, unknown>) {
  return new Request('https://project.supabase.co/functions/v1/place-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

describe('place-search handler characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigValue.mockResolvedValue('geoapify_tomtom')
    requireAdminUser.mockResolvedValue({ id: 'admin-1' })
  })

  it('keeps preflight public and correlation-aware', async () => {
    const response = await createPlaceSearchHandler(dependencies())(new Request('https://example.test', { method: 'OPTIONS' }))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(response.headers.get('x-correlation-id')).toBe('corr-123')
    expect(requireAdminUser).not.toHaveBeenCalled()
  })

  it('keeps every admin config action behind auth and preserves config response serialization', async () => {
    const response = await createPlaceSearchHandler(dependencies())(post({ action: 'get_all_provider_configs' }))
    expect(requireAdminUser).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe(JSON.stringify({
      providers: {
        default: 'geoapify_tomtom',
        personal: 'geoapify_tomtom',
        venue: 'db:unified',
        trip_planner: 'mapy',
      },
      dbTables: [tableConfig],
      runtime: { dbTableConfigKey: 'address_search:db_tables' },
    }))
    expect(response.headers.get('x-correlation-id')).toBe('corr-123')
  })

  it('preserves the historical non-admin get_provider_config action and group fallback contract', async () => {
    getProviderConfigValue.mockResolvedValue('db:unified')
    const response = await createPlaceSearchHandler(dependencies())(post({ action: 'get_provider_config', group: 'venue' }))
    expect(requireAdminUser).not.toHaveBeenCalled()
    expect(getProviderConfigValue).toHaveBeenCalledWith('https://project.supabase.co', 'service-role', 'venue')
    expect(await response.text()).toBe(JSON.stringify({ group: 'venue', provider: 'db:unified' }))
  })

  it('keeps DB reverse as an explicit no-op without invoking DB autocomplete', async () => {
    const response = await createPlaceSearchHandler(dependencies())(post({
      action: 'reverse',
      lat: 47.5,
      lon: 19.05,
      provider_mode: 'db:unified',
    }))
    expect(await response.text()).toBe(JSON.stringify({
      runtime_version: PLACE_SEARCH_RUNTIME_VERSION,
      results: [],
      debug: {
        action: 'reverse',
        provider_mode: 'db:unified',
        mode: 'db_reverse_noop',
        note: 'reverse lookup is not supported by the db:* autocomplete handler',
      },
    }))
    expect(autocompleteGeodataPlaces).not.toHaveBeenCalled()
    expect(response.headers.get('x-correlation-id')).toBe('corr-123')
  })

  it('preserves configured-provider fallback and the external response shape', async () => {
    const response = await createPlaceSearchHandler(dependencies())(post({ action: 'autocomplete', query: 'kávézó', group: 'personal' }))
    expect(getProviderConfigValue).toHaveBeenCalledWith('https://project.supabase.co', 'service-role', 'personal')
    expect(searchExternalProviders).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe(JSON.stringify({
      results: [{ provider: 'geoapify', external_id: 'place-1', name: 'Kávézó' }],
      debug: {
        provider_mode: 'geoapify_tomtom',
        geoapify_count: 1,
        tomtom_count: 0,
        requested_provider: 'geoapify_tomtom',
      },
    }))
  })

  it('normalizes admin authorization failures and unsupported methods without leaking internals', async () => {
    requireAdminUser.mockRejectedValueOnce(new Error('Admin access required.'))
    const forbidden = await createPlaceSearchHandler(dependencies())(post({ action: 'get_db_table_config' }))
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ error: 'Admin access required.', runtime_version: PLACE_SEARCH_RUNTIME_VERSION })

    const method = await createPlaceSearchHandler(dependencies())(new Request('https://example.test', { method: 'GET' }))
    expect(method.status).toBe(405)
    expect(await method.json()).toEqual({ error: 'Method not allowed', runtime_version: PLACE_SEARCH_RUNTIME_VERSION })
  })
})

