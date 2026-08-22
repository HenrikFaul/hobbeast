import {
  PLACE_SEARCH_ADMIN_ACTIONS,
  parsePlaceSearchRequest,
  type ProviderConfigAction,
  type ProviderConfigGroup,
  type ProviderMode,
  type SearchBody,
} from './requestContract.ts'
import {
  corsHeaders,
  errorJson,
  HttpError,
  json,
  PLACE_SEARCH_RUNTIME_VERSION,
  statusForRequestError,
} from './runtime.ts'
import {
  DB_TABLE_CONFIG_KEY,
  GEODATA_AVAILABLE_TABLES,
  GEODATA_DEFAULT_URL,
  isDbProvider,
  normalizeProviderConfigValue,
  requireProviderGroup,
  requireProviderMode,
} from './providerConfigRepository.ts'
import type { LocalDbRepository } from './localDbRepository.ts'
import type { DbSearchTableConfig, ProviderPlace } from './types.ts'

export interface ProviderConfigRepositoryApi {
  getProviderConfigValue: (supabaseUrl: string, serviceRoleKey: string, group: ProviderConfigGroup) => Promise<ProviderMode>
  getAllProviderConfigValues: (supabaseUrl: string, serviceRoleKey: string) => Promise<Record<ProviderConfigGroup, ProviderMode>>
  saveProviderConfigValue: (supabaseUrl: string, serviceRoleKey: string, group: ProviderConfigGroup, provider: ProviderMode) => Promise<ProviderMode>
  getDbTableConfigs: (supabaseUrl: string, serviceRoleKey: string) => Promise<DbSearchTableConfig[]>
  saveDbTableConfigs: (supabaseUrl: string, serviceRoleKey: string, tables: unknown) => Promise<DbSearchTableConfig[]>
  resolveDbTableConfig: (
    supabaseUrl: string,
    serviceRoleKey: string,
    provider?: unknown,
    directTable?: unknown,
    directLabel?: unknown,
  ) => Promise<DbSearchTableConfig>
}

export interface PlaceSearchHandlerDependencies {
  requireAdminUser: (request: Request) => Promise<unknown>
  correlationIdFromRequest: (request: Request) => string
  logEdgeEvent: (
    level: 'info' | 'warn' | 'error',
    event: string,
    correlationId: string,
    details: Record<string, unknown>,
  ) => void
  resolveInternalSupabaseUrl: (request: Request) => string
  resolveInternalServiceRoleKey: () => string
  providerConfigRepository: ProviderConfigRepositoryApi
  localDbRepository: LocalDbRepository
  searchExternalProviders: (body: SearchBody) => Promise<{ results: ProviderPlace[]; debug: Record<string, unknown> }>
  nowMs?: () => number
}

async function handleConfigAction(
  action: ProviderConfigAction,
  body: SearchBody,
  request: Request,
  dependencies: PlaceSearchHandlerDependencies,
) {
  const supabaseUrl = dependencies.resolveInternalSupabaseUrl(request)
  const serviceRoleKey = dependencies.resolveInternalServiceRoleKey()
  const repository = dependencies.providerConfigRepository

  if (action === 'get_provider_config') {
    const group = requireProviderGroup(body.group)
    const provider = await repository.getProviderConfigValue(supabaseUrl, serviceRoleKey, group)
    return json({ group, provider })
  }

  if (action === 'get_all_provider_configs') {
    const [providers, dbTables] = await Promise.all([
      repository.getAllProviderConfigValues(supabaseUrl, serviceRoleKey),
      repository.getDbTableConfigs(supabaseUrl, serviceRoleKey),
    ])
    return json({ providers, dbTables, runtime: { dbTableConfigKey: DB_TABLE_CONFIG_KEY } })
  }

  if (action === 'save_provider_config') {
    const group = requireProviderGroup(body.group)
    const provider = requireProviderMode(body.provider)
    const saved = await repository.saveProviderConfigValue(supabaseUrl, serviceRoleKey, group, provider)
    const providers = await repository.getAllProviderConfigValues(supabaseUrl, serviceRoleKey)
    return json({ group, provider: saved, providers })
  }

  if (action === 'get_db_table_config') {
    const tables = await repository.getDbTableConfigs(supabaseUrl, serviceRoleKey)
    return json({ runtime_version: PLACE_SEARCH_RUNTIME_VERSION, availableTables: GEODATA_AVAILABLE_TABLES, tables, geodata_url: GEODATA_DEFAULT_URL })
  }

  if (action === 'save_db_table_config') {
    const tables = await repository.saveDbTableConfigs(supabaseUrl, serviceRoleKey, body.tables || [])
    return json({ runtime_version: PLACE_SEARCH_RUNTIME_VERSION, availableTables: GEODATA_AVAILABLE_TABLES, tables, geodata_url: GEODATA_DEFAULT_URL })
  }

  return null
}

export function createPlaceSearchHandler(dependencies: PlaceSearchHandlerDependencies) {
  const nowMs = dependencies.nowMs ?? (() => performance.now())

  return async (request: Request) => {
    const correlationId = dependencies.correlationIdFromRequest(request)
    const startedAt = nowMs()
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: { ...corsHeaders, 'x-correlation-id': correlationId } })
    }

    try {
      if (request.method !== 'POST') throw new HttpError('Method not allowed', 405)
      const body = await parsePlaceSearchRequest(request)
      const action = body.action || 'autocomplete'
      if (PLACE_SEARCH_ADMIN_ACTIONS.has(action)) await dependencies.requireAdminUser(request)

      const configResponse = await handleConfigAction(action, body, request, dependencies)
      if (configResponse) {
        configResponse.headers.set('x-correlation-id', correlationId)
        dependencies.logEdgeEvent('info', 'place_search_request', correlationId, {
          action,
          outcome: 'success',
          duration_ms: Math.round(nowMs() - startedAt),
        })
        return configResponse
      }

      const supabaseUrl = dependencies.resolveInternalSupabaseUrl(request)
      const serviceRoleKey = dependencies.resolveInternalServiceRoleKey()
      const repository = dependencies.providerConfigRepository

      if (action === 'discover_db_table_facets') {
        const tableConfig = await repository.resolveDbTableConfig(supabaseUrl, serviceRoleKey, body.provider, body.table, body.label)
        const discovery = await dependencies.localDbRepository.discoverGeodataTableFacets(tableConfig, body)
        const response = json(discovery)
        response.headers.set('x-correlation-id', correlationId)
        return response
      }

      if (action === 'test_db_table_query') {
        const tableConfig = await repository.resolveDbTableConfig(supabaseUrl, serviceRoleKey, body.provider, body.table, body.label)
        const { results, rows, columns, totalCount, debug } = await dependencies.localDbRepository.queryGeodataTable(tableConfig, body)
        const response = json({ runtime_version: PLACE_SEARCH_RUNTIME_VERSION, results, rows, columns, totalCount, debug })
        response.headers.set('x-correlation-id', correlationId)
        return response
      }

      const requestedProvider = body.provider_mode || body.provider
      const providerMode = requestedProvider
        ? normalizeProviderConfigValue(requestedProvider)
        : await repository.getProviderConfigValue(supabaseUrl, serviceRoleKey, requireProviderGroup(body.group || 'default'))

      if (isDbProvider(providerMode)) {
        if (action === 'reverse') {
          // DB-backed reverse lookup is intentionally not implemented in this hotfix.
          // Return a safe empty response instead of falling through to text autocomplete.
          const response = json({
            runtime_version: PLACE_SEARCH_RUNTIME_VERSION,
            results: [],
            debug: {
              action,
              provider_mode: providerMode,
              mode: 'db_reverse_noop',
              note: 'reverse lookup is not supported by the db:* autocomplete handler',
            },
          })
          response.headers.set('x-correlation-id', correlationId)
          return response
        }

        const tableConfig = await repository.resolveDbTableConfig(supabaseUrl, serviceRoleKey, providerMode)
        const { results, debug } = await dependencies.localDbRepository.autocompleteGeodataPlaces(tableConfig, body)
        const response = json({ runtime_version: PLACE_SEARCH_RUNTIME_VERSION, results, debug })
        response.headers.set('x-correlation-id', correlationId)
        return response
      }

      const { results, debug } = await dependencies.searchExternalProviders(body)
      const response = json({ results, debug: { ...debug, requested_provider: providerMode } })
      response.headers.set('x-correlation-id', correlationId)
      dependencies.logEdgeEvent('info', 'place_search_request', correlationId, {
        action,
        provider_mode: providerMode,
        result_count: results.length,
        outcome: 'success',
        duration_ms: Math.round(nowMs() - startedAt),
      })
      return response
    } catch (error) {
      const status = statusForRequestError(error)
      dependencies.logEdgeEvent(status >= 500 ? 'error' : 'warn', 'place_search_request', correlationId, {
        outcome: 'error',
        status,
        error_type: error instanceof Error ? error.name : 'unknown',
        duration_ms: Math.round(nowMs() - startedAt),
      })
      const response = errorJson(error, status)
      response.headers.set('x-correlation-id', correlationId)
      return response
    }
  }
}

