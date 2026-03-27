import { z } from 'zod';
import type { MapyRouteType } from '@/lib/mapy';

export const routeTypeValues = [
  'foot_hiking',
  'foot_fast',
  'bike_road',
  'bike_mountain',
  'car_fast',
  'car_short',
] as const satisfies readonly MapyRouteType[];

export const locationRefSchema = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  type: z.enum(['address', 'poi', 'city', 'district', 'street', 'coordinate', 'unknown']).optional(),
  providerId: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export const locationCandidateSchema = locationRefSchema.extend({
  confidence: z.number().min(0).max(1).optional(),
});

export const unresolvedLocationRefSchema = z.object({
  inputText: z.string().min(1),
  source: z.enum(['typed_text', 'ai_generated', 'map_click', 'imported']).optional(),
});

export const tripPlanningConstraintSchema = z.object({
  avoidToll: z.boolean().optional(),
  avoidHighways: z.boolean().optional(),
  maxDistanceM: z.number().positive().optional(),
  maxDurationS: z.number().positive().optional(),
  requireLoop: z.boolean().optional(),
  preferScenic: z.boolean().optional(),
  preferEasyTerrain: z.boolean().optional(),
});

export const aiTripPlanningRequestSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  routeType: z.enum(routeTypeValues),
  start: z.union([locationRefSchema, unresolvedLocationRefSchema]),
  end: z.union([locationRefSchema, unresolvedLocationRefSchema]),
  waypoints: z.array(z.union([locationRefSchema, unresolvedLocationRefSchema])).optional().default([]),
  constraints: tripPlanningConstraintSchema.optional(),
  departureAt: z.string().datetime().optional(),
  callerContext: z.object({
    source: z.enum(['ui', 'automation', 'ai_agent']).default('ui'),
    eventId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
  }).optional(),
});

export const aiTripPlanningErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'AMBIGUOUS_LOCATION',
  'NO_RESULT',
  'PROVIDER_FAILURE',
  'NO_ROUTE_FOUND',
  'RATE_LIMITED',
  'PARTIAL_SUCCESS',
]);

export const clarificationItemSchema = z.object({
  field: z.enum(['start', 'end', 'waypoint']),
  reason: z.enum(['ambiguous_location', 'no_result', 'invalid_constraint']),
  candidates: z.array(locationCandidateSchema).optional(),
});

export const aiTripPlanningResponseSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  status: z.enum(['success', 'needs_clarification', 'partial_success', 'failure']),
  resolvedRoute: z.any().optional(),
  unresolvedItems: z.array(clarificationItemSchema).optional(),
  warnings: z.array(z.string()).optional(),
  diagnostics: z.object({
    provider: z.literal('mapy').optional(),
    degraded: z.boolean().optional(),
    correlationId: z.string().optional(),
  }).optional(),
  error: z.object({
    code: aiTripPlanningErrorCodeSchema,
    message: z.string(),
  }).optional(),
});

export type LocationRef = z.infer<typeof locationRefSchema>;
export type LocationCandidate = z.infer<typeof locationCandidateSchema>;
export type UnresolvedLocationRef = z.infer<typeof unresolvedLocationRefSchema>;
export type TripPlanningConstraintSet = z.infer<typeof tripPlanningConstraintSchema>;
export type AITripPlanningRequest = z.infer<typeof aiTripPlanningRequestSchema>;
export type AITripPlanningResponse = z.infer<typeof aiTripPlanningResponseSchema>;
export type AITripPlanningErrorCode = z.infer<typeof aiTripPlanningErrorCodeSchema>;

export function isResolvedLocationRef(value: unknown): value is LocationRef {
  return locationRefSchema.safeParse(value).success;
}

export function buildFailureResponse(code: AITripPlanningErrorCode, message: string, correlationId?: string): AITripPlanningResponse {
  return {
    schemaVersion: '1.0',
    status: 'failure',
    error: { code, message },
    diagnostics: { provider: 'mapy', degraded: false, correlationId },
  };
}
