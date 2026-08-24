import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.env.set('SUPABASE_URL', Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'local-contract-test-key');

const [
  { normalizeSeatGeekEvent },
  { normalizeTicketmasterEvent },
  { normalizeEventbritePage },
  { fetchJson, ProviderFetchError },
  { assertProjectRole, resolveVerifiedInternalProjectUrl },
] = await Promise.all([
  import('./seatgeek.ts'),
  import('./ticketmaster.ts'),
  import('./eventbrite.ts'),
  import('./providerFetch.ts'),
  import('./projectContract.ts'),
]);

Deno.test('Ticketmaster fixture normalizes identity, venue, category and price', () => {
  const event = normalizeTicketmasterEvent({
    id: 'tm-1',
    name: 'Budapest Jazz Night',
    url: 'https://example.test/tm-1',
    dates: { start: { localDate: '2026-09-01', localTime: '19:30:00' } },
    _embedded: { venues: [{ name: 'A38', city: { name: 'Budapest' }, location: { latitude: '47.477', longitude: '19.063' } }] },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Jazz' } }],
    priceRanges: [{ min: 10, max: 25, currency: 'EUR' }],
  });

  assertEquals(event.external_id, 'tm-1');
  assertEquals(event.event_date, '2026-09-01');
  assertEquals(event.location_city, 'Budapest');
  assertEquals(event.category, 'Music');
  assertEquals(event.price_min, 10);
});

Deno.test('SeatGeek fixture normalizes identity, performer and coordinates', () => {
  const event = normalizeSeatGeekEvent({
    id: 42,
    title: 'Community Run',
    datetime_local: '2026-09-02T08:00:00',
    venue: { name: 'City Park', city: 'Budapest', location: { lat: 47.514, lon: 19.083 } },
    taxonomies: [{ name: 'Sports' }],
    performers: [{ name: 'Local Runners' }],
    stats: { lowest_price: 0, highest_price: 0 },
  });

  assertEquals(event.external_id, '42');
  assertEquals(event.tags, ['Sports', 'Local Runners']);
  assertEquals(event.location_lat, 47.514);
  assertEquals(event.is_free, true);
});

Deno.test('provider contracts fail closed when identity fields are absent', () => {
  assertThrows(() => normalizeTicketmasterEvent({ name: 'No id' }), Error, 'missing an id');
  assertThrows(() => normalizeSeatGeekEvent({ id: 'sg-1' }), Error, 'missing a title');
});

Deno.test('target project contract rejects a hosted role mismatch without echoing the URL', () => {
  const error = assertThrows(
    () => assertProjectRole('https://wrongprojectref.supabase.co'),
    Error,
    'SUPABASE_PROJECT_ROLE_MISMATCH',
  );
  assertEquals(error.message.includes('wrongprojectref'), false);
  assertThrows(
    () => resolveVerifiedInternalProjectUrl({
      envUrl: 'https://bqdvqmpwccsxumzijspj.supabase.co',
      requestUrl: 'https://differentref.supabase.co/functions/v1/test',
    }),
    Error,
    'SUPABASE_PROJECT_ORIGIN_MISMATCH',
  );
});

Deno.test('provider fetch fixture classifies an outage with network fully mocked', async () => {
  const error = await assertRejects(
    () => fetchJson('https://provider.invalid/events', {}, 'fixture', {
      retries: 0,
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 503 })),
    }),
    ProviderFetchError,
  );
  assertEquals(error.kind, 'outage');
  assertEquals(error.status, 503);
});

Deno.test('provider fetch fixture aborts and classifies a timeout', async () => {
  const error = await assertRejects(
    () => fetchJson('https://provider.invalid/events', {}, 'fixture', {
      retries: 0,
      timeoutMs: 50,
      fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    }),
    ProviderFetchError,
  );
  assertEquals(error.kind, 'timeout');
  assertEquals(error.status, null);
});

Deno.test('provider fetch fixture rejects malformed JSON and accepts an empty success', async () => {
  const malformed = await assertRejects(
    () => fetchJson('https://provider.invalid/events', {}, 'fixture', {
      retries: 0,
      fetchImpl: () => Promise.resolve(new Response('{broken', { status: 200 })),
    }),
    ProviderFetchError,
  );
  assertEquals(malformed.kind, 'malformed_payload');

  const empty = await fetchJson<Record<string, unknown>>('https://provider.invalid/events', {}, 'fixture', {
    retries: 0,
    fetchImpl: () => Promise.resolve(Response.json({ events: [], pagination: { page_number: 1, page_count: 1 } })),
  });
  assertEquals(normalizeEventbritePage(empty), {
    events: [],
    pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 1, has_more_items: false },
  });
});
