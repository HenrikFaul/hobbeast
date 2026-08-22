import type { ExternalEventNormalized } from './external-events-types.ts';

export const EXTERNAL_EVENT_NORMALIZATION_VERSION = 'external-event-v1';

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function externalEventFingerprint(event: Pick<ExternalEventNormalized, 'title' | 'event_date' | 'location_city'>) {
  return `${normalize(event.title)}|${event.event_date ?? ''}|${normalize(event.location_city)}`;
}

export function externalEventProvenance(event: ExternalEventNormalized) {
  const verifiedAt = event.last_verified_at || event.source_last_synced_at || new Date().toISOString();
  return {
    last_verified_at: verifiedAt,
    freshness_state: 'fresh' as const,
    normalization_version: event.normalization_version || EXTERNAL_EVENT_NORMALIZATION_VERSION,
    dedupe_confidence: event.dedupe_confidence ?? 0,
    canonical_fingerprint: event.canonical_fingerprint || externalEventFingerprint(event),
    import_state: event.import_state || 'active' as const,
  };
}
