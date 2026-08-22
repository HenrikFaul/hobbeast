import { describe, expect, it } from 'vitest';
import {
  ORGANIZER_EVENT_TEMPLATES,
  applyOrganizerTemplate,
  calculateHostReliability,
  validateBulkParticipantTransition,
} from '@/lib/organizerProduction';

describe('organizer production contracts', () => {
  it('provides all seven required recurring format templates', () => {
    expect(ORGANIZER_EVENT_TEMPLATES.map((template) => template.id)).toEqual([
      'walk', 'hike', 'board_games', 'workshop', 'sport', 'tech_meetup', 'gastronomy',
    ]);
  });

  it('prefills blank values but never overwrites manual organizer input', () => {
    const template = ORGANIZER_EVENT_TEMPLATES[0];
    const result = applyOrganizerTemplate({ category: 'Saját kategória', tags: [] as string[], beginnerFriendly: false }, template);
    expect(result.category).toBe('Saját kategória');
    expect(result.tags).toEqual(template.values.tags);
    expect(result.beginnerFriendly).toBe(false);
  });

  it('allows only state-machine-safe bulk transitions', () => {
    expect(validateBulkParticipantTransition(['waitlist', 'waitlist'], 'going').allowed).toBe(true);
    expect(validateBulkParticipantTransition(['going', 'checked_in'], 'no_show')).toEqual({ allowed: false, invalidStatuses: ['checked_in'] });
  });

  it('calculates explainable internal reliability ratios', () => {
    const result = calculateHostReliability({
      publishedEvents: 10,
      completedEvents: 8,
      cancelledEvents: 2,
      expectedAttendees: 100,
      attendedParticipants: 75,
      noShowParticipants: 10,
      repeatParticipants: 30,
      reportCount: 1,
      medianResponseHours: 2,
    });
    expect(result.publishToCompletionRate).toBe(0.8);
    expect(result.attendanceRate).toBe(0.75);
    expect(result.explanations.join(' ')).toContain('nem automatikus büntetés');
  });

  it('uses null rather than invented percentages when evidence is absent', () => {
    const result = calculateHostReliability({
      publishedEvents: 0, completedEvents: 0, cancelledEvents: 0, expectedAttendees: 0,
      attendedParticipants: 0, noShowParticipants: 0, repeatParticipants: 0, reportCount: 0,
    });
    expect(result.publishToCompletionRate).toBeNull();
    expect(result.attendanceRate).toBeNull();
  });
});
