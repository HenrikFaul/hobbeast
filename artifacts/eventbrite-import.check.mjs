// supabase/functions/eventbrite-import/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// supabase/functions/shared/adminAuth.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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
  const timeoutMs = Math.max(1e3, Math.min(options.timeoutMs ?? 12e3, 3e4));
  const retryBaseMs = Math.max(100, options.retryBaseMs ?? 500);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries) {
          await res.body?.cancel().catch(() => void 0);
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, res.headers.get("retry-after"), retryBaseMs)));
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

// supabase/functions/shared/adminAuth.ts
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

// supabase/functions/shared/eventbrite.ts
function text(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function httpsUrl(value) {
  const raw = text(value, 2e3);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
var CATEGORY_EMOJI = {
  Music: "\u{1F3B5}",
  Business: "\u{1F4BC}",
  "Food & Drink": "\u{1F37D}\uFE0F",
  Community: "\u{1F91D}",
  Arts: "\u{1F3A8}",
  "Film & Media": "\u{1F3AC}",
  "Sports & Fitness": "\u{1F3C3}",
  Health: "\u{1F9D8}",
  "Science & Tech": "\u{1F4BB}",
  "Travel & Outdoor": "\u{1F3D4}\uFE0F",
  Hobbies: "\u{1F3AF}",
  Other: "\u{1F4C5}"
};
function normalizeEventbriteEvent(raw) {
  const externalId = text(raw?.id, 200);
  const title = text(raw?.name?.text, 300);
  if (!externalId) throw new Error("Eventbrite event is missing an id");
  if (!title) throw new Error("Eventbrite event is missing a title");
  const startLocal = text(raw?.start?.local, 64);
  const [eventDate, timeWithZone] = startLocal ? startLocal.split("T") : [];
  const category = text(raw?.category?.name || raw?.category?.short_name, 100) || "Egy\xE9b";
  const venue = raw?.venue;
  const city = text(venue?.address?.city, 120) || null;
  const address = text(venue?.address?.localized_address_display || venue?.name, 300) || null;
  const capacity = Number(raw?.capacity);
  const externalUrl = httpsUrl(raw?.url);
  return {
    id: `eb-${externalId}`,
    external_source: "eventbrite",
    external_id: externalId,
    canonical_identity: `eventbrite:${externalId.toLowerCase()}`,
    title,
    category,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(eventDate || "") ? eventDate : null,
    event_time: timeWithZone ? timeWithZone.slice(0, 5) : null,
    location_city: city,
    location_district: null,
    location_address: address,
    location_free_text: null,
    location_type: venue ? "address" : "online",
    max_attendees: Number.isFinite(capacity) && capacity >= 0 ? capacity : null,
    image_emoji: CATEGORY_EMOJI[category] || "\u{1F4C5}",
    tags: ["Eventbrite", ...raw?.is_free === true ? ["Ingyenes"] : []],
    description: text(raw?.description?.text, 300) || null,
    created_by: "",
    participant_count: 0,
    source: "eventbrite",
    source_label: "Eventbrite",
    eventbrite_url: externalUrl,
    eventbrite_logo_url: httpsUrl(raw?.logo?.original?.url || raw?.logo?.url),
    provider_status: text(raw?.status, 40) || null
  };
}
function normalizeEventbritePage(payload) {
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const events = Array.isArray(raw.events) ? raw.events.map((event) => normalizeEventbriteEvent(event)) : [];
  const pagination = raw.pagination && typeof raw.pagination === "object" && !Array.isArray(raw.pagination) ? raw.pagination : {};
  const pageNumber = Math.max(1, Number(pagination.page_number) || 1);
  const pageCount = Math.max(0, Number(pagination.page_count) || 0);
  return {
    events,
    pagination: {
      object_count: Math.max(0, Number(pagination.object_count) || events.length),
      page_number: pageNumber,
      page_size: Math.max(0, Number(pagination.page_size) || events.length),
      page_count: pageCount,
      has_more_items: pagination.has_more_items === true || pageCount > 0 && pageNumber < pageCount
    }
  };
}
function normalizeEventbriteOrganizations(payload) {
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    organizations: Array.isArray(raw.organizations) ? raw.organizations.flatMap((organization) => {
      if (!organization || typeof organization !== "object" || Array.isArray(organization)) return [];
      const row = organization;
      const id = text(row.id, 200);
      if (!id) return [];
      const nameValue = row.name && typeof row.name === "object" && !Array.isArray(row.name) ? text(row.name.text, 200) : text(row.name, 200);
      return [{ id, name: nameValue || "Eventbrite organization" }];
    }) : []
  };
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

// supabase/functions/eventbrite-import/index.ts
var EVENTBRITE_BASE = "https://www.eventbriteapi.com/v3";
var MAX_BODY_BYTES = 16 * 1024;
var ACTIONS = /* @__PURE__ */ new Set(["validate_token", "list_organizations", "list_events", "search_events"]);
function getEventbriteToken() {
  return String(
    Deno.env.get("EVENTBRITE_PRIVATE_TOKEN") || Deno.env.get("EVENTBRITE_TOKEN") || Deno.env.get("EVENTBRITE_API_KEY") || ""
  ).trim();
}
function getEventbriteConfig() {
  return {
    has_api_key: Boolean(Deno.env.get("EVENTBRITE_API_KEY")),
    has_client_secret: Boolean(Deno.env.get("EVENTBRITE_CLIENT_SECRET")),
    has_private_token: Boolean(getEventbriteToken()),
    has_public_token: Boolean(Deno.env.get("EVENTBRITE_PUBLIC_TOKEN")),
    has_webhook_id: Boolean(Deno.env.get("EVENTBRITE_WEBHOOK_ID"))
  };
}
async function parseRequest(req) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  let body;
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    throw new Error("INVALID_JSON");
  }
  const allowed = /* @__PURE__ */ new Set(["action", "organization_id", "keyword", "page", "location"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error("INVALID_REQUEST_FIELD");
  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) throw new Error("UNKNOWN_ACTION");
  return {
    action,
    organization_id: typeof body.organization_id === "string" ? body.organization_id.trim().slice(0, 200) : void 0,
    keyword: typeof body.keyword === "string" ? body.keyword.trim().slice(0, 100) : void 0,
    location: typeof body.location === "string" ? body.location.trim().slice(0, 100) : void 0,
    page: Math.max(1, Math.min(Number(body.page) || 1, 50))
  };
}
async function optionalUserId(req, admin) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user?.id || null;
}
serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  const startedAt = performance.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  const admin = getSupabaseAdmin(req);
  let runId = null;
  let action = "unknown";
  let providerCalls = 0;
  try {
    const body = await parseRequest(req);
    action = body.action;
    if (body.action === "list_events" && !body.organization_id) throw new Error("ORGANIZATION_ID_REQUIRED");
    const isAdminAction = body.action !== "search_events";
    const actor = isAdminAction ? await requireAdminUser(req, admin) : null;
    const userId = actor?.id || await optionalUserId(req, admin);
    if (body.action === "search_events") {
      const pepper = String(Deno.env.get("RATE_LIMIT_HASH_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
      const subjectHash = await rateLimitSubjectHash({ request: req, userId, pepper });
      const rate = await consumeEdgeRateLimit({
        admin,
        endpoint: "eventbrite.search_events",
        subjectHash,
        windowSeconds: 60,
        requestLimit: userId ? 20 : 10
      });
      if (!rate.allowed) {
        const response = jsonResponse({ error: "RATE_LIMITED", retry_after_seconds: rate.retryAfterSeconds }, 429);
        response.headers.set("Retry-After", String(rate.retryAfterSeconds));
        return response;
      }
    }
    const token = getEventbriteToken();
    if (!token) return jsonResponse({ error: "PROVIDER_NOT_CONFIGURED" }, 503);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const providerGet = async (path) => {
      providerCalls += 1;
      return fetchJson(`${EVENTBRITE_BASE}${path}`, { headers }, "eventbrite", {
        timeoutMs: 12e3,
        retries: 2,
        retryBaseMs: 500
      });
    };
    await assertExternalProviderAvailable(admin, "eventbrite");
    runId = await startExternalProviderRun(admin, "eventbrite", body.action, userId);
    if (body.action === "validate_token") {
      await providerGet("/users/me/organizations/");
      await finishExternalProviderRun(admin, runId, "eventbrite", { itemCount: 0, pageCount: 1, costUnits: providerCalls });
      return jsonResponse({ ok: true, status: 200, config: getEventbriteConfig() });
    }
    if (body.action === "list_organizations") {
      const normalized2 = normalizeEventbriteOrganizations(await providerGet("/users/me/organizations/"));
      await finishExternalProviderRun(admin, runId, "eventbrite", {
        itemCount: normalized2.organizations.length,
        pageCount: 1,
        costUnits: providerCalls
      });
      return jsonResponse(normalized2);
    }
    if (body.action === "list_events") {
      const params = new URLSearchParams({ status: "live", order_by: "start_asc", expand: "venue,category", page: String(body.page) });
      const normalized2 = normalizeEventbritePage(await providerGet(
        `/organizations/${encodeURIComponent(body.organization_id)}/events/?${params}`
      ));
      await finishExternalProviderRun(admin, runId, "eventbrite", {
        itemCount: normalized2.events.length,
        pageCount: 1,
        costUnits: providerCalls,
        checkpoint: { page: normalized2.pagination.page_number }
      });
      return jsonResponse(normalized2);
    }
    const searchParams = new URLSearchParams({
      expand: "venue,category",
      sort_by: "date",
      "location.address": body.location || "Budapest",
      "location.within": "50km",
      page: String(body.page)
    });
    if (body.keyword) searchParams.set("q", body.keyword);
    let normalized = normalizeEventbritePage(await providerGet(`/events/search/?${searchParams}`));
    if (normalized.events.length === 0) {
      const organizations = normalizeEventbriteOrganizations(await providerGet("/users/me/organizations/"));
      for (const organization of organizations.organizations.slice(0, 10)) {
        const params = new URLSearchParams({ status: "live", order_by: "start_asc", expand: "venue,category", page: String(body.page) });
        normalized = normalizeEventbritePage(await providerGet(
          `/organizations/${encodeURIComponent(organization.id)}/events/?${params}`
        ));
        if (normalized.events.length > 0) break;
      }
    }
    if (normalized.events.length === 0) {
      const params = new URLSearchParams({ expand: "venue,category", page: String(body.page) });
      if (body.keyword) params.set("q", body.keyword);
      normalized = normalizeEventbritePage(await providerGet(`/destination/events/?${params}`));
    }
    await finishExternalProviderRun(admin, runId, "eventbrite", {
      itemCount: normalized.events.length,
      pageCount: 1,
      costUnits: providerCalls,
      checkpoint: { page: normalized.pagination.page_number }
    });
    logEdgeEvent("info", "eventbrite_request", correlationId, {
      action,
      outcome: "success",
      item_count: normalized.events.length,
      duration_ms: Math.round(performance.now() - startedAt)
    });
    return jsonResponse(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("PROVIDER_DISABLED") && !message.includes("PROVIDER_CIRCUIT_OPEN")) {
      await failExternalProviderRun(admin, runId, "eventbrite", error, {
        action,
        safeContext: { correlation_id: correlationId }
      }).catch(() => void 0);
    }
    const status = message === "REQUEST_TOO_LARGE" ? 413 : ["INVALID_JSON", "INVALID_REQUEST_FIELD", "UNKNOWN_ACTION", "ORGANIZATION_ID_REQUIRED"].includes(message) ? 400 : message.includes("authorization") || message.includes("Unauthorized") ? 401 : message.includes("Admin access") ? 403 : message.includes("PROVIDER_") || error instanceof ProviderFetchError ? 503 : 500;
    const publicCode = status === 413 ? "REQUEST_TOO_LARGE" : status === 400 ? "INVALID_REQUEST" : status === 401 || status === 403 ? "AUTHORIZATION_FAILED" : "PROVIDER_UNAVAILABLE";
    logEdgeEvent("error", "eventbrite_request", correlationId, {
      action,
      outcome: "failed",
      error_code: publicCode,
      duration_ms: Math.round(performance.now() - startedAt)
    });
    return jsonResponse({ error: publicCode }, status);
  }
});
