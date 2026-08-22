export type ExternalImportState = 'discovered' | 'review' | 'active' | 'stale' | 'cancelled' | 'rejected';
export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'unknown';
export type ProviderFailureKind = 'outage' | 'quota' | 'malformed_payload' | 'geocode_failure' | 'timeout' | 'unknown';

export interface ExternalProvenanceInput {
  provider: string;
  externalId: string;
  sourceUrl?: string | null;
  title: string;
  eventDate?: string | null;
  city?: string | null;
  firstSeenAt?: string | null;
  lastVerifiedAt?: string | null;
  normalizationVersion?: string | null;
  dedupeConfidence?: number | null;
  importState?: ExternalImportState | null;
}

export interface ExternalProvenance {
  provider: string;
  externalId: string;
  sourceUrl: string | null;
  canonicalFingerprint: string;
  firstSeenAt: string | null;
  lastVerifiedAt: string | null;
  freshness: FreshnessState;
  normalizationVersion: string;
  dedupeConfidence: number;
  importState: ExternalImportState;
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function externalEventFingerprint(input: Pick<ExternalProvenanceInput, 'title' | 'eventDate' | 'city'>) {
  return `${normalize(input.title)}|${input.eventDate ?? ''}|${normalize(input.city)}`;
}

export function resolveFreshness(lastVerifiedAt: string | null | undefined, now = new Date()): FreshnessState {
  if (!lastVerifiedAt) return 'unknown';
  const verified = new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return 'unknown';
  const ageHours = (now.getTime() - verified.getTime()) / 3_600_000;
  if (ageHours <= 24) return 'fresh';
  if (ageHours <= 72) return 'aging';
  return 'stale';
}

export function buildExternalProvenance(input: ExternalProvenanceInput, now = new Date()): ExternalProvenance {
  const confidence = Number.isFinite(input.dedupeConfidence)
    ? Math.min(1, Math.max(0, Number(input.dedupeConfidence)))
    : 0;
  const freshness = resolveFreshness(input.lastVerifiedAt, now);
  let importState = input.importState ?? 'discovered';
  if (importState === 'active' && freshness === 'stale') importState = 'stale';
  return {
    provider: normalize(input.provider),
    externalId: input.externalId.trim(),
    sourceUrl: input.sourceUrl?.trim() || null,
    canonicalFingerprint: externalEventFingerprint(input),
    firstSeenAt: input.firstSeenAt ?? null,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
    freshness,
    normalizationVersion: input.normalizationVersion?.trim() || 'external-event-v1',
    dedupeConfidence: confidence,
    importState,
  };
}

export function shouldAutoLinkDuplicate(confidence: number, threshold = 0.98) {
  return Number.isFinite(confidence) && confidence >= threshold && confidence <= 1;
}

export function classifyProviderFailure(input: { status?: number | null; timedOut?: boolean; malformedPayload?: boolean; geocodeFailed?: boolean }) {
  if (input.timedOut) return 'timeout' as const;
  if (input.malformedPayload) return 'malformed_payload' as const;
  if (input.geocodeFailed) return 'geocode_failure' as const;
  if (input.status === 429) return 'quota' as const;
  if (input.status && input.status >= 500) return 'outage' as const;
  return 'unknown' as const;
}

export interface ProviderCircuitState {
  consecutiveFailures: number;
  openUntil: number | null;
}

export function nextProviderCircuitState(
  current: ProviderCircuitState,
  outcome: 'success' | 'failure',
  nowMs: number,
  options: { threshold?: number; cooldownMs?: number } = {},
): ProviderCircuitState {
  if (outcome === 'success') return { consecutiveFailures: 0, openUntil: null };
  const failures = current.consecutiveFailures + 1;
  const threshold = options.threshold ?? 3;
  return {
    consecutiveFailures: failures,
    openUntil: failures >= threshold ? nowMs + (options.cooldownMs ?? 60_000) : current.openUntil,
  };
}

export function providerRetryDelayMs(attempt: number, retryAfterSeconds?: number | null) {
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(retryAfterSeconds * 1000, 30_000);
  return Math.min(500 * 2 ** Math.max(0, attempt), 8_000);
}

export type GeoPrecisionPurpose = 'discovery' | 'private_event' | 'analytics' | 'export';
export type GeoPrecision = 'city' | 'approximate_radius' | 'restricted_exact' | 'aggregate_grid' | 'explicit_permission_required';

export function geoPrecisionForPurpose(purpose: GeoPrecisionPurpose): GeoPrecision {
  switch (purpose) {
    case 'discovery': return 'approximate_radius';
    case 'private_event': return 'restricted_exact';
    case 'analytics': return 'aggregate_grid';
    case 'export': return 'explicit_permission_required';
  }
}
