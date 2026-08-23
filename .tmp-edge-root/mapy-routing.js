// supabase/functions/mapy-routing/index.ts
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
var supabaseAdmin = getSupabaseAdmin();
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

// supabase/functions/shared/edgeObservability.ts
var SENSITIVE_KEY = /(authorization|cookie|token|secret|password|email|phone|address|latitude|longitude|lat|lon|body|details|statement)/i;
function correlationIdFromRequest(req) {
  const candidate = String(req.headers.get("x-correlation-id") || "").trim();
  if (/^[a-zA-Z0-9_-]{8,96}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}
function redactEdgeMetadata(value, depth = 0) {
  if (depth > 4) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactEdgeMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" && value.length > 300 ? `${value.slice(0, 297)}...` : value;
  return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, nested]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactEdgeMetadata(nested, depth + 1)
  ]));
}
function logEdgeEvent(level, event, correlationId, metadata = {}) {
  const configuredSampleRate = Number(Deno.env.get("EDGE_INFO_LOG_SAMPLE_RATE") || "1");
  const sampleRate = Number.isFinite(configuredSampleRate) ? Math.min(1, Math.max(0, configuredSampleRate)) : 1;
  if (level === "info" && Math.random() > sampleRate) return;
  const record = JSON.stringify({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    correlation_id: correlationId,
    release: Deno.env.get("RELEASE_VERSION") || "edge-unknown",
    feature_flags: Array.isArray(metadata.feature_flags) ? metadata.feature_flags.slice(0, 30) : [],
    sample_rate: level === "info" ? sampleRate : 1,
    metadata: redactEdgeMetadata(metadata)
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

// supabase/functions/shared/userAuth.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2.49.8";
function bearerToken(req) {
  const header = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
async function requireAuthenticatedUserClient(req) {
  const token = bearerToken(req);
  if (!token) throw new Error("AUTH_REQUIRED");
  const publishableKey = String(
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || ""
  ).trim();
  if (!publishableKey) throw new Error("EDGE_AUTH_CONFIGURATION_MISSING");
  const client = createClient2(resolveInternalSupabaseUrl(req), publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_INVALID");
  return { client, user: data.user };
}

// supabase/functions/shared/rateLimit.ts
function firstForwardedAddress(request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim().slice(0, 100);
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function rateLimitSubjectHash(input) {
  if (!input.pepper.trim()) throw new Error("RATE_LIMIT_PEPPER_MISSING");
  const subject = input.userId ? `user:${input.userId}` : `guest:${firstForwardedAddress(input.request)}:${(input.request.headers.get("user-agent") || "unknown").slice(0, 160)}`;
  return sha256Hex(`${input.pepper}:${subject}`);
}
async function consumeEdgeRateLimit(input) {
  const { data, error } = await input.admin.rpc("consume_edge_rate_limit", {
    p_endpoint: input.endpoint,
    p_subject_hash: input.subjectHash,
    p_window_seconds: input.windowSeconds,
    p_request_limit: input.requestLimit
  });
  if (error) throw new Error(`RATE_LIMIT_CHECK_FAILED:${error.code || "unknown"}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    remaining: Math.max(0, Number(row?.remaining) || 0),
    retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds) || 0)
  };
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

// supabase/functions/mapy-routing/contract.ts
var MapyRoutingRequestError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "MapyRoutingRequestError";
  }
};
var MAX_BODY_BYTES = 32 * 1024;
var MAX_WAYPOINTS = 8;
var MAX_ELEVATION_POINTS = 200;
var ROUTE_TYPES = /* @__PURE__ */ new Set([
  "car_fast",
  "car_fast_traffic",
  "car_short",
  "foot_fast",
  "foot_hiking",
  "bike_road",
  "bike_mountain"
]);
function objectRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MapyRoutingRequestError("INVALID_BODY");
  return value;
}
function exactFields(record, allowed) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new MapyRoutingRequestError("INVALID_BODY");
}
function finiteInRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function coordinate(value) {
  const point = objectRecord(value);
  exactFields(point, ["lat", "lon"]);
  if (!finiteInRange(point.lat, -90, 90) || !finiteInRange(point.lon, -180, 180)) {
    throw new MapyRoutingRequestError("INVALID_COORDINATE");
  }
  if (Number(point.lat) === 0 && Number(point.lon) === 0) throw new MapyRoutingRequestError("INVALID_COORDINATE");
  return { lat: Number(point.lat), lon: Number(point.lon) };
}
function elevationCoordinate(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new MapyRoutingRequestError("INVALID_COORDINATE");
  const [lon, lat] = value;
  if (!finiteInRange(lon, -180, 180) || !finiteInRange(lat, -90, 90) || lon === 0 && lat === 0) {
    throw new MapyRoutingRequestError("INVALID_COORDINATE");
  }
  return [Number(lon), Number(lat)];
}
async function parseMapyRoutingRequest(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new MapyRoutingRequestError("REQUEST_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new MapyRoutingRequestError("REQUEST_TOO_LARGE");
  let value;
  try {
    value = JSON.parse(raw || "{}");
  } catch {
    throw new MapyRoutingRequestError("INVALID_JSON");
  }
  const body = objectRecord(value);
  exactFields(body, ["action", "params"]);
  const params = objectRecord(body.params);
  if (body.action === "route") {
    exactFields(params, ["start", "end", "waypoints", "routeType"]);
    const waypoints = params.waypoints === void 0 ? [] : params.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length > MAX_WAYPOINTS) throw new MapyRoutingRequestError("INVALID_BODY");
    const routeType = params.routeType === void 0 ? "foot_fast" : params.routeType;
    if (typeof routeType !== "string" || !ROUTE_TYPES.has(routeType)) {
      throw new MapyRoutingRequestError("INVALID_BODY");
    }
    return {
      action: "route",
      params: {
        start: coordinate(params.start),
        end: coordinate(params.end),
        waypoints: waypoints.map(coordinate),
        routeType
      }
    };
  }
  if (body.action === "elevation") {
    exactFields(params, ["coordinates"]);
    if (!Array.isArray(params.coordinates) || params.coordinates.length < 2 || params.coordinates.length > MAX_ELEVATION_POINTS) {
      throw new MapyRoutingRequestError("INVALID_BODY");
    }
    return { action: "elevation", params: { coordinates: params.coordinates.map(elevationCoordinate) } };
  }
  throw new MapyRoutingRequestError("INVALID_BODY");
}

// supabase/functions/mapy-routing/index.ts
var MAPY_BASE_URL = "https://api.mapy.cz/v1";
var edgeCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-correlation-id`
};
function respond(body, status, correlationId, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...edgeCorsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      ...extraHeaders
    }
  });
}
serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED", correlationId }, 405, correlationId);
  }
  const admin = getSupabaseAdmin(req);
  let runId = null;
  let action = "unknown";
  try {
    const body = await parseMapyRoutingRequest(req);
    action = body.action;
    const { user } = await requireAuthenticatedUserClient(req);
    const pepper = String(Deno.env.get("RATE_LIMIT_HASH_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const subjectHash = await rateLimitSubjectHash({ request: req, userId: user.id, pepper });
    const rate = await consumeEdgeRateLimit({
      admin,
      endpoint: `mapy-routing.${action}`,
      subjectHash,
      windowSeconds: 60,
      requestLimit: action === "route" ? 30 : 15
    });
    if (!rate.allowed) {
      logEdgeEvent("warn", "mapy_routing_rate_limited", correlationId, { action, retry_after_seconds: rate.retryAfterSeconds });
      return respond(
        { error: "Too many requests.", code: "RATE_LIMITED", retry_after_seconds: rate.retryAfterSeconds, correlationId },
        429,
        correlationId,
        { "Retry-After": String(rate.retryAfterSeconds) }
      );
    }
    const apiKey = String(Deno.env.get("MAPY_CZ_API_KEY") || "").trim();
    if (!apiKey) throw new Error("PROVIDER_NOT_CONFIGURED");
    await assertExternalProviderAvailable(admin, "mapy");
    runId = await startExternalProviderRun(admin, "mapy", action, user.id);
    let payload;
    let itemCount = 1;
    if (body.action === "route") {
      const params = new URLSearchParams({
        apikey: apiKey,
        start: `${body.params.start.lon},${body.params.start.lat}`,
        end: `${body.params.end.lon},${body.params.end.lat}`,
        routeType: body.params.routeType,
        format: "geojson",
        lang: "cs"
      });
      if (body.params.waypoints.length > 0) {
        params.set("waypoints", body.params.waypoints.map((point) => `${point.lon},${point.lat}`).join("|"));
      }
      payload = await fetchJson(
        `${MAPY_BASE_URL}/routing/route?${params}`,
        { method: "GET", headers: { Accept: "application/json" } },
        "mapy-routing",
        { timeoutMs: 12e3, retries: 1, retryBaseMs: 400 }
      );
    } else {
      itemCount = body.params.coordinates.length;
      payload = await fetchJson(
        `${MAPY_BASE_URL}/elevation?apikey=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: body.params.coordinates.map(([lon, lat]) => ({ lon, lat }))
          })
        },
        "mapy-elevation",
        { timeoutMs: 12e3, retries: 1, retryBaseMs: 400 }
      );
    }
    await finishExternalProviderRun(admin, runId, "mapy", {
      itemCount,
      pageCount: 1,
      costUnits: 1,
      checkpoint: { action, completed_at: (/* @__PURE__ */ new Date()).toISOString() }
    });
    logEdgeEvent("info", "mapy_routing_succeeded", correlationId, { action, item_count: itemCount });
    return respond(payload, 200, correlationId);
  } catch (error) {
    if (runId) {
      await failExternalProviderRun(admin, runId, "mapy", error, {
        action,
        safeContext: { correlation_id: correlationId }
      }).catch(() => void 0);
    }
    const code = error instanceof MapyRoutingRequestError ? error.code : error instanceof ProviderFetchError && error.kind === "quota" ? "PROVIDER_QUOTA" : error instanceof ProviderFetchError ? "PROVIDER_UNAVAILABLE" : error instanceof Error && ["AUTH_REQUIRED", "AUTH_INVALID"].includes(error.message) ? error.message : error instanceof Error && ["PROVIDER_NOT_CONFIGURED", "PROVIDER_DISABLED", "PROVIDER_CIRCUIT_OPEN"].includes(error.message) ? error.message : "MAPY_ROUTING_FAILED";
    const status = code === "REQUEST_TOO_LARGE" ? 413 : code === "INVALID_JSON" || code === "INVALID_BODY" || code === "INVALID_COORDINATE" ? 400 : code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? 401 : code === "PROVIDER_QUOTA" ? 429 : code.startsWith("PROVIDER_") ? 503 : 500;
    logEdgeEvent(status >= 500 ? "error" : "warn", "mapy_routing_failed", correlationId, { action, code, status });
    const message = status === 400 ? "Invalid route request." : status === 401 ? "Authentication required." : status === 413 ? "Request too large." : status === 429 ? "Provider quota is temporarily unavailable." : "Routing provider is temporarily unavailable.";
    return respond({ error: message, code, correlationId }, status, correlationId);
  }
});
