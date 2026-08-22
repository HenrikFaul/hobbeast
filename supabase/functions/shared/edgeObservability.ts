const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|email|phone|address|latitude|longitude|lat|lon|body|details|statement)/i;

export function correlationIdFromRequest(req: Request): string {
  const candidate = String(req.headers.get('x-correlation-id') || '').trim();
  if (/^[a-zA-Z0-9_-]{8,96}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}

export function redactEdgeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactEdgeMetadata(item, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' && value.length > 300
    ? `${value.slice(0, 297)}...`
    : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 60).map(([key, nested]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactEdgeMetadata(nested, depth + 1),
  ]));
}

export function logEdgeEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  correlationId: string,
  metadata: Record<string, unknown> = {},
) {
  const configuredSampleRate = Number(Deno.env.get('EDGE_INFO_LOG_SAMPLE_RATE') || '1');
  const sampleRate = Number.isFinite(configuredSampleRate)
    ? Math.min(1, Math.max(0, configuredSampleRate))
    : 1;
  if (level === 'info' && Math.random() > sampleRate) return;

  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    correlation_id: correlationId,
    release: Deno.env.get('RELEASE_VERSION') || 'edge-unknown',
    feature_flags: Array.isArray(metadata.feature_flags) ? metadata.feature_flags.slice(0, 30) : [],
    sample_rate: level === 'info' ? sampleRate : 1,
    metadata: redactEdgeMetadata(metadata),
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.info(record);
}

interface SupabaseResultLike {
  error?: { code?: string | null } | null;
}

/**
 * Measures a Supabase query/RPC without logging SQL text, request payloads or
 * returned rows. Supabase builders are PromiseLike, so callers can pass either
 * a native Promise or an awaited PostgREST operation.
 */
export async function observeEdgeOperation<T extends SupabaseResultLike>(
  operation: string,
  correlationId: string,
  work: () => PromiseLike<T>,
  metadata: Record<string, unknown> = {},
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await work();
    const durationMs = Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
    logEdgeEvent(result.error ? 'warn' : 'info', 'db_operation', correlationId, {
      operation,
      duration_ms: durationMs,
      outcome: result.error ? 'error' : 'success',
      error_code: result.error?.code || null,
      ...metadata,
    });
    return result;
  } catch (error) {
    logEdgeEvent('error', 'db_operation', correlationId, {
      operation,
      duration_ms: Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10),
      outcome: 'exception',
      error_type: error instanceof Error ? error.name : 'unknown',
      ...metadata,
    });
    throw error;
  }
}
