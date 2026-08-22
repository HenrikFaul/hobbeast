import { supabase } from '@/integrations/supabase/client';

export interface CircleVenueSearchContext {
  available: boolean;
  privacyMode: 'coarse_k_anonymous';
  threshold: 3;
  contributorCount: number;
  center: { lat: number; lon: number } | null;
  city: string | null;
  maxTravelDistanceKm: number;
  reason: 'feature_disabled' | 'privacy_threshold_not_met' | null;
  reasonCodes: Array<'explicit_location_consent' | 'coarse_group_center' | 'balanced_travel'>;
}

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

const planningRpcClient = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizeCircleVenueSearchContext(value: unknown): CircleVenueSearchContext {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const centerRow = row.center && typeof row.center === 'object' && !Array.isArray(row.center)
    ? row.center as Record<string, unknown>
    : null;
  const lat = centerRow ? Number(centerRow.lat) : Number.NaN;
  const lon = centerRow ? Number(centerRow.lon) : Number.NaN;
  const contributorCount = Math.trunc(boundedNumber(row.contributor_count, 0, 500, 0));
  const hasSafeCenter = Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  const available = row.available === true && contributorCount >= 3 && hasSafeCenter;
  const allowedReasonCodes = new Set(['explicit_location_consent', 'coarse_group_center', 'balanced_travel']);
  return {
    available,
    privacyMode: 'coarse_k_anonymous',
    threshold: 3,
    contributorCount: available ? contributorCount : 0,
    center: available ? { lat, lon } : null,
    city: available && typeof row.city === 'string' && row.city.trim() ? row.city.trim().slice(0, 120) : null,
    maxTravelDistanceKm: available ? boundedNumber(row.max_travel_distance_km, 5, 100, 25) : 25,
    reason: row.reason === 'feature_disabled' || row.reason === 'privacy_threshold_not_met' ? row.reason : null,
    reasonCodes: Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((reason): reason is CircleVenueSearchContext['reasonCodes'][number] =>
          typeof reason === 'string' && allowedReasonCodes.has(reason),
        )
      : [],
  };
}

export async function getCircleVenueSearchContext(circleId: string) {
  const { data, error } = await planningRpcClient.rpc('get_circle_venue_search_context', {
    p_circle_id: circleId,
  });
  if (error) throw new Error('CIRCLE_VENUE_CONTEXT_FAILED');
  return normalizeCircleVenueSearchContext(data);
}

export async function linkEventToCircle(circleId: string, eventId: string) {
  const { data, error } = await planningRpcClient.rpc('link_event_to_my_circle', {
    p_circle_id: circleId,
    p_event_id: eventId,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error('CIRCLE_EVENT_LINK_FAILED');
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as { event_id?: string; replayed?: boolean }
    : null;
}
