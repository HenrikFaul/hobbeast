import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import {
  buildEventInsertPayload,
  buildEventTimes,
  createEventRecord,
  type CreateEventFormSnapshot,
} from '../createEvent';

const snapshot: CreateEventFormSnapshot = {
  userId: 'user-1',
  title: '  Esti túra  ',
  description: ' Leírás ',
  category: 'Természet & Túra › Túrázás › Napi túra',
  eventDate: new Date('2026-09-10T00:00:00'),
  eventTime: '22:00',
  expectedEndTime: '01:00',
  locationType: 'address',
  locationCity: 'Budapest',
  locationDistrict: '',
  locationAddress: 'Normafa',
  locationFreeText: '',
  locationLat: 47.5,
  locationLon: 19.0,
  maxAttendees: '12',
  imageEmoji: '🥾',
  tags: 'Kezdő, esti',
  placeData: null,
  meetingInstructions: ' A kapunál ',
  beginnerFriendly: 'yes',
  activityIntensity: 'könnyű',
  equipmentRequired: '',
  accessibilityInfo: '',
  costDetails: 'Ingyenes',
  cancellationPolicy: '',
  waitlistEnabled: true,
  visibilityType: 'private',
  privateLocationRevealHours: '999',
};

describe('create event domain boundary', () => {
  beforeEach(() => mocks.from.mockReset());

  it('handles overnight expected-end times deterministically', () => {
    const times = buildEventTimes(snapshot.eventDate, '22:00', '01:00');
    expect(times.startTimeIso).toBeTruthy();
    expect(new Date(times.expectedEndAt!).getTime()).toBeGreaterThan(new Date(times.startTimeIso!).getTime());
  });

  it('normalizes the insert contract without changing event semantics', () => {
    const payload = buildEventInsertPayload(snapshot);
    expect(payload.title).toBe('Esti túra');
    expect(payload.tags).toEqual(['Kezdő', 'esti']);
    expect(payload.beginner_friendly).toBe(true);
    expect(payload.private_location_reveal_hours).toBe(168);
    expect(payload.created_by).toBe('user-1');
  });

  it('returns the server-owned lifecycle state with the created ID', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'event-1',
        outcome_status: 'draft',
        is_active: false,
        organizer_readiness_required: true,
      },
      error: null,
    });
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({ single }) }) });
    await expect(createEventRecord(buildEventInsertPayload(snapshot))).resolves.toEqual({
      id: 'event-1',
      outcomeStatus: 'draft',
      isActive: false,
      organizerReadinessRequired: true,
    });
    expect(mocks.from).toHaveBeenCalledWith('events');
  });

  it('maps database failures to a stable code', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'raw detail' } });
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({ single }) }) });
    await expect(createEventRecord(buildEventInsertPayload(snapshot))).rejects.toThrow('CREATE_EVENT_FAILED');
  });
});
