import { describe, expect, it } from 'vitest';
import {
  CURATED_EVENT_TEMPLATES,
  applyEventTemplateToDraft,
  resolveEventTemplateCategoryPath,
  type EventTemplateDraft,
} from '../eventTemplates';

function emptyDraft(): EventTemplateDraft {
  return {
    selectedCategoryId: '',
    selectedSubcategoryId: '',
    selectedActivityId: '',
    description: '',
    imageEmoji: '🎉',
    tags: '',
    locationType: 'city',
    locationCity: '',
    locationDistrict: '',
    locationAddress: '',
    locationFreeText: '',
    hasManualLocation: false,
    maxAttendees: '',
    eventTime: '',
    beginnerFriendly: 'unspecified',
    activityIntensity: '',
    equipmentRequired: '',
  };
}

describe('organizer event template integration', () => {
  it('maps every required curated template to the canonical three-level taxonomy', () => {
    expect(CURATED_EVENT_TEMPLATES).toHaveLength(7);
    for (const template of CURATED_EVENT_TEMPLATES) {
      const resolved = resolveEventTemplateCategoryPath(template.category);
      expect(resolved, template.template_name).not.toBeNull();
      expect(resolved?.categoryId).toBeTruthy();
      expect(resolved?.subcategoryId).toBeTruthy();
      expect(resolved?.activityId).toBeTruthy();
    }
  });

  it('prefills blank creation fields including premium expectation metadata', () => {
    const template = CURATED_EVENT_TEMPLATES.find((item) => item.id === 'curated-hike');
    expect(template).toBeDefined();
    const result = applyEventTemplateToDraft(emptyDraft(), template!);
    expect(result.selectedCategoryId).toBe('nature');
    expect(result.selectedSubcategoryId).toBe('hiking');
    expect(result.selectedActivityId).toBe('day-hike');
    expect(result.tags).toContain('túra');
    expect(result.equipmentRequired).toContain('cipő');
  });

  it('never overwrites manually entered organizer values', () => {
    const current: EventTemplateDraft = {
      ...emptyDraft(),
      selectedCategoryId: 'sport',
      selectedSubcategoryId: 'running-athletics',
      selectedActivityId: 'running',
      description: 'Saját leírás',
      imageEmoji: '🏃',
      tags: 'saját',
      locationCity: 'Budapest',
      hasManualLocation: true,
      maxAttendees: '12',
      eventTime: '18:30',
      beginnerFriendly: 'no',
      activityIntensity: 'magas',
      equipmentRequired: 'Saját felszerelés',
    };
    const result = applyEventTemplateToDraft(current, CURATED_EVENT_TEMPLATES[1]);
    expect(result).toEqual(current);
  });
});
