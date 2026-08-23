import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MapyRoutingRequestError,
  parseMapyRoutingRequest,
} from '../../../supabase/functions/mapy-routing/contract';

function request(body: unknown) {
  return new Request('https://example.test/mapy-routing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Mapy routing Edge request contract', () => {
  it('normalizes a bounded route request', async () => {
    const parsed = await parseMapyRoutingRequest(request({
      action: 'route',
      params: {
        start: { lat: 47.4979, lon: 19.0402 },
        end: { lat: 47.5, lon: 19.05 },
        waypoints: [{ lat: 47.499, lon: 19.045 }],
        routeType: 'foot_hiking',
      },
    }));
    expect(parsed.action).toBe('route');
    if (parsed.action === 'route') expect(parsed.params.waypoints).toHaveLength(1);
  });

  it.each([
    { action: 'route', params: { start: { lat: 0, lon: 0 }, end: { lat: 47, lon: 19 } } },
    { action: 'route', params: { start: { lat: 47, lon: 19 }, end: { lat: 47.1, lon: 19.1 }, routeType: 'spaceship' } },
    { action: 'route', params: { start: { lat: 47, lon: 19 }, end: { lat: 47.1, lon: 19.1 }, extra: true } },
    { action: 'elevation', params: { coordinates: [[19, 47]] } },
  ])('rejects invalid or unbounded provider input', async (body) => {
    await expect(parseMapyRoutingRequest(request(body))).rejects.toBeInstanceOf(MapyRoutingRequestError);
  });

  it('caps route waypoints and elevation sample size', async () => {
    await expect(parseMapyRoutingRequest(request({
      action: 'route',
      params: {
        start: { lat: 47, lon: 19 }, end: { lat: 48, lon: 20 },
        waypoints: Array.from({ length: 9 }, (_, index) => ({ lat: 47 + index / 100, lon: 19 })),
      },
    }))).rejects.toMatchObject({ code: 'INVALID_BODY' });
    await expect(parseMapyRoutingRequest(request({
      action: 'elevation',
      params: { coordinates: Array.from({ length: 201 }, () => [19, 47]) },
    }))).rejects.toMatchObject({ code: 'INVALID_BODY' });
  });
});

describe('Mapy routing Edge security boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/mapy-routing/index.ts'), 'utf8');

  it('requires verified auth, rate limiting, circuit state and bounded provider fetches', () => {
    expect(source).toContain('requireAuthenticatedUserClient(req)');
    expect(source).toContain('consumeEdgeRateLimit');
    expect(source).toContain('assertExternalProviderAvailable');
    expect(source).toContain('fetchJson<unknown>');
    expect(source).toContain('finishExternalProviderRun');
  });

  it('never returns raw upstream bodies or exception messages', () => {
    expect(source).not.toContain('await res.text()');
    expect(source).not.toMatch(/error:\s*error\.(?:message|stack)/);
    expect(source).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(?:error|message)/);
  });
});
