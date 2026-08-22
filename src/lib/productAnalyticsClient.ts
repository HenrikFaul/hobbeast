import { supabase } from '@/integrations/supabase/client';
import { createCorrelationId } from '@/lib/observability';
import {
  buildAnalyticsEnvelope,
  type ProductAnalyticsEventName,
} from '@/lib/productAnalytics';

export type AnalyticsDispatchResult =
  | { accepted: true }
  | { accepted: false; reason: 'invalid' | 'suppressed' | 'unavailable' };

export async function trackProductEvent(
  eventName: ProductAnalyticsEventName,
  properties: Record<string, unknown> = {},
): Promise<AnalyticsDispatchResult> {
  const idempotencyKey = createCorrelationId();
  const envelope = buildAnalyticsEnvelope(eventName, properties, { idempotencyKey });
  if (!envelope.ok) return { accepted: false, reason: 'invalid' };

  try {
    const correlationId = createCorrelationId();
    const { data, error } = await supabase.functions.invoke('analytics-ingest', {
      body: envelope.value,
      headers: {
        'X-Correlation-ID': correlationId,
        'Idempotency-Key': idempotencyKey,
      },
    });
    if (error) return { accepted: false, reason: 'unavailable' };
    return data?.accepted ? { accepted: true } : { accepted: false, reason: 'suppressed' };
  } catch {
    // Analytics is never allowed to break a product mutation or page render.
    return { accepted: false, reason: 'unavailable' };
  }
}
