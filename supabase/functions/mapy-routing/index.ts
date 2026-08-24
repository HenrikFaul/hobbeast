import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  ProviderFetchError,
  corsHeaders,
  fetchJson,
  getSupabaseAdmin,
} from '../shared/providerFetch.ts';
import { correlationIdFromRequest, logEdgeEvent } from '../shared/edgeObservability.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';
import { consumeEdgeRateLimit, rateLimitSubjectHash } from '../shared/rateLimit.ts';
import {
  assertExternalProviderAvailable,
  failExternalProviderRun,
  finishExternalProviderRun,
  startExternalProviderRun,
} from '../shared/externalProviderRuns.ts';
import { MapyRoutingRequestError, parseMapyRoutingRequest } from './contract.ts';

const MAPY_BASE_URL = 'https://api.mapy.cz/v1';
const edgeCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-correlation-id`,
};

function respond(body: unknown, status: number, correlationId: string, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...edgeCorsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Correlation-ID': correlationId,
      ...extraHeaders,
    },
  });
}

serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: edgeCorsHeaders });
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', correlationId }, 405, correlationId);
  }

  const admin = getSupabaseAdmin(req);
  let runId: string | null = null;
  let action: 'route' | 'elevation' | 'unknown' = 'unknown';
  try {
    const body = await parseMapyRoutingRequest(req);
    action = body.action;
    const { user } = await requireAuthenticatedUserClient(req);
    const pepper = String(Deno.env.get('RATE_LIMIT_HASH_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const subjectHash = await rateLimitSubjectHash({ request: req, userId: user.id, pepper });
    const rate = await consumeEdgeRateLimit({
      admin,
      endpoint: `mapy-routing.${action}`,
      subjectHash,
      windowSeconds: 60,
      requestLimit: action === 'route' ? 30 : 15,
    });
    if (!rate.allowed) {
      logEdgeEvent('warn', 'mapy_routing_rate_limited', correlationId, { action, retry_after_seconds: rate.retryAfterSeconds });
      return respond(
        { error: 'Too many requests.', code: 'RATE_LIMITED', retry_after_seconds: rate.retryAfterSeconds, correlationId },
        429,
        correlationId,
        { 'Retry-After': String(rate.retryAfterSeconds) },
      );
    }

    const apiKey = String(Deno.env.get('MAPY_CZ_API_KEY') || '').trim();
    if (!apiKey) throw new Error('PROVIDER_NOT_CONFIGURED');
    await assertExternalProviderAvailable(admin, 'mapy');
    runId = await startExternalProviderRun(admin, 'mapy', action, user.id);

    let payload: unknown;
    let itemCount = 1;
    if (body.action === 'route') {
      const params = new URLSearchParams({
        apikey: apiKey,
        start: `${body.params.start.lon},${body.params.start.lat}`,
        end: `${body.params.end.lon},${body.params.end.lat}`,
        routeType: body.params.routeType,
        format: 'geojson',
        lang: 'cs',
      });
      if (body.params.waypoints.length > 0) {
        params.set('waypoints', body.params.waypoints.map((point) => `${point.lon},${point.lat}`).join('|'));
      }
      payload = await fetchJson<unknown>(
        `${MAPY_BASE_URL}/routing/route?${params}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        'mapy-routing',
        { timeoutMs: 12_000, retries: 1, retryBaseMs: 400 },
      );
    } else {
      itemCount = body.params.coordinates.length;
      // Mapy elevation is a GET endpoint taking "positions=lon,lat;lon,lat" and returns
      // items nested as { elevation, position: { lon, lat } }; the client contract is the
      // flat { lon, lat, elevation } shape, so normalize here.
      const positions = body.params.coordinates.map(([lon, lat]) => `${lon},${lat}`).join(';');
      const elevationParams = new URLSearchParams({ positions, apikey: apiKey });
      const raw = await fetchJson<{ items?: Array<{ elevation?: number; position?: { lon?: number; lat?: number } }> }>(
        `${MAPY_BASE_URL}/elevation?${elevationParams}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        'mapy-elevation',
        { timeoutMs: 12_000, retries: 1, retryBaseMs: 400 },
      );
      payload = {
        items: (raw?.items || []).map((item) => ({
          lon: item?.position?.lon,
          lat: item?.position?.lat,
          elevation: item?.elevation,
        })),
      };
    }

    await finishExternalProviderRun(admin, runId, 'mapy', {
      itemCount,
      pageCount: 1,
      costUnits: 1,
      checkpoint: { action, completed_at: new Date().toISOString() },
    });
    logEdgeEvent('info', 'mapy_routing_succeeded', correlationId, { action, item_count: itemCount });
    return respond(payload, 200, correlationId);
  } catch (error) {
    if (runId) {
      await failExternalProviderRun(admin, runId, 'mapy', error, {
        action,
        safeContext: { correlation_id: correlationId },
      }).catch(() => undefined);
    }
    const code = error instanceof MapyRoutingRequestError ? error.code
      : error instanceof ProviderFetchError && error.kind === 'quota' ? 'PROVIDER_QUOTA'
        : error instanceof ProviderFetchError ? 'PROVIDER_UNAVAILABLE'
          : error instanceof Error && ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(error.message) ? error.message
            : error instanceof Error && ['PROVIDER_NOT_CONFIGURED', 'PROVIDER_DISABLED', 'PROVIDER_CIRCUIT_OPEN'].includes(error.message) ? error.message
              : 'MAPY_ROUTING_FAILED';
    const status = code === 'REQUEST_TOO_LARGE' ? 413
      : code === 'INVALID_JSON' || code === 'INVALID_BODY' || code === 'INVALID_COORDINATE' ? 400
        : code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID' ? 401
          : code === 'PROVIDER_QUOTA' ? 429
            : code.startsWith('PROVIDER_') ? 503
              : 500;
    logEdgeEvent(status >= 500 ? 'error' : 'warn', 'mapy_routing_failed', correlationId, { action, code, status });
    const message = status === 400 ? 'Invalid route request.'
      : status === 401 ? 'Authentication required.'
        : status === 413 ? 'Request too large.'
          : status === 429 ? 'Provider quota is temporarily unavailable.'
            : 'Routing provider is temporarily unavailable.';
    return respond({ error: message, code, correlationId }, status, correlationId);
  }
});
