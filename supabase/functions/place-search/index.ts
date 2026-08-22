import { requireAdminUser } from '../shared/adminAuth.ts'
import { correlationIdFromRequest, logEdgeEvent } from '../shared/edgeObservability.ts'
import { resolveVerifiedInternalProjectUrl } from '../shared/projectContract.ts'
import { searchExternalProviders as searchExternalProvidersWithAdapters } from './externalProviders.ts'
import { createPlaceSearchHandler } from './handler.ts'
import { createLocalDbRepository } from './localDbRepository.ts'
import {
  GEODATA_DEFAULT_URL,
  getAllProviderConfigValues,
  getDbTableConfigs,
  getProviderConfigValue,
  resolveDbTableConfig,
  saveDbTableConfigs,
  saveProviderConfigValue,
} from './providerConfigRepository.ts'
import { HttpError, normalizeUrl } from './runtime.ts'

function resolveInternalSupabaseUrl(request: Request) {
  try {
    return resolveVerifiedInternalProjectUrl({
      envUrl: Deno.env.get('SUPABASE_URL'),
      requestUrl: request.url,
    })
  } catch {
    throw new HttpError('SUPABASE_PROJECT_CONTRACT_FAILED', 500)
  }
}

function resolveInternalServiceRoleKey() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
  if (!key) {
    throw new HttpError('Missing SUPABASE_SERVICE_ROLE_KEY for Hobbeast runtime configuration writes.', 500)
  }
  return key
}

function resolveGeodataAuth() {
  const url = normalizeUrl(Deno.env.get('GEODATA_SUPABASE_URL') || GEODATA_DEFAULT_URL)
  const key =
    Deno.env.get('GEODATA_SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_SECRET_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_ANON_KEY') ||
    Deno.env.get('GEODATA_SUPABASE_PUBLISHABLE_KEY') ||
    ''

  if (!url) throw new HttpError('Missing GEODATA_SUPABASE_URL', 500)
  if (!key) {
    throw new HttpError('Missing Geodata Supabase key. Set GEODATA_SUPABASE_SERVICE_ROLE_KEY or GEODATA_SUPABASE_SECRET_KEY.', 500)
  }
  return { url, key }
}

const providerConfigRepository = {
  getProviderConfigValue,
  getAllProviderConfigValues,
  saveProviderConfigValue,
  getDbTableConfigs,
  saveDbTableConfigs,
  resolveDbTableConfig,
}

const localDbRepository = createLocalDbRepository({ resolveGeodataAuth })

const handler = createPlaceSearchHandler({
  requireAdminUser,
  correlationIdFromRequest,
  logEdgeEvent,
  resolveInternalSupabaseUrl,
  resolveInternalServiceRoleKey,
  providerConfigRepository,
  localDbRepository,
  searchExternalProviders: (body) => searchExternalProvidersWithAdapters(body, {
    geoapifyKey: Deno.env.get('GEOAPIFY_API_KEY') || '',
    tomtomKey: Deno.env.get('TOMTOM_API_KEY') || Deno.env.get('TOMTOM_SEARCH_API_KEY') || '',
  }),
})

Deno.serve(handler)
