interface DnsJsonAnswer {
  type?: number;
  TTL?: number;
  data?: string;
}

interface DnsJsonResponse {
  Status?: number;
  Answer?: DnsJsonAnswer[];
}

interface CacheEntry {
  addresses: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DNS_JSON_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

async function queryDnsJson(hostname: string, type: 'A' | 'AAAA', fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = new URL(DNS_JSON_ENDPOINT);
    url.searchParams.set('name', hostname);
    url.searchParams.set('type', type);
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/dns-json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DNS_HTTP_${response.status}`);
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 65_536) throw new Error('DNS_RESPONSE_TOO_LARGE');
    const body = JSON.parse(raw) as DnsJsonResponse;
    if (body.Status !== 0 && body.Status !== 3) throw new Error('DNS_RESPONSE_FAILED');
    const expectedType = type === 'A' ? 1 : 28;
    const answers = (body.Answer || []).filter((answer) => answer.type === expectedType && typeof answer.data === 'string');
    return {
      addresses: answers.map((answer) => String(answer.data).trim()).filter(Boolean),
      ttl: Math.min(...answers.map((answer) => Math.max(60, Math.min(Number(answer.TTL) || 300, 3600))), 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveEventFeedHostAddresses(hostname: string, fetchImpl: typeof fetch = fetch) {
  const normalized = hostname.trim().toLowerCase();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;

  const deno = (globalThis as typeof globalThis & {
    Deno?: { resolveDns?: (query: string, recordType: 'A' | 'AAAA') => Promise<string[]> };
  }).Deno;
  if (typeof deno?.resolveDns === 'function') {
    const settled = await Promise.allSettled([deno.resolveDns(normalized, 'A'), deno.resolveDns(normalized, 'AAAA')]);
    const addresses = [...new Set(settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []))];
    if (addresses.length > 0) {
      cache.set(normalized, { addresses, expiresAt: Date.now() + 300_000 });
      return addresses;
    }
  }

  const settled = await Promise.allSettled([
    queryDnsJson(normalized, 'A', fetchImpl),
    queryDnsJson(normalized, 'AAAA', fetchImpl),
  ]);
  const successful = settled.filter((result): result is PromiseFulfilledResult<{ addresses: string[]; ttl: number }> => result.status === 'fulfilled');
  const addresses = [...new Set(successful.flatMap((result) => result.value.addresses))];
  if (addresses.length === 0) throw new Error('DNS_RESOLUTION_FAILED');
  const ttl = Math.min(...successful.map((result) => result.value.ttl));
  cache.set(normalized, { addresses, expiresAt: Date.now() + ttl * 1000 });
  return addresses;
}

export function clearEventFeedDnsCache() {
  cache.clear();
}
