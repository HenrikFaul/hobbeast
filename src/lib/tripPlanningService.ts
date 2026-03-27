import {
  enrichMapyElevation,
  geocodeMapyLocation,
  planMapyRoute,
  reverseGeocodeMapyPoint,
  suggestMapyLocations,
  type MapySuggestion,
  type TripPlanDraft,
  type TripPlanPoint,
} from '@/lib/mapy';
import {
  aiTripPlanningRequestSchema,
  buildFailureResponse,
  type AITripPlanningRequest,
  type AITripPlanningResponse,
  type LocationCandidate,
  type LocationRef,
  type UnresolvedLocationRef,
  isResolvedLocationRef,
} from '@/lib/tripPlanningSchema';
import { evaluateQuotaPolicy, type TripPlanningQuotaPolicy, type TripPlanningQuotaSnapshot } from '@/lib/tripPlanningAudit';

function toTripPlanPoint(location: LocationRef): TripPlanPoint {
  return {
    label: location.label,
    lat: location.lat,
    lon: location.lon,
    type: location.type,
    providerId: location.providerId ?? null,
    location: location.location ?? null,
    region: location.region ?? null,
    country: location.country ?? null,
  };
}

function toCandidate(item: MapySuggestion, rank: number): LocationCandidate {
  return {
    label: item.label,
    lat: item.lat,
    lon: item.lon,
    type: item.type,
    providerId: item.providerId ?? undefined,
    location: item.location ?? undefined,
    region: item.region ?? undefined,
    country: item.country ?? undefined,
    confidence: Math.max(0.1, 1 - rank * 0.15),
  };
}

async function resolveLocation(input: LocationRef | UnresolvedLocationRef): Promise<
  | { status: 'resolved'; resolved: LocationRef }
  | { status: 'needs_clarification'; candidates: LocationCandidate[] }
  | { status: 'no_result' }
> {
  if (isResolvedLocationRef(input)) return { status: 'resolved', resolved: input };

  const candidates = await geocodeMapyLocation(input.inputText).catch(() => []);
  if (candidates.length === 0) return { status: 'no_result' };
  if (candidates.length === 1) return { status: 'resolved', resolved: toCandidate(candidates[0], 0) };

  return { status: 'needs_clarification', candidates: candidates.slice(0, 5).map(toCandidate) };
}

export async function suggestLocation(query: string) {
  return suggestMapyLocations(query);
}

export async function geocodeLocation(query: string) {
  return geocodeMapyLocation(query);
}

export async function reverseGeocodePoint(lat: number, lon: number) {
  return reverseGeocodeMapyPoint(lat, lon);
}

export async function planTripFromRequest(
  input: AITripPlanningRequest,
  options?: { quotaPolicy?: TripPlanningQuotaPolicy; quotaSnapshot?: TripPlanningQuotaSnapshot; correlationId?: string },
): Promise<AITripPlanningResponse> {
  if (options?.quotaPolicy && options?.quotaSnapshot) {
    const decision = evaluateQuotaPolicy(options.quotaPolicy, options.quotaSnapshot);
    if (!decision.allowed) {
      return buildFailureResponse('RATE_LIMITED', `Trip planning kvóta elérve: ${decision.reason}`, options.correlationId);
    }
  }

  const parsed = aiTripPlanningRequestSchema.safeParse(input);
  if (!parsed.success) {
    return buildFailureResponse('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '), options?.correlationId);
  }

  const request = parsed.data;
  const unresolvedItems: NonNullable<AITripPlanningResponse['unresolvedItems']> = [];

  const startResolved = await resolveLocation(request.start);
  if (startResolved.status === 'needs_clarification') {
    unresolvedItems.push({ field: 'start', reason: 'ambiguous_location', candidates: startResolved.candidates });
  } else if (startResolved.status === 'no_result') {
    unresolvedItems.push({ field: 'start', reason: 'no_result' });
  }

  const endResolved = await resolveLocation(request.end);
  if (endResolved.status === 'needs_clarification') {
    unresolvedItems.push({ field: 'end', reason: 'ambiguous_location', candidates: endResolved.candidates });
  } else if (endResolved.status === 'no_result') {
    unresolvedItems.push({ field: 'end', reason: 'no_result' });
  }

  const resolvedWaypoints: LocationRef[] = [];
  for (const waypoint of request.waypoints ?? []) {
    const resolvedWaypoint = await resolveLocation(waypoint);
    if (resolvedWaypoint.status === 'resolved') {
      resolvedWaypoints.push(resolvedWaypoint.resolved);
    } else {
      unresolvedItems.push({
        field: 'waypoint',
        reason: resolvedWaypoint.status === 'needs_clarification' ? 'ambiguous_location' : 'no_result',
        candidates: resolvedWaypoint.status === 'needs_clarification' ? resolvedWaypoint.candidates : undefined,
      });
    }
  }

  if (unresolvedItems.length > 0 || startResolved.status !== 'resolved' || endResolved.status !== 'resolved') {
    return {
      schemaVersion: '1.0',
      status: 'needs_clarification',
      unresolvedItems,
      warnings: ['Legalább egy helyszín tisztázásra szorul a route generálás előtt.'],
      diagnostics: { provider: 'mapy', degraded: false, correlationId: options?.correlationId },
    };
  }

  try {
    const route = await planMapyRoute({
      routeType: request.routeType,
      start: toTripPlanPoint(startResolved.resolved),
      end: toTripPlanPoint(endResolved.resolved),
      waypoints: resolvedWaypoints.map(toTripPlanPoint),
      avoidHighways: request.constraints?.avoidHighways,
      avoidToll: request.constraints?.avoidToll,
    });

    return {
      schemaVersion: '1.0',
      status: 'success',
      resolvedRoute: route,
      diagnostics: { provider: 'mapy', degraded: false, correlationId: options?.correlationId },
    };
  } catch (error) {
    return buildFailureResponse('PROVIDER_FAILURE', (error as Error).message || 'Nem sikerült útvonalat számolni.', options?.correlationId);
  }
}

export async function enrichTripElevation(plan: TripPlanDraft): Promise<TripPlanDraft> {
  return enrichMapyElevation(plan);
}
