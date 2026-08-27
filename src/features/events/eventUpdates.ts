import { supabase } from '@/integrations/supabase/client';

/**
 * What the people who joined are actually told.
 *
 * Organizers could already send official messages — `event_messages`, its
 * recipients table and `organizer_send_event_message_atomic` all existed and
 * worked — but the person receiving one had nowhere to read it: the only
 * SELECT policy on the recipients table covers operators, not recipients.
 *
 * The feed also carries the changes that matter to somebody holding a place:
 * a cancellation, a new time. Those come from `event_operation_audits`, whose
 * `metadata` holds crew user ids and admin-override flags — so the database
 * hands back a fixed, curated projection rather than the raw rows, and the
 * organizer's own written reason is the only free text that travels.
 */

export type EventUpdateKind = 'message' | 'change';

export interface EventUpdate {
  kind: EventUpdateKind;
  id: string;
  headline: string;
  body: string | null;
  occurred_at: string;
}

const rpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Returns an empty list for anybody who has not joined — that is the
 * database's decision, not this function's, and it is not an error worth
 * showing.
 */
export async function getMyEventUpdates(eventId: string): Promise<EventUpdate[]> {
  try {
    const { data, error } = await rpc.rpc('my_event_updates', { p_event_id: eventId });
    if (error || !Array.isArray(data)) return [];
    return data as EventUpdate[];
  } catch {
    return [];
  }
}

/** "3 napja" — close enough, and kinder than a timestamp on a phone. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);

  if (minutes < 1) return 'az imént';
  if (minutes < 60) return `${minutes} perce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'tegnap';
  if (days < 30) return `${days} napja`;
  return then.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
}
