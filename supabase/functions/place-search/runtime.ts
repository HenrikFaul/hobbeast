import { PlaceSearchContractError } from './requestContract.ts'

export const PLACE_SEARCH_RUNTIME_VERSION = 'v1.7.6-stable-db-autocomplete'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status = 500, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function normalizeUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorJson(error: unknown, fallbackStatus = 500) {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
  const status = error instanceof HttpError ? error.status : fallbackStatus
  const details = error instanceof HttpError ? error.details : undefined
  const message = status >= 500 ? 'Place search is temporarily unavailable.' : rawMessage
  console.error('[place-search] error', { status, error_type: error instanceof Error ? error.name : 'unknown' })
  return json({ error: message, ...(status < 500 && details !== undefined ? { details } : {}), runtime_version: PLACE_SEARCH_RUNTIME_VERSION }, status)
}

export function statusForRequestError(error: unknown) {
  if (error instanceof HttpError || error instanceof PlaceSearchContractError) return error.status
  const message = error instanceof Error ? error.message : ''
  if (message === 'Missing authorization token.' || message.startsWith('Unauthorized request:')) return 401
  if (message === 'Admin access required.') return 403
  return 500
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
  fetchImpl: FetchLike = fetch,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const upstreamAbort = () => controller.abort()
  init.signal?.addEventListener('abort', upstreamAbort, { once: true })
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', upstreamAbort)
  }
}

export async function fetchProviderJson<T>(
  url: string,
  timeoutMs = 8_000,
  fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchWithTimeout(url, {}, timeoutMs, fetchImpl).catch(() => null)
    if (response?.ok) return await response.json() as T
    if (!response || (response.status !== 429 && response.status < 500)) return null
    if (attempt === 0) await wait(150)
  }
  return null
}

export async function restFetch(url: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch) {
  const response = await fetchWithTimeout(url, init, 10_000, fetchImpl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new HttpError(`${response.status} ${response.statusText}: ${text}`, response.status, { url })
  }
  return response
}

export async function restFetchJson<T = unknown>(url: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await restFetch(url, init, fetchImpl)
  return await response.json() as T
}

