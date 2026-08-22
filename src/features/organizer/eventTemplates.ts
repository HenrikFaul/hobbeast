import { supabase } from '@/integrations/supabase/client';
import { ORGANIZER_EVENT_TEMPLATES } from '@/lib/organizerProduction';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';

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

export interface EventTemplateDraft {
  selectedCategoryId: string;
  selectedSubcategoryId: string;
  selectedActivityId: string;
  description: string;
  imageEmoji: string;
  tags: string;
  locationType: string;
  locationCity: string;
  locationDistrict: string;
  locationAddress: string;
  locationFreeText: string;
  hasManualLocation: boolean;
  maxAttendees: string;
  eventTime: string;
  beginnerFriendly: 'unspecified' | 'yes' | 'no';
  activityIntensity: string;
  equipmentRequired: string;
}

export function resolveEventTemplateCategoryPath(categoryPath: string) {
  const [categoryName, subcategoryName, activityName] = categoryPath.split(' › ');
  const category = HOBBY_CATALOG.find((item) => item.name === categoryName);
  const subcategory = category?.subcategories.find((item) => item.name === subcategoryName);
  const activity = subcategory?.activities.find((item) => item.name === activityName);
  if (!category || !subcategory) return null;
  return {
    categoryId: category.id,
    subcategoryId: subcategory.id,
    activityId: activity?.id ?? '',
  };
}

export function applyEventTemplateToDraft(
  current: EventTemplateDraft,
  template: EventTemplateContract,
): EventTemplateDraft {
  const next = { ...current };
  if (!current.selectedCategoryId && !current.selectedSubcategoryId && !current.selectedActivityId) {
    const resolved = resolveEventTemplateCategoryPath(template.category);
    if (resolved) {
      next.selectedCategoryId = resolved.categoryId;
      next.selectedSubcategoryId = resolved.subcategoryId;
      next.selectedActivityId = resolved.activityId;
    }
  }
  if (!current.description.trim() && template.description) next.description = template.description;
  if ((!current.imageEmoji || current.imageEmoji === '🎉') && template.image_emoji) next.imageEmoji = template.image_emoji;
  if (!current.tags.trim() && template.tags?.length) next.tags = template.tags.join(', ');
  if (!current.hasManualLocation) {
    next.locationType = template.location_type || current.locationType;
    next.locationCity = template.location_city || current.locationCity;
    next.locationDistrict = template.location_district || current.locationDistrict;
    next.locationAddress = template.location_address || current.locationAddress;
    next.locationFreeText = template.location_free_text || current.locationFreeText;
  }
  if (!current.maxAttendees && template.max_attendees) next.maxAttendees = String(template.max_attendees);
  if (!current.eventTime && template.event_time) next.eventTime = template.event_time;
  if (current.beginnerFriendly === 'unspecified' && template.beginner_friendly !== null && template.beginner_friendly !== undefined) {
    next.beginnerFriendly = template.beginner_friendly ? 'yes' : 'no';
  }
  if (!current.activityIntensity && template.activity_intensity) next.activityIntensity = template.activity_intensity;
  if (!current.equipmentRequired && template.equipment_required) next.equipmentRequired = template.equipment_required;
  return next;
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
