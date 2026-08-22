import { supabase } from '@/integrations/supabase/client';
import type { RecommendationReasonCode } from '@/lib/recommendationEngine';

export interface NativeRecommendationSignal {
  eventId: string;
  rankingScore: number;
  reasonCodes: RecommendationReasonCode[];
  distanceKm: number | null;
  attendedSimilar: boolean;
  availabilityMatch: boolean;
  hostReliability: number;
  exposureShare: number;
  impressionCount: number;
}

interface UntypedRpcResult {
  data: unknown;
  error: { message: string } | null;
}

const recommendationRpcClient = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<UntypedRpcResult>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODES = new Set<RecommendationReasonCode>([
  'explicit_interest',
  'nearby',
  'beginner_friendly',
  'attended_similar',
  'fits_availability',
  'trusted_host',
  'fresh',
  'discovery_pick',
]);

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizeNativeRecommendationSignals(value: unknown): NativeRecommendationSignal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const eventId = typeof row.event_id === 'string' && UUID_PATTERN.test(row.event_id) ? row.event_id : null;
    if (!eventId) return [];
    const reasonCodes = Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((reason): reason is RecommendationReasonCode =>
          typeof reason === 'string' && REASON_CODES.has(reason as RecommendationReasonCode),
        )
      : [];
    return [{
      eventId,
      rankingScore: boundedNumber(row.ranking_score, 0, 200, 0),
      reasonCodes,
      distanceKm: row.distance_km === null || row.distance_km === undefined
        ? null
        : boundedNumber(row.distance_km, 0, 20_000, 0),
      attendedSimilar: row.attended_similar === true,
      availabilityMatch: row.availability_match === true,
      hostReliability: boundedNumber(row.host_reliability, 0, 1, 0.5),
      exposureShare: boundedNumber(row.exposure_share, 0, 1, 0),
      impressionCount: Math.trunc(boundedNumber(row.impression_count, 0, Number.MAX_SAFE_INTEGER, 0)),
    }];
  });
}

export async function getNativeRecommendationSignals(eventIds: string[]) {
  const uniqueIds = [...new Set(eventIds.filter((eventId) => UUID_PATTERN.test(eventId)))];
  if (uniqueIds.length === 0) return new Map<string, NativeRecommendationSignal>();

  const chunks: string[][] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    chunks.push(uniqueIds.slice(offset, offset + 100));
  }
  const rows: NativeRecommendationSignal[] = [];
  for (const candidateIds of chunks) {
    const { data, error } = await recommendationRpcClient.rpc('rank_activity_context_events', {
      p_candidate_ids: candidateIds,
      p_limit: candidateIds.length,
    });
    if (error) throw new Error('RECOMMENDATION_SIGNALS_FAILED');
    rows.push(...normalizeNativeRecommendationSignals(data));
  }
  return new Map(rows.map((row) => [row.eventId, row]));
}
