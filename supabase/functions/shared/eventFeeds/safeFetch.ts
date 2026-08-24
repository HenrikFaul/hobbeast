import { EVENT_FEED_LIMITS } from './types.ts';
import { pinnedHttpsFetch, type PinnedHttpsFetch } from './pinnedHttps.ts';

export interface RegisteredFeedSource {
  sourceId: string;
  endpointUrl: string;
  allowedHost: string;
  etag?: string | null;
  lastModified?: string | null;
}

export type FeedSourceRegistry = ReadonlyMap<string, RegisteredFeedSource> | Readonly<Record<string, RegisteredFeedSource>>;

export interface SafeFeedFetchDependencies {
  /** Explicit test/controlled adapter only. Production defaults to the pinned transport. */
  fetchImpl?: typeof fetch;
  pinnedFetchImpl?: PinnedHttpsFetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  authorizeRequest?: (url: URL, redirectCount: number) => Promise<void> | void;
}

export interface SafeFeedFetchOptions {
  maxBodyBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  userAgent?: string;
  returnHttpErrors?: boolean;
  acceptEmptySuccess?: boolean;
}

export interface SafeFeedFetchResult {
  status: 'ok' | 'not_modified';
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  body: string | null;
  bodyBytes: number;
}

export type SafeFeedFetchErrorCode =
  | 'unknown_source'
  | 'invalid_url'
  | 'host_mismatch'
  | 'unsafe_host'
  | 'dns_unavailable'
  | 'unsafe_dns_result'
  | 'dns_resolution_failed'
  | 'redirect_limit'
  | 'missing_redirect_location'
  | 'http_error'
  | 'unsupported_content_type'
  | 'unsupported_content_encoding'
  | 'body_too_large'
  | 'timeout'
  | 'network_error';

export class SafeFeedFetchError extends Error {
  constructor(message: string, readonly code: SafeFeedFetchErrorCode) {
    super(message);
    this.name = 'SafeFeedFetchError';
  }
}

const ALLOWED_CONTENT_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/rdf+xml',
  'application/xml',
  'text/xml',
  'text/calendar',
  'application/ics',
  'text/html',
  'application/json',
  'application/ld+json',
  'application/feed+json',
  'text/plain',
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
export const EVENT_FEED_USER_AGENT = 'HobbeastBot/1.0';

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isIpv4(value: string) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isIpv6(value: string) {
  return value.includes(':') && /^[0-9a-f:.]+$/i.test(value);
}

function isIpLiteral(value: string) {
  const normalized = normalizeHostname(value);
  return isIpv4(normalized) || isIpv6(normalized);
}

export function isGlobalUnicastAddress(value: string) {
  const normalized = normalizeHostname(value);
  if (isIpv4(normalized)) {
    const [a, b, c] = normalized.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (!isIpv6(normalized)) return false;
  if (normalized === '::' || normalized === '::1') return false;
  if (/^::ffff:/i.test(normalized)) return false;
  const firstGroup = Number.parseInt(normalized.split(':', 1)[0] || '0', 16);
  if (!Number.isFinite(firstGroup) || firstGroup < 0x2000 || firstGroup > 0x3fff) return false;
  if (/^2001:db8(?::|$)/i.test(normalized)) return false;
  if (/^2001:(?:0(?::|$)|2(?::|$)|1[0-9a-f](?::|$))/i.test(normalized)) return false;
  if (/^2002:/i.test(normalized) || /^3ffe:/i.test(normalized)) return false;
  return true;
}

async function defaultResolveHost(hostname: string) {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { resolveDns?: (query: string, recordType: 'A' | 'AAAA') => Promise<string[]> };
  }).Deno;
  if (typeof deno?.resolveDns !== 'function') {
    throw new SafeFeedFetchError('DNS verification is unavailable in this runtime', 'dns_unavailable');
  }

  const settled = await Promise.allSettled([
    deno.resolveDns(hostname, 'A'),
    deno.resolveDns(hostname, 'AAAA'),
  ]);
  const addresses = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (addresses.length === 0) {
    throw new SafeFeedFetchError('Feed hostname did not resolve to a verifiable address', 'dns_resolution_failed');
  }
  return addresses;
}

function registryEntry(registry: FeedSourceRegistry, sourceId: string) {
  if (typeof (registry as ReadonlyMap<string, RegisteredFeedSource>).get === 'function') {
    return (registry as ReadonlyMap<string, RegisteredFeedSource>).get(sourceId);
  }
  const record = registry as Readonly<Record<string, RegisteredFeedSource>>;
  return Object.prototype.hasOwnProperty.call(record, sourceId) ? record[sourceId] : undefined;
}

function validateRequestUrl(rawUrl: string, allowedHost: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFeedFetchError('Feed URL is invalid', 'invalid_url');
  }

  const hostname = normalizeHostname(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new SafeFeedFetchError('Feed URL must use credential-free HTTPS on port 443', 'invalid_url');
  }
  if (hostname !== normalizeHostname(allowedHost)) {
    throw new SafeFeedFetchError('Feed URL host does not match the registered host', 'host_mismatch');
  }
  if (
    isIpLiteral(hostname)
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
  ) {
    throw new SafeFeedFetchError('Feed URL host is not an allowed public hostname', 'unsafe_host');
  }
  return url;
}

async function verifiedAddresses(hostname: string, resolver: (hostname: string) => Promise<string[]>) {
  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch (error) {
    if (error instanceof SafeFeedFetchError) throw error;
    throw new SafeFeedFetchError('Feed hostname resolution failed', 'dns_resolution_failed');
  }
  if (addresses.length === 0) throw new SafeFeedFetchError('Feed hostname returned no addresses', 'dns_resolution_failed');
  if (addresses.some((address) => !isGlobalUnicastAddress(address))) {
    throw new SafeFeedFetchError('Feed hostname resolved to a non-global address', 'unsafe_dns_result');
  }
  return addresses;
}

function safeConditionalHeader(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed && trimmed.length <= 512 && /^[\x20-\x7e]+$/.test(trimmed) ? trimmed : null;
}

async function readCappedBody(response: Response, maxBodyBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SafeFeedFetchError(`Feed response exceeds ${maxBodyBytes} bytes`, 'body_too_large');
  }

  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), length: 0 };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SafeFeedFetchError(`Feed response exceeds ${maxBodyBytes} bytes`, 'body_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, length: total };
}

function decodeBody(bytes: Uint8Array, contentType: string) {
  const charset = /charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1]?.replace(/^"|"$/g, '') || 'utf-8';
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

export async function safeFetchRegisteredFeed(
  sourceId: string,
  registry: FeedSourceRegistry,
  dependencies: SafeFeedFetchDependencies = {},
  options: SafeFeedFetchOptions = {},
): Promise<SafeFeedFetchResult> {
  const source = registryEntry(registry, sourceId);
  if (!source || source.sourceId !== sourceId) {
    throw new SafeFeedFetchError('Feed source is not registered', 'unknown_source');
  }

  const maxBodyBytes = Math.max(1, Math.min(options.maxBodyBytes ?? EVENT_FEED_LIMITS.maxBodyBytes, EVENT_FEED_LIMITS.maxBodyBytes));
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 3, 5));
  const timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? 12_000, 30_000));
  const testFetchImpl = dependencies.fetchImpl;
  const pinnedFetchImpl = dependencies.pinnedFetchImpl ?? pinnedHttpsFetch;
  const resolveHost = dependencies.resolveHost ?? defaultResolveHost;
  const allowedHost = normalizeHostname(source.allowedHost);
  let currentUrl = validateRequestUrl(source.endpointUrl, allowedHost);
  const requestedUserAgent = options.userAgent?.trim() ?? '';
  const userAgent = requestedUserAgent && requestedUserAgent.length <= 160 && /^[\x20-\x7e]+$/.test(requestedUserAgent)
    ? requestedUserAgent
    : EVENT_FEED_USER_AGENT;

  const headers = new Headers({
    Accept: 'application/rss+xml, application/atom+xml, application/rdf+xml, text/calendar, application/ld+json, application/json, text/html;q=0.8, application/xml;q=0.8, text/xml;q=0.8, text/plain;q=0.5',
    'User-Agent': userAgent,
  });
  const etag = safeConditionalHeader(source.etag);
  const lastModified = safeConditionalHeader(source.lastModified);
  if (etag) headers.set('If-None-Match', etag);
  if (lastModified) headers.set('If-Modified-Since', lastModified);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    // Callers can add a policy layer (for example, robots.txt) that must be
    // re-evaluated before every redirected request. URL/host validation has
    // already happened, and a defensive copy prevents callback mutation.
    await dependencies.authorizeRequest?.(new URL(currentUrl.toString()), redirectCount);
    const addresses = await verifiedAddresses(currentUrl.hostname, resolveHost);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      const requestInit: RequestInit = {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      };
      response = testFetchImpl
        ? await testFetchImpl(currentUrl.toString(), requestInit)
        : await pinnedFetchImpl(currentUrl, requestInit, addresses[0]);
    } catch (error) {
      clearTimeout(timeout);
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new SafeFeedFetchError('Feed request timed out', 'timeout');
      }
      throw new SafeFeedFetchError('Feed request failed', 'network_error');
    }
    try {
      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        if (redirectCount >= maxRedirects) throw new SafeFeedFetchError('Feed redirect limit exceeded', 'redirect_limit');
        const location = response.headers.get('location');
        if (!location) throw new SafeFeedFetchError('Feed redirect has no Location header', 'missing_redirect_location');
        let redirected: URL;
        try {
          redirected = new URL(location, currentUrl);
        } catch {
          throw new SafeFeedFetchError('Feed redirect URL is invalid', 'invalid_url');
        }
        currentUrl = validateRequestUrl(redirected.toString(), allowedHost);
        continue;
      }

      if (response.status === 304) {
        await response.body?.cancel().catch(() => undefined);
        return {
          status: 'not_modified',
          finalUrl: currentUrl.toString(),
          httpStatus: 304,
          contentType: response.headers.get('content-type'),
          etag: response.headers.get('etag') ?? etag,
          lastModified: response.headers.get('last-modified') ?? lastModified,
          body: null,
          bodyBytes: 0,
        };
      }

      if (options.acceptEmptySuccess && (response.status === 204 || response.status === 205)) {
        await response.body?.cancel().catch(() => undefined);
        return {
          status: 'ok',
          finalUrl: currentUrl.toString(),
          httpStatus: response.status,
          contentType: response.headers.get('content-type'),
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
          body: '',
          bodyBytes: 0,
        };
      }

      if (response.status < 200 || response.status >= 300) {
        if (options.returnHttpErrors && response.status >= 400 && response.status <= 599) {
          await response.body?.cancel().catch(() => undefined);
          return {
            status: 'ok',
            finalUrl: currentUrl.toString(),
            httpStatus: response.status,
            contentType: response.headers.get('content-type'),
            etag: null,
            lastModified: null,
            body: '',
            bodyBytes: 0,
          };
        }
        await response.body?.cancel().catch(() => undefined);
        throw new SafeFeedFetchError(`Feed server returned HTTP ${response.status}`, 'http_error');
      }

      const contentTypeHeader = response.headers.get('content-type') ?? '';
      const contentType = contentTypeHeader.toLowerCase().split(';', 1)[0].trim();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new SafeFeedFetchError('Feed response has an unsupported content type', 'unsupported_content_type');
      }
      const contentEncoding = (response.headers.get('content-encoding') || '').trim().toLowerCase();
      if (contentEncoding && contentEncoding !== 'identity') {
        await response.body?.cancel().catch(() => undefined);
        throw new SafeFeedFetchError('Feed response has an unsupported content encoding', 'unsupported_content_encoding');
      }

      let cappedBody: Awaited<ReturnType<typeof readCappedBody>>;
      try {
        cappedBody = await readCappedBody(response, maxBodyBytes);
      } catch (error) {
        if (error instanceof SafeFeedFetchError) throw error;
        if (controller.signal.aborted) throw new SafeFeedFetchError('Feed request timed out', 'timeout');
        throw new SafeFeedFetchError('Feed response stream failed', 'network_error');
      }
      return {
        status: 'ok',
        finalUrl: currentUrl.toString(),
        httpStatus: response.status,
        contentType: contentTypeHeader,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        body: decodeBody(cappedBody.bytes, contentTypeHeader),
        bodyBytes: cappedBody.length,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SafeFeedFetchError('Feed redirect limit exceeded', 'redirect_limit');
}
