export const NOTIFICATION_TYPES = [
  'friend_request',
  'event_invite',
  'favorite_category_event',
  'recommended_event',
  'waitlist_promoted',
  'organizer_message',
  'event_changed',
  'event_cancelled',
  'upcoming_event_reminder',
  'post_event_feedback',
  'mutual_reconnection',
  'circle_invite',
  'circle_activity',
  'community_digest',
  'hub_opportunity',
  'organizer_reminder',
  'new_device',
  'security_alert',
  'admin_notice',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationCategory =
  | 'safety'
  | 'transactional'
  | 'organizer'
  | 'community'
  | 'recommendation'
  | 'admin';
export type NotificationChannel = 'in_app' | 'email' | 'push';
export type NotificationPriority = 1 | 2 | 3 | 4 | 5;
export type NotificationPreferenceKey =
  | 'friend_request'
  | 'event_invite'
  | 'favorite_category_event'
  | 'organizer_enabled'
  | 'community_enabled'
  | 'recommendation_enabled'
  | 'transactional_enabled'
  | 'marketing_enabled';

export interface NotificationMetadata {
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly preferenceKey: NotificationPreferenceKey | null;
  readonly icon: string;
  readonly social: boolean;
  readonly critical: boolean;
  readonly allowedDeepLinkPrefixes: readonly string[];
}

export const NOTIFICATION_METADATA: Record<NotificationType, NotificationMetadata> = {
  friend_request: meta('community', 2, 'friend_request', '👋', true, false, ['/profile']),
  event_invite: meta('transactional', 4, 'event_invite', '📩', false, false, ['/events/']),
  favorite_category_event: meta('recommendation', 1, 'favorite_category_event', '⭐', false, false, ['/events']),
  recommended_event: meta('recommendation', 1, 'recommendation_enabled', '✨', false, false, ['/events']),
  waitlist_promoted: meta('transactional', 5, null, '🎟️', false, true, ['/events/']),
  organizer_message: meta('organizer', 3, 'organizer_enabled', '💬', false, false, ['/events/']),
  event_changed: meta('transactional', 5, null, '🗓️', false, true, ['/events/']),
  event_cancelled: meta('transactional', 5, null, '⚠️', false, true, ['/events/']),
  upcoming_event_reminder: meta('transactional', 4, 'transactional_enabled', '⏰', false, false, ['/events/']),
  post_event_feedback: meta('community', 2, 'community_enabled', '🌱', false, false, ['/events/', '/profile']),
  mutual_reconnection: meta('community', 2, 'community_enabled', '🤝', true, false, ['/profile']),
  circle_invite: meta('community', 3, 'community_enabled', '⭕', true, false, ['/profile']),
  circle_activity: meta('community', 2, 'community_enabled', '👥', true, false, ['/profile', '/events/']),
  community_digest: meta('community', 2, 'community_enabled', '📰', false, false, ['/profile']),
  hub_opportunity: meta('recommendation', 1, 'recommendation_enabled', '🌟', false, false, ['/events']),
  organizer_reminder: meta('organizer', 3, 'organizer_enabled', '📋', false, false, ['/organizer']),
  new_device: meta('safety', 5, null, '📱', false, true, ['/profile']),
  security_alert: meta('safety', 5, null, '🛡️', false, true, ['/profile']),
  admin_notice: meta('admin', 5, null, '🔧', false, true, ['/admin']),
};

function meta(
  category: NotificationCategory,
  priority: NotificationPriority,
  preferenceKey: NotificationPreferenceKey | null,
  icon: string,
  social: boolean,
  critical: boolean,
  allowedDeepLinkPrefixes: readonly string[],
): NotificationMetadata {
  return { category, priority, preferenceKey, icon, social, critical, allowedDeepLinkPrefixes };
}

export interface NotificationPreferences {
  friend_request: boolean;
  event_invite: boolean;
  favorite_category_event: boolean;
  organizer_enabled: boolean;
  community_enabled: boolean;
  recommendation_enabled: boolean;
  transactional_enabled: boolean;
  marketing_enabled: boolean;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  digest_mode: 'off' | 'daily' | 'weekly';
  frequency_cap_per_day: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  friend_request: true,
  event_invite: true,
  favorite_category_event: true,
  organizer_enabled: true,
  community_enabled: true,
  recommendation_enabled: true,
  transactional_enabled: true,
  marketing_enabled: false,
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  quiet_hours_enabled: false,
  quiet_start: '22:00',
  quiet_end: '07:00',
  timezone: 'Europe/Budapest',
  digest_mode: 'off',
  frequency_cap_per_day: 12,
};

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function getNotificationMetadata(type: string): NotificationMetadata {
  return isNotificationType(type)
    ? NOTIFICATION_METADATA[type]
    : meta('transactional', 3, null, '🔔', false, false, ['/events', '/profile']);
}

export function sanitizeNotificationDeepLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  if ([...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || decoded.includes('\\')) return null;
  if (decoded.split(/[?#]/, 1)[0].split('/').some((part) => part === '..' || part === '.')) return null;

  try {
    const parsed = new URL(candidate, 'https://hobbeast.invalid');
    if (parsed.origin !== 'https://hobbeast.invalid') return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function safeEntityId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(candidate) ? candidate : null;
}

function isAllowedDeepLink(type: string, link: string) {
  return getNotificationMetadata(type).allowedDeepLinkPrefixes.some((prefix) => (
    prefix.endsWith('/') ? link.startsWith(prefix) : link === prefix || link.startsWith(`${prefix}?`)
  ));
}

export function resolveNotificationDeepLink(type: string, data: Record<string, unknown>): string | null {
  const explicit = sanitizeNotificationDeepLink(data.deep_link);
  if (explicit && isAllowedDeepLink(type, explicit)) return explicit;

  const eventId = safeEntityId(data.event_id);
  if (eventId && getNotificationMetadata(type).allowedDeepLinkPrefixes.includes('/events/')) {
    return `/events/${encodeURIComponent(eventId)}`;
  }
  if (type === 'organizer_reminder') return '/organizer';
  if (type === 'admin_notice') return '/admin';
  if (getNotificationMetadata(type).social || type === 'new_device' || type === 'security_alert') return '/profile';
  if (getNotificationMetadata(type).category === 'recommendation') return '/events';
  return null;
}

export function buildNotificationDedupeKey(
  type: NotificationType,
  recipientId: string,
  eventKey?: string | null,
  sourceId?: string | null,
) {
  return [type, recipientId.trim(), eventKey?.trim() || '-', sourceId?.trim() || '-']
    .map((part) => part.toLocaleLowerCase('hu-HU'))
    .join(':');
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isWithinQuietHours(localMinuteOfDay: number, start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return localMinuteOfDay >= startMinutes && localMinuteOfDay < endMinutes;
  return localMinuteOfDay >= startMinutes || localMinuteOfDay < endMinutes;
}

export interface DeliveryGuardContext {
  channel: NotificationChannel;
  recipientOrigin: 'real' | 'generated' | 'unknown';
  duplicateExists: boolean;
  relationshipBlocked: boolean;
  targetActive: boolean;
  expired: boolean;
  recentNonCriticalCount: number;
  localMinuteOfDay: number;
}

export type DeliveryDecision =
  | { outcome: 'deliver'; reason: null }
  | { outcome: 'defer'; reason: 'quiet_hours' | 'digest' }
  | { outcome: 'suppress'; reason: string };

export function evaluateNotificationDelivery(
  type: NotificationType,
  preferences: NotificationPreferences,
  context: DeliveryGuardContext,
): DeliveryDecision {
  const metadata = NOTIFICATION_METADATA[type];
  if (context.recipientOrigin !== 'real') return { outcome: 'suppress', reason: 'non_real_recipient' };
  if (metadata.social && context.relationshipBlocked) return { outcome: 'suppress', reason: 'relationship_blocked' };
  if (context.duplicateExists) return { outcome: 'suppress', reason: 'duplicate' };
  if (context.expired || !context.targetActive) return { outcome: 'suppress', reason: 'stale_target' };

  const channelEnabled = context.channel === 'in_app'
    ? preferences.in_app_enabled
    : context.channel === 'email'
      ? preferences.email_enabled
      : preferences.push_enabled;
  if (!channelEnabled && !(metadata.critical && context.channel === 'in_app')) {
    return { outcome: 'suppress', reason: 'channel_opt_out' };
  }

  if (metadata.preferenceKey && !preferences[metadata.preferenceKey]) {
    return { outcome: 'suppress', reason: 'category_opt_out' };
  }
  if (!metadata.critical && context.recentNonCriticalCount >= preferences.frequency_cap_per_day) {
    return { outcome: 'suppress', reason: 'frequency_cap' };
  }
  if (!metadata.critical && preferences.quiet_hours_enabled
    && isWithinQuietHours(context.localMinuteOfDay, preferences.quiet_start, preferences.quiet_end)) {
    return { outcome: 'defer', reason: 'quiet_hours' };
  }
  if (!metadata.critical && preferences.digest_mode !== 'off'
    && (metadata.category === 'recommendation' || metadata.category === 'community')) {
    return { outcome: 'defer', reason: 'digest' };
  }
  return { outcome: 'deliver', reason: null };
}

export function mergeRealtimeNotification(
  current: readonly NotificationRecord[],
  incoming: NotificationRecord,
  limit = 50,
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  byId.set(incoming.id, incoming);
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, Math.max(1, limit));
}

export interface NotificationGroup {
  key: 'today' | 'yesterday' | 'earlier';
  label: string;
  items: NotificationRecord[];
}

export function groupNotifications(items: readonly NotificationRecord[], now = new Date()): NotificationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const buckets: Record<NotificationGroup['key'], NotificationRecord[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  items.forEach((item) => {
    const createdAt = Date.parse(item.created_at);
    if (createdAt >= startOfToday) buckets.today.push(item);
    else if (createdAt >= startOfYesterday) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  });
  const labels: Record<NotificationGroup['key'], string> = {
    today: 'Ma',
    yesterday: 'Tegnap',
    earlier: 'Korábban',
  };
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: labels[key], items: buckets[key] }));
}
