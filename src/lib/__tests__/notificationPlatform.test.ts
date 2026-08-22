import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  buildNotificationDedupeKey,
  evaluateNotificationDelivery,
  groupNotifications,
  isNotificationType,
  isWithinQuietHours,
  mergeRealtimeNotification,
  resolveNotificationDeepLink,
  sanitizeNotificationDeepLink,
  type DeliveryGuardContext,
  type NotificationRecord,
} from '@/lib/notificationPlatform';

const baseContext: DeliveryGuardContext = {
  channel: 'in_app',
  recipientOrigin: 'real',
  duplicateExists: false,
  relationshipBlocked: false,
  targetActive: true,
  expired: false,
  recentNonCriticalCount: 0,
  localMinuteOfDay: 12 * 60,
};

function notification(id: string, createdAt: string): NotificationRecord {
  return {
    id,
    user_id: 'user-1',
    type: 'event_invite',
    title: `Notification ${id}`,
    body: null,
    data: {},
    is_read: false,
    created_at: createdAt,
  };
}

describe('notification taxonomy and links', () => {
  it('recognizes the canonical taxonomy', () => {
    expect(isNotificationType('waitlist_promoted')).toBe(true);
    expect(isNotificationType('made_up_type')).toBe(false);
  });

  it('accepts only internal, normalized deep links', () => {
    expect(sanitizeNotificationDeepLink('/events/abc?from=notification')).toBe('/events/abc?from=notification');
    expect(sanitizeNotificationDeepLink('//evil.example')).toBeNull();
    expect(sanitizeNotificationDeepLink('/%2e%2e/admin')).toBeNull();
    expect(sanitizeNotificationDeepLink('/events\\evil')).toBeNull();
  });

  it('does not let an event notification deep-link into admin', () => {
    expect(resolveNotificationDeepLink('event_invite', { deep_link: '/admin', event_id: 'evt-1' }))
      .toBe('/events/evt-1');
  });

  it('falls back to a valid route for social and admin notifications', () => {
    expect(resolveNotificationDeepLink('mutual_reconnection', {})).toBe('/profile');
    expect(resolveNotificationDeepLink('new_device', {})).toBe('/profile');
    expect(resolveNotificationDeepLink('admin_notice', {})).toBe('/admin');
  });

  it('builds stable recipient-scoped idempotency keys', () => {
    expect(buildNotificationDedupeKey('event_invite', ' USER-1 ', 'EVENT-1', 'SOURCE-1'))
      .toBe('event_invite:user-1:event-1:source-1');
  });
});

describe('delivery guards', () => {
  it('excludes generated and unknown recipients from production delivery', () => {
    expect(evaluateNotificationDelivery('event_invite', DEFAULT_NOTIFICATION_PREFERENCES, {
      ...baseContext,
      recipientOrigin: 'generated',
    })).toEqual({ outcome: 'suppress', reason: 'non_real_recipient' });
  });

  it('suppresses social notifications across a block boundary', () => {
    expect(evaluateNotificationDelivery('circle_invite', DEFAULT_NOTIFICATION_PREFERENCES, {
      ...baseContext,
      relationshipBlocked: true,
    })).toEqual({ outcome: 'suppress', reason: 'relationship_blocked' });
  });

  it('does not suppress non-social transactional notices solely because of a block', () => {
    expect(evaluateNotificationDelivery('waitlist_promoted', DEFAULT_NOTIFICATION_PREFERENCES, {
      ...baseContext,
      relationshipBlocked: true,
    })).toEqual({ outcome: 'deliver', reason: null });
  });

  it('deduplicates before applying lower-priority guards', () => {
    expect(evaluateNotificationDelivery('recommended_event', DEFAULT_NOTIFICATION_PREFERENCES, {
      ...baseContext,
      duplicateExists: true,
      recentNonCriticalCount: 99,
    })).toEqual({ outcome: 'suppress', reason: 'duplicate' });
  });

  it('honors category opt-out', () => {
    expect(evaluateNotificationDelivery('recommended_event', {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      recommendation_enabled: false,
    }, baseContext)).toEqual({ outcome: 'suppress', reason: 'category_opt_out' });
  });

  it('keeps critical in-app state changes available despite the general channel opt-out', () => {
    expect(evaluateNotificationDelivery('event_cancelled', {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      in_app_enabled: false,
    }, baseContext)).toEqual({ outcome: 'deliver', reason: null });
    expect(evaluateNotificationDelivery('new_device', {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      in_app_enabled: false,
    }, baseContext)).toEqual({ outcome: 'deliver', reason: null });
  });

  it('applies frequency caps only to non-critical delivery', () => {
    const capped = { ...baseContext, recentNonCriticalCount: DEFAULT_NOTIFICATION_PREFERENCES.frequency_cap_per_day };
    expect(evaluateNotificationDelivery('hub_opportunity', DEFAULT_NOTIFICATION_PREFERENCES, capped))
      .toEqual({ outcome: 'suppress', reason: 'frequency_cap' });
    expect(evaluateNotificationDelivery('waitlist_promoted', DEFAULT_NOTIFICATION_PREFERENCES, capped))
      .toEqual({ outcome: 'deliver', reason: null });
  });

  it('supports quiet hours that cross midnight', () => {
    expect(isWithinQuietHours(23 * 60, '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(6 * 60, '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(12 * 60, '22:00', '07:00')).toBe(false);
  });

  it('defers non-critical delivery during quiet hours and digest mode', () => {
    expect(evaluateNotificationDelivery('organizer_message', {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quiet_hours_enabled: true,
    }, { ...baseContext, localMinuteOfDay: 23 * 60 })).toEqual({ outcome: 'defer', reason: 'quiet_hours' });

    expect(evaluateNotificationDelivery('circle_activity', {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      digest_mode: 'daily',
    }, baseContext)).toEqual({ outcome: 'defer', reason: 'digest' });
  });
});

describe('realtime and grouping', () => {
  it('merges reconnect payloads idempotently and preserves newest order', () => {
    const old = notification('same', '2026-08-22T08:00:00.000Z');
    const updated = { ...old, is_read: true, created_at: '2026-08-22T09:00:00.000Z' };
    const result = mergeRealtimeNotification([old, notification('other', '2026-08-22T07:00:00.000Z')], updated);
    expect(result.map((item) => item.id)).toEqual(['same', 'other']);
    expect(result[0].is_read).toBe(true);
  });

  it('groups notifications into stable day buckets', () => {
    const result = groupNotifications([
      notification('today', '2026-08-22T08:00:00.000Z'),
      notification('yesterday', '2026-08-21T08:00:00.000Z'),
      notification('old', '2026-08-18T08:00:00.000Z'),
    ], new Date('2026-08-22T12:00:00.000Z'));
    expect(result.map((group) => [group.key, group.items.length])).toEqual([
      ['today', 1],
      ['yesterday', 1],
      ['earlier', 1],
    ]);
  });
});
