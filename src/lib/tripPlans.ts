import { supabase } from '@/integrations/supabase/client';
import type { TripPlanDraft } from '@/lib/mapy';

export async function upsertEventTripPlan(eventId: string, plan: TripPlanDraft | null) {
  if (!plan) {
    await supabase.from('event_trip_plans').delete().eq('event_id', eventId);
    return;
  }

  const payload = {
    event_id: eventId,
    provider: plan.provider,
    route_type: plan.routeType,
    start_point: plan.start,
    end_point: plan.end,
    waypoints: plan.waypoints,
    length_m: plan.lengthM ? Math.round(plan.lengthM) : null,
    duration_s: plan.durationS ? Math.round(plan.durationS) : null,
    geometry: plan.geometry as any,
    warnings: plan.warnings as any,
    external_url: plan.externalUrl ?? null,
    elevation_profile: plan.elevationProfile as any,
    elevation_summary: plan.elevationSummary as any,
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
    start: data.start_point as TripPlanDraft['start'],
    end: data.end_point as TripPlanDraft['end'],
    waypoints: Array.isArray(data.waypoints) ? (data.waypoints as TripPlanDraft['waypoints']) : [],
    lengthM: data.length_m,
    durationS: data.duration_s,
    geometry: data.geometry,
    warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
    externalUrl: data.external_url,
    elevationProfile: Array.isArray(data.elevation_profile) ? (data.elevation_profile as TripPlanDraft['elevationProfile']) : null,
    elevationSummary: (data.elevation_summary as TripPlanDraft['elevationSummary']) ?? null,
  };
}
