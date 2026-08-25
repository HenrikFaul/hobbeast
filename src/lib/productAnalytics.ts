export const PRODUCT_ANALYTICS_EVENTS = [
  'onboarding_started',
  'onboarding_completed',
  'interest_selected',
  'event_impression',
  'event_detail',
  'event_join',
  'waitlist_joined',
  'checked_in',
  'completed',
  'post_event_feedback',
  'reconnection_sent',
  'reconnection_mutual',
  'circle_created',
  'circle_joined',
  'organizer_event_created',
  'organizer_event_completed',
  'hub_qualified',
  'auto_event_proposed',
  'auto_event_published',
  'verified_or_confirmed_real_world_participation',
  'external_social_intent',
  'explore_search',
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENTS)[number];

const SAFE_PROPERTY_KEYS = new Set([
  'event_id',
  'category',
  'source',
  'surface',
  'status',
  'city_bucket',
  'cohort',
  'experiment_key',
  'variant',
  'duration_bucket',
  'count_bucket',
  'schema_version',
]);

const FORBIDDEN_KEY = /(email|phone|address|lat|lon|name|bio|message|description|text|token|secret|password)/i;

export interface AnalyticsEnvelope {
  eventName: ProductAnalyticsEventName;
  schemaVersion: 1;
  idempotencyKey: string;
  occurredAt: string;
  properties: Record<string, string | number | boolean | null>;
}

export type AnalyticsValidation =
  | { ok: true; value: AnalyticsEnvelope }
  | { ok: false; error: string };

export function buildAnalyticsEnvelope(
  eventName: string,
  properties: Record<string, unknown> = {},
  options: { idempotencyKey?: string; occurredAt?: string } = {},
): AnalyticsValidation {
  if (!PRODUCT_ANALYTICS_EVENTS.includes(eventName as ProductAnalyticsEventName)) {
    return { ok: false, error: 'Unknown analytics event.' };
  }

  const safe: AnalyticsEnvelope['properties'] = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEY.test(key) || !SAFE_PROPERTY_KEYS.has(key)) {
      return { ok: false, error: `Forbidden analytics property: ${key}` };
    }
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      return { ok: false, error: `Invalid analytics property value: ${key}` };
    }
    if (typeof value === 'string' && value.length > 120) {
      return { ok: false, error: `Analytics property is too long: ${key}` };
    }
    safe[key] = value as string | number | boolean | null;
  }

  const occurredAt = options.occurredAt || new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) return { ok: false, error: 'Invalid analytics timestamp.' };

  return {
    ok: true,
    value: {
      eventName: eventName as ProductAnalyticsEventName,
      schemaVersion: 1,
      idempotencyKey: options.idempotencyKey || crypto.randomUUID(),
      occurredAt,
      properties: safe,
    },
  };
}

export function isMeaningfulConnectionProxy(input: {
  mutualReconnection: boolean;
  completedEncounterCount: number;
}): boolean {
  return input.mutualReconnection && input.completedEncounterCount >= 2;
}
