import { supabase } from '@/integrations/supabase/client';
import { ORGANIZER_EVENT_TEMPLATES } from '@/lib/organizerProduction';

export interface EventTemplateContract {
  id: string;
  template_name: string;
  category: string;
  description: string | null;
  image_emoji: string | null;
  tags: string[] | null;
  location_type: string | null;
  location_city: string | null;
  location_district: string | null;
  location_address: string | null;
  location_free_text: string | null;
  max_attendees: number | null;
  event_time: string | null;
  beginner_friendly?: boolean | null;
  activity_intensity?: string | null;
  equipment_required?: string | null;
}

export interface SaveEventTemplateInput {
  userId: string;
  templateName: string;
  category: string;
  description: string | null;
  imageEmoji: string;
  tags: string[];
  locationType: string;
  locationCity: string | null;
  locationDistrict: string | null;
  locationAddress: string | null;
  locationFreeText: string | null;
  maxAttendees: number | null;
  eventTime: string | null;
}

export const CURATED_EVENT_TEMPLATES: EventTemplateContract[] = ORGANIZER_EVENT_TEMPLATES.map((template) => ({
  id: `curated-${template.id}`,
  template_name: template.label,
  category: template.values.category,
  description: null,
  image_emoji: null,
  tags: template.values.tags,
  location_type: null,
  location_city: null,
  location_district: null,
  location_address: null,
  location_free_text: null,
  max_attendees: null,
  event_time: null,
  beginner_friendly: template.values.beginnerFriendly ?? null,
  activity_intensity: template.values.activityIntensity ?? null,
  equipment_required: template.values.equipmentRequired ?? null,
}));

export async function loadOwnedEventTemplates(userId: string): Promise<EventTemplateContract[]> {
  const { data, error } = await supabase
    .from('event_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('EVENT_TEMPLATE_LIST_FAILED');
  return data || [];
}

export async function deleteOwnedEventTemplate(userId: string, templateId: string): Promise<void> {
  const { error } = await supabase
    .from('event_templates')
    .delete()
    .eq('user_id', userId)
    .eq('id', templateId);
  if (error) throw new Error('EVENT_TEMPLATE_DELETE_FAILED');
}

export async function saveOwnedEventTemplate(input: SaveEventTemplateInput): Promise<void> {
  const { error } = await supabase.from('event_templates').insert({
    user_id: input.userId,
    template_name: input.templateName,
    category: input.category,
    description: input.description,
    image_emoji: input.imageEmoji,
    tags: input.tags,
    location_type: input.locationType,
    location_city: input.locationCity,
    location_district: input.locationDistrict,
    location_address: input.locationAddress,
    location_free_text: input.locationFreeText,
    max_attendees: input.maxAttendees,
    event_time: input.eventTime,
  });
  if (error) throw new Error('EVENT_TEMPLATE_SAVE_FAILED');
}
