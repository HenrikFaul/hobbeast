import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';
import {
  corsHeaders,
  fetchJson,
  getSupabaseAdmin,
  jsonResponse,
  ProviderFetchError,
} from '../shared/providerFetch.ts';
import {
  assertExternalProviderAvailable,
  failExternalProviderRun,
  finishExternalProviderRun,
  startExternalProviderRun,
} from '../shared/externalProviderRuns.ts';
import {
  normalizeEventbriteOrganizations,
  normalizeEventbritePage,
} from '../shared/eventbrite.ts';
import { consumeEdgeRateLimit, rateLimitSubjectHash } from '../shared/rateLimit.ts';
import { correlationIdFromRequest, logEdgeEvent } from '../shared/edgeObservability.ts';

const EVENTBRITE_BASE = 'https://www.eventbriteapi.com/v3';
const MAX_BODY_BYTES = 16 * 1024;
const ACTIONS = new Set(['validate_token', 'list_organizations', 'list_events', 'search_events']);

interface EventbriteRequest {
  action: 'validate_token' | 'list_organizations' | 'list_events' | 'search_events';
  organization_id?: string;
  keyword?: string;
  page: number;
  location?: string;
}

function getEventbriteToken() {
  return String(
    Deno.env.get('EVENTBRITE_PRIVATE_TOKEN')
      || Deno.env.get('EVENTBRITE_TOKEN')
      || Deno.env.get('EVENTBRITE_API_KEY')
      || '',
  ).trim();
}

function getEventbriteConfig() {
  return {
    has_api_key: Boolean(Deno.env.get('EVENTBRITE_API_KEY')),
    has_client_secret: Boolean(Deno.env.get('EVENTBRITE_CLIENT_SECRET')),
    has_private_token: Boolean(getEventbriteToken()),
    has_public_token: Boolean(Deno.env.get('EVENTBRITE_PUBLIC_TOKEN')),
    has_webhook_id: Boolean(Deno.env.get('EVENTBRITE_WEBHOOK_ID')),
  };
}

async function parseRequest(req: Request): Promise<EventbriteRequest> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_JSON');
  }
  const allowed = new Set(['action', 'organization_id', 'keyword', 'page', 'location']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error('INVALID_REQUEST_FIELD');
  const action = typeof body.action === 'string' ? body.action : '';
  if (!ACTIONS.has(action)) throw new Error('UNKNOWN_ACTION');
  return {
    action: action as EventbriteRequest['action'],
    organization_id: typeof body.organization_id === 'string' ? body.organization_id.trim().slice(0, 200) : undefined,
    keyword: typeof body.keyword === 'string' ? body.keyword.trim().slice(0, 100) : undefined,
    location: typeof body.location === 'string' ? body.location.trim().slice(0, 100) : undefined,
    page: Math.max(1, Math.min(Number(body.page) || 1, 50)),
  };
}

async function optionalUserId(req: Request, admin: ReturnType<typeof getSupabaseAdmin>) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user?.id || null;
}

serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  const startedAt = performance.now();
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const admin = getSupabaseAdmin(req);
  let runId: string | null = null;
  let action = 'unknown';
  let providerCalls = 0;
  try {
    const body = await parseRequest(req);
    action = body.action;
    if (body.action === 'list_events' && !body.organization_id) throw new Error('ORGANIZATION_ID_REQUIRED');
    const isAdminAction = body.action !== 'search_events';
    const actor = isAdminAction ? await requireAdminUser(req, admin) : null;
    const userId = actor?.id || await optionalUserId(req, admin);

    if (body.action === 'search_events') {
      const pepper = String(Deno.env.get('RATE_LIMIT_HASH_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
      const subjectHash = await rateLimitSubjectHash({ request: req, userId, pepper });
      const rate = await consumeEdgeRateLimit({
        admin,
        endpoint: 'eventbrite.search_events',
        subjectHash,
        windowSeconds: 60,
        requestLimit: userId ? 20 : 10,
      });
      if (!rate.allowed) {
        const response = jsonResponse({ error: 'RATE_LIMITED', retry_after_seconds: rate.retryAfterSeconds }, 429);
        response.headers.set('Retry-After', String(rate.retryAfterSeconds));
        return response;
      }
    }

    const token = getEventbriteToken();
    if (!token) return jsonResponse({ error: 'PROVIDER_NOT_CONFIGURED' }, 503);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const providerGet = async <T>(path: string) => {
      providerCalls += 1;
      return fetchJson<T>(`${EVENTBRITE_BASE}${path}`, { headers }, 'eventbrite', {
        timeoutMs: 12_000,
        retries: 2,
        retryBaseMs: 500,
      });
    };

    await assertExternalProviderAvailable(admin, 'eventbrite');
    runId = await startExternalProviderRun(admin, 'eventbrite', body.action, userId);

    if (body.action === 'validate_token') {
      await providerGet('/users/me/organizations/');
      await finishExternalProviderRun(admin, runId, 'eventbrite', { itemCount: 0, pageCount: 1, costUnits: providerCalls });
      return jsonResponse({ ok: true, status: 200, config: getEventbriteConfig() });
    }

    if (body.action === 'list_organizations') {
      const normalized = normalizeEventbriteOrganizations(await providerGet<unknown>('/users/me/organizations/'));
      await finishExternalProviderRun(admin, runId, 'eventbrite', {
        itemCount: normalized.organizations.length, pageCount: 1, costUnits: providerCalls,
      });
      return jsonResponse(normalized);
    }

    if (body.action === 'list_events') {
      const params = new URLSearchParams({ status: 'live', order_by: 'start_asc', expand: 'venue,category', page: String(body.page) });
      const normalized = normalizeEventbritePage(await providerGet<unknown>(
        `/organizations/${encodeURIComponent(body.organization_id)}/events/?${params}`,
      ));
      await finishExternalProviderRun(admin, runId, 'eventbrite', {
        itemCount: normalized.events.length,
        pageCount: 1,
        costUnits: providerCalls,
        checkpoint: { page: normalized.pagination.page_number },
      });
      return jsonResponse(normalized);
    }

    const searchParams = new URLSearchParams({
      expand: 'venue,category',
      sort_by: 'date',
      'location.address': body.location || 'Budapest',
      'location.within': '50km',
      page: String(body.page),
    });
    if (body.keyword) searchParams.set('q', body.keyword);

    let normalized = normalizeEventbritePage(await providerGet<unknown>(`/events/search/?${searchParams}`));
    if (normalized.events.length === 0) {
      const organizations = normalizeEventbriteOrganizations(await providerGet<unknown>('/users/me/organizations/'));
      for (const organization of organizations.organizations.slice(0, 10)) {
        const params = new URLSearchParams({ status: 'live', order_by: 'start_asc', expand: 'venue,category', page: String(body.page) });
        normalized = normalizeEventbritePage(await providerGet<unknown>(
          `/organizations/${encodeURIComponent(organization.id)}/events/?${params}`,
        ));
        if (normalized.events.length > 0) break;
      }
    }
    if (normalized.events.length === 0) {
      const params = new URLSearchParams({ expand: 'venue,category', page: String(body.page) });
      if (body.keyword) params.set('q', body.keyword);
      normalized = normalizeEventbritePage(await providerGet<unknown>(`/destination/events/?${params}`));
    }

    await finishExternalProviderRun(admin, runId, 'eventbrite', {
      itemCount: normalized.events.length,
      pageCount: 1,
      costUnits: providerCalls,
      checkpoint: { page: normalized.pagination.page_number },
    });
    logEdgeEvent('info', 'eventbrite_request', correlationId, {
      action,
      outcome: 'success',
      item_count: normalized.events.length,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return jsonResponse(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('PROVIDER_DISABLED') && !message.includes('PROVIDER_CIRCUIT_OPEN')) {
      await failExternalProviderRun(admin, runId, 'eventbrite', error, {
        action,
        safeContext: { correlation_id: correlationId },
      }).catch(() => undefined);
    }
    const status = message === 'REQUEST_TOO_LARGE' ? 413
      : ['INVALID_JSON', 'INVALID_REQUEST_FIELD', 'UNKNOWN_ACTION', 'ORGANIZATION_ID_REQUIRED'].includes(message) ? 400
        : message.includes('authorization') || message.includes('Unauthorized') ? 401
          : message.includes('Admin access') ? 403
            : message.includes('PROVIDER_') || error instanceof ProviderFetchError ? 503
              : 500;
    const publicCode = status === 413 ? 'REQUEST_TOO_LARGE'
      : status === 400 ? 'INVALID_REQUEST'
        : status === 401 || status === 403 ? 'AUTHORIZATION_FAILED'
          : 'PROVIDER_UNAVAILABLE';
    logEdgeEvent('error', 'eventbrite_request', correlationId, {
      action,
      outcome: 'failed',
      error_code: publicCode,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return jsonResponse({ error: publicCode }, status);
  }
});
