import { supabase } from '@/integrations/supabase/client';

/**
 * The people helping run an event.
 *
 * The whole back end for this already existed and had never been reachable:
 * the `event_crew_roles` table, its read policies, and
 * `manage_event_crew_role_atomic` — an RPC with an idempotency key, an audit
 * entry and an owner check. Nothing here re-implements any of that; this is
 * the thin layer the organizer screen was missing.
 *
 * Five separate capabilities rather than one "helper" flag, because letting
 * somebody check people in is a very different thing from letting them see
 * the money.
 */

export const CREW_CAPABILITIES = [
  {
    key: 'can_check_in',
    label: 'Beléptetés',
    hint: 'Résztvevőket tud becsekkolni a helyszínen.',
  },
  {
    key: 'can_message_attendees',
    label: 'Üzenetküldés',
    hint: 'Írhat a jelentkezőknek az esemény nevében.',
  },
  {
    key: 'can_edit_event',
    label: 'Szerkesztés',
    hint: 'Módosíthatja az esemény adatait.',
  },
  {
    key: 'can_view_finance',
    label: 'Pénzügy',
    hint: 'Láthatja a bevételi adatokat.',
  },
  {
    key: 'can_moderate',
    label: 'Moderálás',
    hint: 'Kezelheti a bejelentéseket és a résztvevőket.',
  },
] as const;

export type CrewCapabilityKey = typeof CREW_CAPABILITIES[number]['key'];

export type CrewCapabilities = Record<CrewCapabilityKey, boolean>;

export interface CrewMember extends CrewCapabilities {
  id: string;
  event_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
  updated_at: string;
  /** Filled in from profiles; the crew table itself stores only the id. */
  display_name?: string | null;
  avatar_url?: string | null;
}

export const EMPTY_CAPABILITIES: CrewCapabilities = {
  can_check_in: false,
  can_message_attendees: false,
  can_edit_event: false,
  can_view_finance: false,
  can_moderate: false,
};

/** Whether a set of capabilities grants anything at all. */
export function grantsAnything(capabilities: CrewCapabilities): boolean {
  return CREW_CAPABILITIES.some(({ key }) => capabilities[key]);
}

/** A short, readable summary of what somebody may do. */
export function describeCapabilities(capabilities: CrewCapabilities): string {
  const granted = CREW_CAPABILITIES.filter(({ key }) => capabilities[key]).map(({ label }) => label);
  return granted.length ? granted.join(' · ') : 'Nincs jogosultság';
}

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      in: (column: string, values: string[]) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/**
 * The crew of one event, with names attached.
 *
 * The row-level policies already decide who may see this, so a reader who is
 * not an operator simply gets an empty list rather than an error.
 */
export async function listEventCrew(eventId: string): Promise<CrewMember[]> {
  try {
    const { data, error } = await rpc.from('event_crew_roles')
      .select('id, event_id, user_id, can_check_in, can_message_attendees, can_edit_event, can_view_finance, can_moderate, granted_by, created_at, updated_at')
      .eq('event_id', eventId);
    if (error || !Array.isArray(data)) return [];

    const rows = data as CrewMember[];
    if (!rows.length) return rows;

    // A second read for the names: the crew table stores ids only, and joining
    // through PostgREST would need a foreign-key relationship it does not have.
    const { data: profiles } = await rpc.from('profiles')
      .select('user_id, id, display_name, avatar_url')
      .in('user_id', rows.map((row) => row.user_id));

    const byId = new Map<string, { display_name?: string | null; avatar_url?: string | null }>();
    for (const profile of (Array.isArray(profiles) ? profiles : []) as Array<Record<string, unknown>>) {
      const key = String(profile.user_id ?? profile.id ?? '');
      if (key) byId.set(key, { display_name: profile.display_name as string | null, avatar_url: profile.avatar_url as string | null });
    }

    return rows.map((row) => ({ ...row, ...byId.get(row.user_id) }));
  } catch {
    // A dropped connection must leave the panel on its empty state rather than
    // spinning for ever — the organizer can retry by reopening the tab.
    return [];
  }
}

export const CREW_ERROR_TEXT: Record<string, string> = {
  EVENT_OWNER_REQUIRED: 'Ehhez az esemény tulajdonosának kell lenned.',
  INVALID_CREW_MUTATION: 'Hiányzik az indoklás — írj legalább három karaktert.',
  EVENT_NOT_FOUND: 'Ez az esemény nem található.',
  EVENT_OWNER_ALREADY_HAS_ACCESS: 'A tulajdonosnak már mindenre van joga.',
  REAL_CREW_PROFILE_REQUIRED: 'Csak valódi, regisztrált felhasználó lehet segítő.',
  AT_LEAST_ONE_CREW_CAPABILITY_REQUIRED: 'Adj meg legalább egy jogosultságot.',
};

export interface CrewMutation {
  eventId: string;
  userId: string;
  action: 'upsert' | 'remove';
  capabilities?: CrewCapabilities;
  reason: string;
}

/**
 * Grants, changes or withdraws a crew role.
 *
 * The idempotency key is generated per call rather than per attempt, so a
 * retry after a dropped connection replays instead of granting twice — the
 * RPC recognises the key and reports `replayed`.
 */
export async function saveCrewRole(mutation: CrewMutation): Promise<{ ok: true; replayed: boolean } | { ok: false; message: string }> {
  const capabilities = mutation.capabilities ?? EMPTY_CAPABILITIES;
  const { data, error } = await rpc.rpc('manage_event_crew_role_atomic', {
    p_event_id: mutation.eventId,
    p_user_id: mutation.userId,
    p_action: mutation.action,
    p_can_check_in: capabilities.can_check_in,
    p_can_message_attendees: capabilities.can_message_attendees,
    p_can_edit_event: capabilities.can_edit_event,
    p_can_view_finance: capabilities.can_view_finance,
    p_can_moderate: capabilities.can_moderate,
    p_reason: mutation.reason.trim(),
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    const code = Object.keys(CREW_ERROR_TEXT).find((key) => error.message.includes(key));
    return { ok: false, message: code ? CREW_ERROR_TEXT[code] : 'A mentés nem sikerült.' };
  }
  const replayed = Boolean((data as { replayed?: boolean } | null)?.replayed);
  return { ok: true, replayed };
}
