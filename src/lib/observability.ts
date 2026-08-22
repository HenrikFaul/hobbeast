const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|email|phone|address|latitude|longitude|lat|lon|body|free.?text)/i;

export interface TelemetryContext {
  correlationId: string;
  release: string;
  featureFlags?: readonly string[];
}

export function createCorrelationId(candidate?: string | null): string {
  const normalized = String(candidate || '').trim();
  if (/^[a-zA-Z0-9_-]{8,96}$/.test(normalized)) return normalized;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function redactTelemetryValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactTelemetryValue(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 497)}...`;
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactTelemetryValue(nested, depth + 1),
      ]),
  );
}

export function buildTelemetryEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  name: string,
  context: TelemetryContext,
  attributes: Record<string, unknown> = {},
) {
  return {
    timestamp: new Date().toISOString(),
    level,
    name: name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100),
    correlation_id: context.correlationId,
    release: context.release,
    feature_flags: [...(context.featureFlags || [])].slice(0, 30),
    attributes: redactTelemetryValue(attributes),
  };
}
