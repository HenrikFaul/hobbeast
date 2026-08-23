// supabase/functions/sync-seatgeek-events/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// supabase/functions/shared/providerFetch.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// supabase/functions/shared/env.ts
var MissingEnvError = class extends Error {
  constructor(missing) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.missing = missing;
    this.name = "MissingEnvError";
  }
};
function readEnv(name) {
  const denoEnv = globalThis.Deno?.env;
  if (denoEnv?.get) return denoEnv.get(name);
  const nodeEnv = globalThis.process?.env;
  return nodeEnv?.[name];
}
function requireEnv(names) {
  const out = {};
  const missing = [];
  for (const name of names) {
    const value = readEnv(name);
    if (!value || /\{\{.+\}\}/.test(value)) {
      missing.push(name);
      continue;
    }
    out[name] = value;
  }
  if (missing.length) {
    console.error("[edge-env] missing required secrets", { missing });
    throw new MissingEnvError(missing);
  }
  return out;
}

// supabase/functions/shared/projectContract.ts
var TARGET_SUPABASE_PROJECT_REF = "dsymdijzydaehntlmfzl";
var ProjectContractError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ProjectContractError";
  }
};
function normalizeProjectUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
function extractSupabaseProjectRef(value) {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) return null;
  try {
    const hostname = new URL(normalized).hostname;
    return hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
function isLoopbackAddress(hostname) {
  if (hostname === "localhost" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname === "kong" || hostname === "host.docker.internal" || /^supabase[-_]kong(?:[-_].+)?$/i.test(hostname);
}
function isTrustedLocalSupabaseUrl(value) {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" && isLoopbackAddress(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function assertProjectRole(value, expectedRef = TARGET_SUPABASE_PROJECT_REF, options = {}) {
  const normalized = normalizeProjectUrl(value);
  if (!normalized) throw new ProjectContractError("SUPABASE_PROJECT_URL_MISSING");
  if (options.allowLocal && isTrustedLocalSupabaseUrl(normalized)) return normalized;
  const ref = extractSupabaseProjectRef(normalized);
  if (!ref) throw new ProjectContractError("SUPABASE_PROJECT_URL_INVALID");
  if (ref !== expectedRef.toLowerCase()) throw new ProjectContractError("SUPABASE_PROJECT_ROLE_MISMATCH");
  return normalized;
}
function resolveVerifiedInternalProjectUrl(input) {
  const expectedRef = (input.expectedRef || TARGET_SUPABASE_PROJECT_REF).toLowerCase();
  const envUrl = normalizeProjectUrl(input.envUrl);
  const requestOrigin = (() => {
    if (!input.requestUrl) return "";
    try {
      return new URL(input.requestUrl).origin;
    } catch {
      return "";
    }
  })();
  if (envUrl) {
    const verifiedEnv = assertProjectRole(envUrl, expectedRef, { allowLocal: true });
    const requestRef = extractSupabaseProjectRef(requestOrigin);
    if (requestRef && requestRef !== expectedRef) {
      throw new ProjectContractError("SUPABASE_PROJECT_ORIGIN_MISMATCH");
    }
    if (isTrustedLocalSupabaseUrl(verifiedEnv) && requestOrigin && !isTrustedLocalSupabaseUrl(requestOrigin)) {
      throw new ProjectContractError("SUPABASE_PROJECT_ORIGIN_MISMATCH");
    }
    return verifiedEnv;
  }
  return assertProjectRole(requestOrigin, expectedRef, { allowLocal: true });
}

// supabase/functions/shared/providerFetch.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function resolveInternalSupabaseUrl(req) {
  return resolveVerifiedInternalProjectUrl({
    envUrl: Deno.env.get("SUPABASE_URL"),
    requestUrl: req?.url
  });
}
function resolveServiceRoleKey() {
  const { SUPABASE_SERVICE_ROLE_KEY } = requireEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  return SUPABASE_SERVICE_ROLE_KEY;
}
function getSupabaseAdmin(req) {
  const supabaseUrl = resolveInternalSupabaseUrl(req);
  const serviceRoleKey = resolveServiceRoleKey();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var ProviderFetchError = class extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.name = "ProviderFetchError";
  }
};
function retryDelay(attempt, retryAfter, baseMs) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1e3, 3e4);
  return Math.min(baseMs * 2 ** attempt, 8e3);
}
async function fetchJson(url, init, errorLabel, options = {}) {
  const retries = Math.max(0, Math.min(options.retries ?? 2, 3));
  const timeoutMs = Math.max(50, Math.min(options.timeoutMs ?? 12e3, 3e4));
  const retryBaseMs = Math.max(100, options.retryBaseMs ?? 500);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries) {
          await res.body?.cancel().catch(() => void 0);
          await sleep(retryDelay(attempt, res.headers.get("retry-after"), retryBaseMs));
          continue;
        }
        const kind = res.status === 429 ? "quota" : res.status >= 500 ? "outage" : "unknown";
        throw new ProviderFetchError(`${errorLabel}: provider returned ${res.status}`, res.status, kind);
      }
      try {
        return await res.json();
      } catch {
        throw new ProviderFetchError(`${errorLabel}: malformed JSON payload`, res.status, "malformed_payload");
      }
    } catch (error) {
      if (error instanceof ProviderFetchError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt < retries) continue;
        throw new ProviderFetchError(`${errorLabel}: timed out`, null, "timeout");
      }
      if (attempt >= retries) throw new ProviderFetchError(`${errorLabel}: network failure`, null, "unknown");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ProviderFetchError(`${errorLabel}: retry budget exhausted`, null, "unknown");
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// supabase/functions/shared/adminAuth.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2.49.8";
function getBearerToken(req) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}
async function requireAdminUser(req, admin = getSupabaseAdmin(req)) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Missing authorization token.");
  }
  const supabaseUrl = resolveInternalSupabaseUrl(req);
  const publishableKey = String(
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || ""
  ).trim();
  if (!publishableKey) {
    throw new Error("Missing publishable key in Edge Function environment.");
  }
  const userClient = createClient2(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();
  if (userError || !user) {
    throw new Error(`Unauthorized request: ${userError?.message || "unknown user"}`);
  }
  const { data: roleRow, error: roleError } = await admin.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (roleError) {
    throw new Error(`Admin role check failed: ${roleError.message}`);
  }
  if (!roleRow) {
    throw new Error("Admin access required.");
  }
  return user;
}

// supabase/functions/shared/externalProviderRuns.ts
async function startExternalProviderRun(admin, provider, action, startedBy) {
  const { error: freshnessError } = await admin.rpc("refresh_external_supply_freshness");
  if (freshnessError) throw new Error(`PROVIDER_FRESHNESS_REFRESH_FAILED:${freshnessError.code || "unknown"}`);
  const { data, error } = await admin.from("external_provider_sync_runs").insert({
    provider,
    action,
    status: "running",
    started_by: startedBy
  }).select("id").single();
  if (error) throw new Error(`PROVIDER_RUN_START_FAILED:${error.code || "unknown"}`);
  return data.id;
}
async function assertExternalProviderAvailable(admin, provider) {
  const { data, error } = await admin.from("external_provider_state").select("enabled,circuit_state,circuit_open_until").eq("provider", provider).maybeSingle();
  if (error) throw new Error(`PROVIDER_STATE_READ_FAILED:${error.code || "unknown"}`);
  if (!data) return;
  if (data.enabled === false) throw new Error("PROVIDER_DISABLED");
  const openUntil = data.circuit_open_until ? Date.parse(data.circuit_open_until) : 0;
  if (data.circuit_state === "open" && openUntil > Date.now()) throw new Error("PROVIDER_CIRCUIT_OPEN");
  if (data.circuit_state === "open") {
    const { error: updateError } = await admin.from("external_provider_state").update({
      circuit_state: "half_open",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("provider", provider).eq("circuit_state", "open");
    if (updateError) throw new Error(`PROVIDER_STATE_UPDATE_FAILED:${updateError.code || "unknown"}`);
  }
}
async function finishExternalProviderRun(admin, runId, provider, counts) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: runError } = await admin.from("external_provider_sync_runs").update({
    status: "succeeded",
    item_count: counts.itemCount,
    page_count: counts.pageCount,
    checkpoint: counts.checkpoint ?? {},
    finished_at: now
  }).eq("id", runId);
  if (runError) throw new Error(`PROVIDER_RUN_FINISH_FAILED:${runError.code || "unknown"}`);
  const { error: stateError } = await admin.from("external_provider_state").upsert({
    provider,
    circuit_state: "closed",
    consecutive_failures: 0,
    circuit_open_until: null,
    last_success_at: now,
    last_error_kind: null,
    last_error_code: null,
    last_checkpoint: counts.checkpoint ?? {},
    updated_at: now
  }, { onConflict: "provider" });
  if (stateError) throw new Error(`PROVIDER_STATE_UPDATE_FAILED:${stateError.code || "unknown"}`);
  if ((counts.costUnits ?? 0) > 0) {
    const { error: costError } = await admin.rpc("record_external_provider_cost", {
      p_run_id: runId,
      p_provider: provider,
      p_cost_units: counts.costUnits
    });
    if (costError) throw new Error(`PROVIDER_COST_RECORD_FAILED:${costError.code || "unknown"}`);
  }
}
async function failExternalProviderRun(admin, runId, provider, error, options = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const providerError = error;
  const kind = providerError.kind || "unknown";
  const code = typeof providerError.status === "number" ? String(providerError.status) : "provider_failure";
  if (runId) {
    await admin.from("external_provider_sync_runs").update({
      status: "failed",
      error_kind: kind,
      error_code: code,
      failure_sample_redacted: `${provider} ${kind}`,
      finished_at: now
    }).eq("id", runId);
  }
  const { data: current } = await admin.from("external_provider_state").select("consecutive_failures").eq("provider", provider).maybeSingle();
  const failures = Number(current?.consecutive_failures || 0) + 1;
  await admin.from("external_provider_state").upsert({
    provider,
    circuit_state: failures >= 3 ? "open" : "closed",
    consecutive_failures: failures,
    circuit_open_until: failures >= 3 ? new Date(Date.now() + 6e4).toISOString() : null,
    last_error_at: now,
    last_error_kind: kind,
    last_error_code: code,
    updated_at: now
  }, { onConflict: "provider" });
  if (failures >= 3) {
    const { error: deadLetterError } = await admin.rpc("record_external_provider_dead_letter", {
      p_run_id: runId,
      p_provider: provider,
      p_action: options.action || "sync",
      p_error_kind: kind,
      p_error_code: code,
      p_payload_digest: options.payloadDigest || null,
      p_safe_context: options.safeContext || {}
    });
    if (!deadLetterError && runId) {
      await admin.from("external_provider_sync_runs").update({ status: "dead_letter" }).eq("id", runId);
    }
  }
}

// supabase/functions/shared/seatgeek.ts
var BASE_URL = "https://api.seatgeek.com/2/events";
function authParams() {
  if (String(Deno.env.get("EXTERNAL_PROVIDER_SEATGEEK_ENABLED") || "true").toLowerCase() === "false") {
    throw new Error("SeatGeek provider is disabled by kill switch.");
  }
  const clientId = Deno.env.get("SEATGEEK_CLIENT_ID");
  const clientSecret = Deno.env.get("SEATGEEK_CLIENT_SECRET");
  if (!clientId) throw new Error("Missing SEATGEEK_CLIENT_ID in Edge Function environment.");
  return { clientId, clientSecret };
}
function mapDateTime(datetimeLocal) {
  if (!datetimeLocal) return { event_date: null, event_time: null };
  const [datePart, timePart] = datetimeLocal.split("T");
  return { event_date: datePart || null, event_time: timePart ? timePart.slice(0, 8) : null };
}
function normalizeSeatGeekEvent(event) {
  if (typeof event.id !== "string" && typeof event.id !== "number" || !String(event.id).trim()) {
    throw new Error("SeatGeek event payload is missing an id.");
  }
  if (typeof event.title !== "string" || !event.title.trim()) {
    throw new Error("SeatGeek event payload is missing a title.");
  }
  const venue = event?.venue ?? null;
  const taxonomy = Array.isArray(event?.taxonomies) && event.taxonomies.length ? event.taxonomies[0] : null;
  const { event_date, event_time } = mapDateTime(event?.datetime_local ?? null);
  const lowestPrice = typeof event?.stats?.lowest_price === "number" ? event.stats.lowest_price : null;
  const highestPrice = typeof event?.stats?.highest_price === "number" ? event.stats.highest_price : null;
  return {
    external_source: "seatgeek",
    external_id: String(event.id),
    external_url: event.url ?? null,
    title: event.title.trim(),
    category: taxonomy?.name ?? null,
    subcategory: event.short_title ?? null,
    tags: [
      taxonomy?.name,
      ...Array.isArray(event.performers) ? event.performers.map((performer) => performer.name).slice(0, 5) : []
    ].filter((value) => Boolean(value)),
    description: event.short_title ?? null,
    event_date,
    event_time,
    location_type: venue ? "address" : "free",
    location_city: venue?.city ?? null,
    location_address: venue?.address ?? venue?.name ?? null,
    location_free_text: null,
    location_lat: typeof venue?.location?.lat === "number" ? venue.location.lat : null,
    location_lon: typeof venue?.location?.lon === "number" ? venue.location.lon : null,
    price_min: lowestPrice,
    price_max: highestPrice,
    currency: null,
    is_free: lowestPrice === 0 && highestPrice === 0 ? true : null,
    max_attendees: null,
    image_url: Array.isArray(event?.performers) && event.performers.length ? event.performers[0]?.image ?? null : null,
    organizer_name: venue?.name ?? null,
    source_payload: event,
    source_last_synced_at: isoNow()
  };
}
async function fetchSeatGeekEvents(params) {
  const url = new URL(BASE_URL);
  const { clientId, clientSecret } = authParams();
  url.searchParams.set("client_id", clientId);
  if (clientSecret) url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("per_page", String(Math.max(1, Math.min(params.perPage ?? 50, 100))));
  url.searchParams.set("page", String(Math.max(1, Math.min(params.page ?? 1, 50))));
  if (params.q) url.searchParams.set("q", params.q);
  if (params.venueCity) url.searchParams.set("venue.city", params.venueCity);
  if (params.datetimeUtcGte) url.searchParams.set("datetime_utc.gte", params.datetimeUtcGte);
  if (params.taxonomyName) url.searchParams.append("taxonomies.name", params.taxonomyName);
  if (typeof params.lat === "number" && typeof params.lon === "number") {
    url.searchParams.set("lat", String(params.lat));
    url.searchParams.set("lon", String(params.lon));
    if (params.range) url.searchParams.set("range", params.range);
  }
  const data = await fetchJson(url.toString(), { method: "GET" }, "SeatGeek fetch failed", { timeoutMs: 12e3, retries: 2 });
  const events = data.events ?? [];
  return {
    events: events.map(normalizeSeatGeekEvent),
    pagination: {
      page: data.meta?.page ?? params.page ?? 1,
      pageSize: data.meta?.per_page ?? params.perPage ?? 50,
      total: data.meta?.total ?? null,
      hasMore: (data.meta?.page ?? 1) * (data.meta?.per_page ?? params.perPage ?? 50) < (data.meta?.total ?? 0)
    }
  };
}

// supabase/functions/shared/externalEventPipeline.ts
var EXTERNAL_EVENT_NORMALIZATION_VERSION = "external-event-v1";
function normalize(value) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
function externalEventFingerprint(event) {
  return `${normalize(event.title)}|${event.event_date ?? ""}|${normalize(event.location_city)}`;
}
function externalEventProvenance(event) {
  const verifiedAt = event.last_verified_at || event.source_last_synced_at || (/* @__PURE__ */ new Date()).toISOString();
  return {
    last_verified_at: verifiedAt,
    freshness_state: "fresh",
    normalization_version: event.normalization_version || EXTERNAL_EVENT_NORMALIZATION_VERSION,
    dedupe_confidence: event.dedupe_confidence ?? 0,
    canonical_fingerprint: event.canonical_fingerprint || externalEventFingerprint(event),
    import_state: event.import_state || "active"
  };
}

// supabase/functions/shared/upsertExternalEvents.ts
async function upsertExternalEvents(supabaseAdmin, events) {
  if (!events.length) return { upserted: 0 };
  const rows = events.map((e) => ({
    external_source: e.external_source,
    external_id: e.external_id,
    external_url: e.external_url,
    title: e.title,
    category: e.category,
    subcategory: e.subcategory,
    tags: e.tags,
    description: e.description,
    event_date: e.event_date,
    event_time: e.event_time,
    location_type: e.location_type,
    location_city: e.location_city,
    location_address: e.location_address,
    location_free_text: e.location_free_text,
    location_lat: e.location_lat,
    location_lon: e.location_lon,
    price_min: e.price_min,
    price_max: e.price_max,
    currency: e.currency,
    is_free: e.is_free,
    max_attendees: e.max_attendees,
    image_url: e.image_url,
    organizer_name: e.organizer_name,
    source_payload: e.source_payload,
    source_last_synced_at: e.source_last_synced_at,
    ...externalEventProvenance(e),
    is_active: true
  }));
  const { error } = await supabaseAdmin.from("external_events").upsert(rows, { onConflict: "external_source,external_id" });
  if (error) throw error;
  const { error: dedupeError } = await supabaseAdmin.rpc("queue_external_event_dedupe_reviews");
  if (dedupeError) throw new Error(`PROVIDER_DEDUPE_QUEUE_FAILED:${dedupeError.code || "unknown"}`);
  return { upserted: rows.length };
}

// supabase/functions/shared/externalProviderRequest.ts
var ExternalProviderRequestError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ExternalProviderRequestError";
  }
};
var MAX_BODY_BYTES = 16 * 1024;
var TOP_LEVEL_FIELDS = /* @__PURE__ */ new Set(["action", "params"]);
var PARAM_FIELDS = {
  ticketmaster: /* @__PURE__ */ new Set(["countryCode", "city", "localStartDateTime", "classificationName", "keyword", "size", "page", "source", "maxPages"]),
  seatgeek: /* @__PURE__ */ new Set(["q", "venueCity", "datetimeUtcGte", "taxonomyName", "perPage", "page", "lat", "lon", "range", "maxPages"])
};
function objectRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExternalProviderRequestError("REQUEST_INVALID_SHAPE");
  }
  return value;
}
function optionalString(value, maximumLength, pattern) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new ExternalProviderRequestError("REQUEST_INVALID_VALUE");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || pattern && !pattern.test(normalized)) {
    throw new ExternalProviderRequestError("REQUEST_INVALID_VALUE");
  }
  return normalized;
}
function optionalNumber(value, minimum, maximum, integer = true) {
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value) || integer && !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ExternalProviderRequestError("REQUEST_INVALID_VALUE");
  }
  return value;
}
function validateParams(provider, raw) {
  for (const key of Object.keys(raw)) {
    if (!PARAM_FIELDS[provider].has(key)) throw new ExternalProviderRequestError("REQUEST_UNKNOWN_FIELD");
  }
  if (provider === "ticketmaster") {
    return {
      countryCode: optionalString(raw.countryCode, 2, /^[A-Z]{2}$/),
      city: optionalString(raw.city, 120),
      localStartDateTime: optionalString(raw.localStartDateTime, 40, /^\d{4}-\d{2}-\d{2}T/),
      classificationName: optionalString(raw.classificationName, 100),
      keyword: optionalString(raw.keyword, 160),
      size: optionalNumber(raw.size, 1, 100),
      page: optionalNumber(raw.page, 0, 50),
      source: optionalString(raw.source, 80),
      maxPages: optionalNumber(raw.maxPages, 1, 5)
    };
  }
  return {
    q: optionalString(raw.q, 160),
    venueCity: optionalString(raw.venueCity, 120),
    datetimeUtcGte: optionalString(raw.datetimeUtcGte, 40, /^\d{4}-\d{2}-\d{2}T/),
    taxonomyName: optionalString(raw.taxonomyName, 100),
    perPage: optionalNumber(raw.perPage, 1, 100),
    page: optionalNumber(raw.page, 1, 50),
    lat: optionalNumber(raw.lat, -90, 90, false),
    lon: optionalNumber(raw.lon, -180, 180, false),
    range: optionalString(raw.range, 20, /^\d+(mi|km)$/),
    maxPages: optionalNumber(raw.maxPages, 1, 5)
  };
}
async function parseExternalProviderRequest(request, provider) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new ExternalProviderRequestError("REQUEST_TOO_LARGE");
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new ExternalProviderRequestError("REQUEST_TOO_LARGE");
  }
  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new ExternalProviderRequestError("REQUEST_INVALID_JSON");
  }
  const body = objectRecord(parsed);
  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_FIELDS.has(key)) throw new ExternalProviderRequestError("REQUEST_UNKNOWN_FIELD");
  }
  const action = body.action === void 0 ? "search_preview" : body.action;
  if (action !== "search_preview" && action !== "sync") throw new ExternalProviderRequestError("REQUEST_INVALID_VALUE");
  const params = body.params === void 0 ? {} : objectRecord(body.params);
  return { action, params: validateParams(provider, params) };
}

// supabase/functions/sync-seatgeek-events/index.ts
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const admin = getSupabaseAdmin(req);
  let runId = null;
  try {
    const adminUser = await requireAdminUser(req, admin);
    const { action, params } = await parseExternalProviderRequest(req, "seatgeek");
    await assertExternalProviderAvailable(admin, "seatgeek");
    runId = await startExternalProviderRun(admin, "seatgeek", action, adminUser.id);
    if (action === "search_preview") {
      const result = await fetchSeatGeekEvents(params);
      await finishExternalProviderRun(admin, runId, "seatgeek", { itemCount: result.events.length, pageCount: 1, costUnits: 1, checkpoint: { page: result.pagination.page } });
      return jsonResponse(result);
    }
    if (action === "sync") {
      const maxPages = Math.max(1, Math.min(params.maxPages ?? 2, 5));
      const collected = [];
      let fetchedPages = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        const result = await fetchSeatGeekEvents({ ...params, page });
        fetchedPages += 1;
        collected.push(...result.events);
        if (!result.pagination.hasMore) break;
      }
      const { upserted } = await upsertExternalEvents(admin, collected);
      await finishExternalProviderRun(admin, runId, "seatgeek", { itemCount: upserted, pageCount: fetchedPages, costUnits: fetchedPages });
      return jsonResponse({ synced: upserted });
    }
    return jsonResponse({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("PROVIDER_DISABLED") && !message.includes("PROVIDER_CIRCUIT_OPEN")) {
      await failExternalProviderRun(admin, runId, "seatgeek", error).catch(() => void 0);
    }
    const status = error instanceof ExternalProviderRequestError ? 400 : message.includes("authorization") || message.includes("Unauthorized") ? 401 : message.includes("Admin access") ? 403 : message.includes("PROVIDER_") ? 503 : 500;
    const publicCode = status === 400 ? "INVALID_REQUEST" : status === 503 ? "PROVIDER_UNAVAILABLE" : status === 500 ? "PROVIDER_OPERATION_FAILED" : "AUTHORIZATION_FAILED";
    console.error(JSON.stringify({ scope: "seatgeek-sync", code: publicCode }));
    return jsonResponse({ error: publicCode }, status);
  }
});
