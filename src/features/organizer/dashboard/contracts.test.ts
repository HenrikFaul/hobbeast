import { describe, expect, it } from 'vitest';
import type { OrganizerEventSummary, OrganizerParticipant, ParticipationStatus } from '@/lib/organizer';
import {
  filterOrganizerCheckInCandidates,
  getParticipationStatusBadgeVariant,
  getParticipationStatusLabel,
  MESSAGE_AUDIENCES,
  MESSAGE_TYPES,
  ORGANIZER_DASHBOARD_TABS,
  PARTICIPATION_FILTERS,
  selectOwnedOrganizerEventId,
} from './contracts';

function participant(id: string, status: ParticipationStatus, name: string, inviteCode: string): OrganizerParticipant {
  return {
    id,
    event_id: 'event-1',
    user_id: `user-${id}`,
    joined_at: '2026-08-01T12:00:00.000Z',
    status,
    checked_in_at: null,
    organizer_note: null,
    invite_code: inviteCode,
    arriving_alone: null,
    first_hobbeast_event: null,
    arrival_visibility: 'host_only',
    profiles: { display_name: name, avatar_url: null, city: 'Budapest' },
  };
}

function event(id: string): OrganizerEventSummary {
  return {
    id,
    title: id,
    description: null,
    event_date: null,
    event_time: null,
    location_city: null,
    category: 'other',
    image_emoji: null,
    max_attendees: null,
    waitlist_enabled: null,
    outcome_status: null,
    meeting_instructions: null,
    cancellation_policy: null,
    accessibility_info: null,
    host_responsibility_accepted_at: null,
    participantCount: 0,
    goingCount: 0,
    waitlistCount: 0,
    checkedInCount: 0,
  };
}

describe('organizer dashboard feature contracts', () => {
  it('locks the route tab, participant, audience and message option order', () => {
    expect(ORGANIZER_DASHBOARD_TABS.map(({ value, label }) => `${value}:${label}`)).toEqual([
      'events:My events',
      'attendees:Attendees',
      'checkin:Check-in',
      'messages:Messages',
      'analytics:Analytics',
      'settings:Settings',
    ]);
    expect(PARTICIPATION_FILTERS.map(({ value, label }) => `${value}:${label}`)).toEqual([
      'all:Összes',
      'interested:Érdeklődik',
      'going:Megy',
      'waitlist:Várólista',
      'checked_in:Bejelentkezett',
      'completed:Teljesített részvétel',
      'cancelled:Lemondta',
      'no_show:No-show',
    ]);
    expect(MESSAGE_AUDIENCES.map(({ value }) => value)).toEqual(['all', 'going', 'waitlist', 'checked_in', 'selected']);
    expect(MESSAGE_TYPES.map(({ value }) => value)).toEqual(['reminder', 'logistics_update', 'event_update', 'cancellation', 'custom_message']);
  });

  it('keeps the existing status labels and badge variants', () => {
    expect(getParticipationStatusLabel('completed')).toBe('Teljesített részvétel');
    expect(getParticipationStatusBadgeVariant('going')).toBe('default');
    expect(getParticipationStatusBadgeVariant('checked_in')).toBe('secondary');
    expect(getParticipationStatusBadgeVariant('waitlist')).toBe('outline');
    expect(getParticipationStatusBadgeVariant('cancelled')).toBe('destructive');
    expect(getParticipationStatusBadgeVariant('no_show')).toBe('destructive');
    expect(getParticipationStatusBadgeVariant('completed')).toBe('outline');
  });

  it('preserves requested event selection with first-owned fallback', () => {
    const events = [event('event-1'), event('event-2')];
    expect(selectOwnedOrganizerEventId(events, 'event-2')).toBe('event-2');
    expect(selectOwnedOrganizerEventId(events, 'foreign-event')).toBe('event-1');
    expect(selectOwnedOrganizerEventId([], 'event-2')).toBe('');
  });

  it('keeps check-in default eligibility and case-insensitive search behavior', () => {
    const rows = [
      participant('1', 'going', 'Ada Lovelace', 'GO123'),
      participant('2', 'checked_in', 'Grace Hopper', 'IN456'),
      participant('3', 'waitlist', 'Alan Turing', 'WAIT7'),
      participant('4', 'cancelled', 'Katherine Johnson', 'STOP9'),
    ];

    expect(filterOrganizerCheckInCandidates(rows, '', '').map(({ id }) => id)).toEqual(['1', '2', '3']);
    expect(filterOrganizerCheckInCandidates(rows, 'KATHERINE', '').map(({ id }) => id)).toEqual(['4']);
    expect(filterOrganizerCheckInCandidates(rows, 'nobody', 'stop').map(({ id }) => id)).toEqual(['4']);
  });
});

