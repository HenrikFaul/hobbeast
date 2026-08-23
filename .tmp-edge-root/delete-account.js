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
async function observeEdgeOperation(operation, correlationId, work, metadata = {}) {
  const startedAt = performance.now();
  try {
    const result = await work();
    const durationMs = Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
    logEdgeEvent(result.error ? "warn" : "info", "db_operation", correlationId, {
      operation,
      duration_ms: durationMs,
      outcome: result.error ? "error" : "success",
      error_code: result.error?.code || null,
      ...metadata
    });
    return result;
  } catch (error) {
    logEdgeEvent("error", "db_operation", correlationId, {
      operation,
      duration_ms: Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10),
      outcome: "exception",
      error_type: error instanceof Error ? error.name : "unknown",
      ...metadata
    });
    throw error;
  }
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

// supabase/functions/delete-account/index.ts
var MAX_BODY_BYTES = 4096;
var IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{8,200}$/;
var SAFE_ERROR_CODES = /* @__PURE__ */ new Set([
  "REQUEST_TOO_LARGE",
  "INVALID_JSON",
  "INVALID_BODY",
  "INVALID_IDEMPOTENCY_KEY",
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "EDGE_AUTH_CONFIGURATION_MISSING",
  "DELETION_REQUEST_FAILED"
]);
var edgeCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, idempotency-key, x-correlation-id`
};
function respond(body, status, correlationId) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...edgeCorsHeaders,
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId,
      "Cache-Control": "no-store"
    }
  });
}
async function readLegacyBody(req) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_BODY");
    const body = value;
    if (Object.keys(body).some((key) => key !== "reason")) throw new Error("INVALID_BODY");
    if (body.reason !== void 0 && (typeof body.reason !== "string" || body.reason.trim().length > 500)) {
      throw new Error("INVALID_BODY");
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY") throw error;
    throw new Error("INVALID_JSON");
  }
}
function requestKey(req, userId) {
  const supplied = String(req.headers.get("idempotency-key") || "").trim();
  if (supplied && !IDEMPOTENCY_PATTERN.test(supplied)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return supplied || `account-deletion:${userId}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
}
Deno.serve(async (req) => {
  const correlationId = correlationIdFromRequest(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED", correlationId }, 405, correlationId);
  }
  try {
    await readLegacyBody(req);
    const { client, user } = await requireAuthenticatedUserClient(req);
    const idempotencyKey = requestKey(req, user.id);
    const { data, error } = await observeEdgeOperation(
      "privacy.request_account_deletion",
      correlationId,
      () => client.rpc("request_my_data_subject_action_v2", {
        _request_type: "deletion",
        _export_scope: [],
        _idempotency_key: idempotencyKey
      }),
      { subject: "authenticated_user" }
    );
    if (error || !data) throw new Error("DELETION_REQUEST_FAILED");
    const result = data;
    logEdgeEvent("info", "account_deletion_scheduled", correlationId, {
      status: String(result.status || "requested"),
      idempotent_replay: result.idempotent_replay === true
    });
    return respond({
      success: true,
      scheduled: true,
      request_id: result.request_id,
      status: result.status,
      grace_period_ends_at: result.grace_period_ends_at,
      idempotent_replay: result.idempotent_replay === true,
      correlationId
    }, 202, correlationId);
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const code = SAFE_ERROR_CODES.has(rawCode) ? rawCode : "INTERNAL_ERROR";
    const status = code === "REQUEST_TOO_LARGE" ? 413 : code === "INVALID_JSON" || code === "INVALID_BODY" || code === "INVALID_IDEMPOTENCY_KEY" ? 400 : code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? 401 : code === "DELETION_REQUEST_FAILED" ? 503 : 500;
    logEdgeEvent(status >= 500 ? "error" : "warn", "account_deletion_request_failed", correlationId, {
      code,
      status
    });
    const userMessage = status === 401 ? "Authentication required." : status === 400 ? "Invalid request." : status === 413 ? "Request too large." : "The account deletion request could not be scheduled.";
    return respond({ error: userMessage, code, correlationId }, status, correlationId);
  }
});
