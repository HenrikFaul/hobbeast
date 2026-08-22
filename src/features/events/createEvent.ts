import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';

export interface CreateEventPlaceSelection {
  displayName: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
  source: string;
  categories: string[];
}

export type EventInsertPayload = TablesInsert<'events'> & {
  organizer_id?: string;
  start_time?: string | null;
  meeting_instructions?: string | null;
  expected_end_at?: string | null;
  beginner_friendly?: boolean | null;
  activity_intensity?: string | null;
  equipment_required?: string | null;
  accessibility_info?: string | null;
  cost_details?: string | null;
  cancellation_policy?: string | null;
  private_location_reveal_hours?: number;
};

export interface CreateEventFormSnapshot {
  userId: string;
  title: string;
  description: string;
  category: string;
  eventDate?: Date;
  eventTime: string;
  expectedEndTime: string;
  locationType: string;
  locationCity: string;
  locationDistrict: string;
  locationAddress: string;
  locationFreeText: string;
  locationLat: number | null;
  locationLon: number | null;
  maxAttendees: string;
  imageEmoji: string;
  tags: string;
  placeData: CreateEventPlaceSelection | null;
  meetingInstructions: string;
  beginnerFriendly: 'unspecified' | 'yes' | 'no';
  activityIntensity: string;
  equipmentRequired: string;
  accessibilityInfo: string;
  costDetails: string;
  cancellationPolicy: string;
  waitlistEnabled: boolean;
  visibilityType: string;
  privateLocationRevealHours: string;
}

export interface EventTimes {
  startTimeIso: string | null;
  expectedEndAt: string | null;
}

export function buildEventTimes(eventDate: Date | undefined, eventTime: string, expectedEndTime: string): EventTimes {
  if (!eventDate || !eventTime) return { startTimeIso: null, expectedEndAt: null };
  const [startHours, startMinutes] = eventTime.split(':').map(Number);
  const start = new Date(eventDate);
  start.setHours(Number.isFinite(startHours) ? startHours : 0, Number.isFinite(startMinutes) ? startMinutes : 0, 0, 0);
  if (!expectedEndTime) return { startTimeIso: start.toISOString(), expectedEndAt: null };
  const [endHours, endMinutes] = expectedEndTime.split(':').map(Number);
  const end = new Date(eventDate);
  end.setHours(Number.isFinite(endHours) ? endHours : 0, Number.isFinite(endMinutes) ? endMinutes : 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { startTimeIso: start.toISOString(), expectedEndAt: end.toISOString() };
}

export function buildEventInsertPayload(snapshot: CreateEventFormSnapshot): EventInsertPayload {
  const { startTimeIso, expectedEndAt } = buildEventTimes(
    snapshot.eventDate,
    snapshot.eventTime,
    snapshot.expectedEndTime,
  );
  return {
    title: snapshot.title.trim(),
    description: snapshot.description.trim() || null,
    category: snapshot.category,
    event_date: snapshot.eventDate ? format(snapshot.eventDate, 'yyyy-MM-dd') : null,
    event_time: snapshot.eventTime || null,
    start_time: startTimeIso,
    created_by: snapshot.userId,
    location_type: snapshot.locationType,
    location_city: snapshot.locationCity || null,
    location_district: snapshot.locationDistrict || null,
    location_address: snapshot.locationAddress || null,
    location_free_text: snapshot.locationFreeText || null,
    location_lat: snapshot.locationLat,
    location_lon: snapshot.locationLon,
    max_attendees: snapshot.maxAttendees ? Number.parseInt(snapshot.maxAttendees, 10) : null,
    image_emoji: snapshot.imageEmoji,
    tags: snapshot.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    organizer_id: snapshot.userId,
    place_name: snapshot.placeData?.displayName || null,
    place_address: snapshot.placeData?.address || null,
    place_city: snapshot.placeData?.city || null,
    place_lat: snapshot.placeData?.lat || null,
    place_lon: snapshot.placeData?.lon || null,
    place_source: snapshot.placeData?.source || null,
    place_categories: snapshot.placeData?.categories || [],
    meeting_instructions: snapshot.meetingInstructions.trim() || null,
    expected_end_at: expectedEndAt,
    beginner_friendly: snapshot.beginnerFriendly === 'unspecified' ? null : snapshot.beginnerFriendly === 'yes',
    activity_intensity: snapshot.activityIntensity || null,
    equipment_required: snapshot.equipmentRequired.trim() || null,
    accessibility_info: snapshot.accessibilityInfo.trim() || null,
    cost_details: snapshot.costDetails.trim() || null,
    cancellation_policy: snapshot.cancellationPolicy.trim() || null,
    waitlist_enabled: snapshot.waitlistEnabled,
    visibility_type: snapshot.visibilityType,
    private_location_reveal_hours: Math.max(0, Math.min(168, Number(snapshot.privateLocationRevealHours) || 24)),
  };
}

export async function createEventRecord(payload: EventInsertPayload): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert(payload)
    .select('id')
    .single();
  if (error || !data) throw new Error('CREATE_EVENT_FAILED');
  return data.id;
}
