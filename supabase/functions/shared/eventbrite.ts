interface EventbriteEventPayload {
  id?: unknown;
  name?: { text?: unknown };
  description?: { text?: unknown } | null;
  start?: { local?: unknown };
  url?: unknown;
  capacity?: unknown;
  status?: unknown;
  logo?: { url?: unknown; original?: { url?: unknown } } | null;
  venue?: {
    name?: unknown;
    address?: { city?: unknown; localized_address_display?: unknown };
  } | null;
  category?: { name?: unknown; short_name?: unknown } | null;
  is_free?: unknown;
}

function text(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function httpsUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const CATEGORY_EMOJI: Record<string, string> = {
  Music: '🎵', Business: '💼', 'Food & Drink': '🍽️', Community: '🤝', Arts: '🎨',
  'Film & Media': '🎬', 'Sports & Fitness': '🏃', Health: '🧘', 'Science & Tech': '💻',
  'Travel & Outdoor': '🏔️', Hobbies: '🎯', Other: '📅',
};

export function normalizeEventbriteEvent(raw: EventbriteEventPayload) {
  const externalId = text(raw?.id, 200);
  const title = text(raw?.name?.text, 300);
  if (!externalId) throw new Error('Eventbrite event is missing an id');
  if (!title) throw new Error('Eventbrite event is missing a title');
  const startLocal = text(raw?.start?.local, 64);
  const [eventDate, timeWithZone] = startLocal ? startLocal.split('T') : [];
  const category = text(raw?.category?.name || raw?.category?.short_name, 100) || 'Egyéb';
  const venue = raw?.venue;
  const city = text(venue?.address?.city, 120) || null;
  const address = text(venue?.address?.localized_address_display || venue?.name, 300) || null;
  const capacity = Number(raw?.capacity);
  const externalUrl = httpsUrl(raw?.url);

  return {
    id: `eb-${externalId}`,
    external_source: 'eventbrite' as const,
    external_id: externalId,
    canonical_identity: `eventbrite:${externalId.toLowerCase()}`,
    title,
    category,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(eventDate || '') ? eventDate : null,
    event_time: timeWithZone ? timeWithZone.slice(0, 5) : null,
    location_city: city,
    location_district: null,
    location_address: address,
    location_free_text: null,
    location_type: venue ? 'address' : 'online',
    max_attendees: Number.isFinite(capacity) && capacity >= 0 ? capacity : null,
    image_emoji: CATEGORY_EMOJI[category] || '📅',
    tags: ['Eventbrite', ...(raw?.is_free === true ? ['Ingyenes'] : [])],
    description: text(raw?.description?.text, 300) || null,
    created_by: '',
    participant_count: 0,
    source: 'eventbrite' as const,
    source_label: 'Eventbrite',
    eventbrite_url: externalUrl,
    eventbrite_logo_url: httpsUrl(raw?.logo?.original?.url || raw?.logo?.url),
    provider_status: text(raw?.status, 40) || null,
  };
}

export function normalizeEventbritePage(payload: unknown) {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const events = Array.isArray(raw.events)
    ? raw.events.map((event) => normalizeEventbriteEvent(event as EventbriteEventPayload))
    : [];
  const pagination = raw.pagination && typeof raw.pagination === 'object' && !Array.isArray(raw.pagination)
    ? raw.pagination as Record<string, unknown>
    : {};
  const pageNumber = Math.max(1, Number(pagination.page_number) || 1);
  const pageCount = Math.max(0, Number(pagination.page_count) || 0);
  return {
    events,
    pagination: {
      object_count: Math.max(0, Number(pagination.object_count) || events.length),
      page_number: pageNumber,
      page_size: Math.max(0, Number(pagination.page_size) || events.length),
      page_count: pageCount,
      has_more_items: pagination.has_more_items === true || (pageCount > 0 && pageNumber < pageCount),
    },
  };
}

export function normalizeEventbriteOrganizations(payload: unknown) {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  return {
    organizations: Array.isArray(raw.organizations)
      ? raw.organizations.flatMap((organization) => {
          if (!organization || typeof organization !== 'object' || Array.isArray(organization)) return [];
          const row = organization as Record<string, unknown>;
          const id = text(row.id, 200);
          if (!id) return [];
          const nameValue = row.name && typeof row.name === 'object' && !Array.isArray(row.name)
            ? text((row.name as Record<string, unknown>).text, 200)
            : text(row.name, 200);
          return [{ id, name: nameValue || 'Eventbrite organization' }];
        })
      : [],
  };
}
