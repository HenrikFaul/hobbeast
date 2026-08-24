import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearEventFeedDnsCache,
  resolveEventFeedHostAddresses,
} from '../../../supabase/functions/event-feed-ingest/dnsResolver';

afterEach(() => {
  clearEventFeedDnsCache();
  vi.unstubAllGlobals();
});

describe('event feed DNS resolver', () => {
  it('uses a bounded fixed-host DoH fallback when runtime DNS is unavailable', async () => {
    vi.stubGlobal('Deno', {});
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const type = new URL(String(url)).searchParams.get('type');
      return new Response(JSON.stringify({
        Status: 0,
        Answer: type === 'A'
          ? [{ type: 1, TTL: 120, data: '93.184.216.34' }]
          : [{ type: 28, TTL: 120, data: '2606:2800:220:1:248:1893:25c8:1946' }],
      }), { status: 200, headers: { 'content-type': 'application/dns-json' } });
    }) as typeof fetch;

    await expect(resolveEventFeedHostAddresses('events.example', fetchImpl)).resolves.toEqual([
      '93.184.216.34',
      '2606:2800:220:1:248:1893:25c8:1946',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/^https:\/\/cloudflare-dns\.com\/dns-query\?/);
  });

  it('fails closed when neither A nor AAAA is verifiable', async () => {
    vi.stubGlobal('Deno', {});
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ Status: 3 }), { status: 200 })) as typeof fetch;
    await expect(resolveEventFeedHostAddresses('missing.example', fetchImpl)).rejects.toThrow('DNS_RESOLUTION_FAILED');
  });
});
