import { describe, expect, it } from 'vitest';
import { adminQueryKeys } from '@/features/admin';
import { eventQueryKeys } from '@/features/events';
import { notificationQueryKeys } from '@/features/notifications';
import { organizerQueryKeys } from '@/features/organizer';
import { placeQueryKeys } from '@/features/places';

describe('domain query-key contracts', () => {
  it('keeps event detail and participant invalidation scoped to one event', () => {
    expect(eventQueryKeys.detail('event-1')).toEqual(['events', 'detail', 'event-1']);
    expect(eventQueryKeys.participants('event-1')).toEqual(['events', 'detail', 'event-1', 'participants']);
  });

  it('keeps organizer, notification and admin ownership in separate namespaces', () => {
    expect(organizerQueryKeys.participants('event-1')[0]).toBe('organizer');
    expect(notificationQueryKeys.inbox('user-1')[0]).toBe('notifications');
    expect(adminQueryKeys.hubs()[0]).toBe('admin');
  });

  it('normalizes only the textual place query while preserving provider ownership', () => {
    expect(placeQueryKeys.search('  TÚRA  ', 'db:pois')).toEqual([
      'places', 'search', 'túra', 'db:pois', null,
    ]);
  });
});
