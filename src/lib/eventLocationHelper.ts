/**
 * Shared helper to resolve the best location label for an event.
 * Prefers normalized place fields, falls back to legacy location fields.
 */

interface EventLike {
  location_type?: string | null;
  location_city?: string | null;
  location_address?: string | null;
  location_free_text?: string | null;
  place_name?: string | null;
  place_city?: string | null;
  place_address?: string | null;
}

export function resolveEventLocationLabel(ev: EventLike): string {
  if (ev.location_type === 'online') return 'Online';

  // Prefer normalized place fields
  if (ev.place_name || ev.place_address || ev.place_city) {
    const parts = [ev.place_name, ev.place_city].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }

  // Fall back to legacy fields
  const legacy = [ev.location_city, ev.location_address, ev.location_free_text].filter(Boolean);
  return legacy.join(', ') || 'Helyszín nem megadva';
}
