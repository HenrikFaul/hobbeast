import { supabase } from '@/integrations/supabase/client';
import type { TripPlanDraft } from '@/lib/mapy';
import type { Json, TablesInsert } from '@/integrations/supabase/types';

export async function upsertEventTripPlan(eventId: string, plan: TripPlanDraft | null) {
  if (!plan) {
    await supabase.from('event_trip_plans').delete().eq('event_id', eventId);
    return;
  }

  const payload: TablesInsert<'event_trip_plans'> = {
    event_id: eventId,
    provider: plan.provider,
    route_type: plan.routeType,
    start_point: plan.start as unknown as Json,
    end_point: plan.end as unknown as Json,
    waypoints: plan.waypoints as unknown as Json,
    length_m: plan.lengthM ? Math.round(plan.lengthM) : null,
    duration_s: plan.durationS ? Math.round(plan.durationS) : null,
    geometry: plan.geometry as Json,
    warnings: plan.warnings as Json,
    external_url: plan.externalUrl ?? null,
    elevation_profile: plan.elevationProfile as unknown as Json,
    elevation_summary: plan.elevationSummary as unknown as Json,
  };

  const { error } = await supabase.from('event_trip_plans').upsert(payload, { onConflict: 'event_id' });
  if (error) throw error;
}

export async function getEventTripPlan(eventId: string): Promise<TripPlanDraft | null> {
  const { data, error } = await supabase.from('event_trip_plans').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    provider: 'mapy',
    routeType: data.route_type as TripPlanDraft['routeType'],
    start: data.start_point as unknown as TripPlanDraft['start'],
    end: data.end_point as unknown as TripPlanDraft['end'],
    waypoints: Array.isArray(data.waypoints) ? (data.waypoints as unknown as TripPlanDraft['waypoints']) : [],
    lengthM: data.length_m,
    durationS: data.duration_s,
    geometry: data.geometry,
    warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
    externalUrl: data.external_url,
    elevationProfile: Array.isArray(data.elevation_profile) ? (data.elevation_profile as unknown as TripPlanDraft['elevationProfile']) : null,
    elevationSummary: (data.elevation_summary as unknown as TripPlanDraft['elevationSummary']) ?? null,
  };
}
