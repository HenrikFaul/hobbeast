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
import { persistTripPlanningAudit } from '@/lib/tripPlanningAuditRepo';

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
  const startedAt = new Date().toISOString();
  const requestId = crypto.randomUUID();
  if (options?.quotaPolicy && options?.quotaSnapshot) {
    const decision = evaluateQuotaPolicy(options.quotaPolicy, options.quotaSnapshot);
    if (!decision.allowed) {
      const response = buildFailureResponse('RATE_LIMITED', `Trip planning kvóta elérve: ${decision.reason}`, options?.correlationId);
      void persistTripPlanningAudit({
        requestId,
        callerType: input.callerContext?.source === 'automation' ? 'automation' : input.callerContext?.source === 'ai_agent' ? 'ai_agent' : 'ui',
        callerId: input.callerContext?.userId,
        eventId: input.callerContext?.eventId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'rate_limited',
        routeType: input.routeType,
        provider: 'mapy',
        requestSummary: { hasWaypoints: Boolean(input.waypoints?.length), waypointCount: input.waypoints?.length || 0, hasConstraints: Boolean(input.constraints) },
        errorCode: decision.reason,
        correlationId: options?.correlationId,
      }).catch(() => null);
      return response;
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
    const response = {
      schemaVersion: '1.0' as const,
      status: 'needs_clarification' as const,
      unresolvedItems,
      warnings: ['Legalább egy helyszín tisztázásra szorul a route generálás előtt.'],
      diagnostics: { provider: 'mapy' as const, degraded: false, correlationId: options?.correlationId },
    };
    void persistTripPlanningAudit({
      requestId,
      callerType: request.callerContext?.source === 'automation' ? 'automation' : request.callerContext?.source === 'ai_agent' ? 'ai_agent' : 'ui',
      callerId: request.callerContext?.userId,
      eventId: request.callerContext?.eventId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'needs_clarification',
      routeType: request.routeType,
      provider: 'mapy',
      requestSummary: { hasWaypoints: Boolean(request.waypoints?.length), waypointCount: request.waypoints?.length || 0, hasConstraints: Boolean(request.constraints) },
      warnings: response.warnings,
      correlationId: options?.correlationId,
    }).catch(() => null);
    return response;
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

    const response = {
      schemaVersion: '1.0',
      status: 'success',
      resolvedRoute: route,
      alternativeProposals: [
        {
          id: `primary-${request.routeType}`,
          title: 'Elsődleges Mapy útvonal',
          routeType: request.routeType,
          summary: 'A kiválasztott pontok alapján generált útvonalterv.',
          estimatedLengthM: route.lengthM,
          estimatedDurationS: route.durationS,
          points: [route.start, ...route.waypoints, route.end].map((point) => ({ label: point.label, lat: point.lat, lon: point.lon })),
          warnings: route.warnings,
        },
      ],
      diagnostics: { provider: 'mapy', degraded: false, correlationId: options?.correlationId },
    } as AITripPlanningResponse;
    void persistTripPlanningAudit({
      requestId,
      callerType: request.callerContext?.source === 'automation' ? 'automation' : request.callerContext?.source === 'ai_agent' ? 'ai_agent' : 'ui',
      callerId: request.callerContext?.userId,
      eventId: request.callerContext?.eventId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'success',
      routeType: request.routeType,
      provider: 'mapy',
      requestSummary: { hasWaypoints: Boolean(request.waypoints?.length), waypointCount: request.waypoints?.length || 0, hasConstraints: Boolean(request.constraints) },
      chosenAlternativeId: `primary-${request.routeType}`,
      warnings: route.warnings,
      correlationId: options?.correlationId,
    }).catch(() => null);
    return response;
  } catch (error) {
    const response = buildFailureResponse('PROVIDER_FAILURE', (error as Error).message || 'Nem sikerült útvonalat számolni.', options?.correlationId);
    void persistTripPlanningAudit({
      requestId,
      callerType: request.callerContext?.source === 'automation' ? 'automation' : request.callerContext?.source === 'ai_agent' ? 'ai_agent' : 'ui',
      callerId: request.callerContext?.userId,
      eventId: request.callerContext?.eventId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'failure',
      routeType: request.routeType,
      provider: 'mapy',
      requestSummary: { hasWaypoints: Boolean(request.waypoints?.length), waypointCount: request.waypoints?.length || 0, hasConstraints: Boolean(request.constraints) },
      errorCode: response.error?.code,
      correlationId: options?.correlationId,
    }).catch(() => null);
    return response;
  }
}

export async function enrichTripElevation(plan: TripPlanDraft): Promise<TripPlanDraft> {
  return enrichMapyElevation(plan);
}
