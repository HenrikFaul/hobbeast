import { supabase } from '@/integrations/supabase/client';

export type OutboundSurface = 'event_card' | 'event_detail';

/**
 * Record that a member clicked through to a partner's ticket/info page.
 *
 * This is the measurement behind the marketplace-commission pillar: without it
 * there is no evidence of the traffic a partner receives. The call is
 * deliberately fire-and-forget — a failed measurement must never delay or block
 * the user from reaching the partner site.
 *
 * The client sends only the event id; source attribution, ticket price and the
 * target URL are read server-side so they cannot be forged.
 */
export function trackOutboundClick(externalEventId: string | null | undefined, surface: OutboundSurface): void {
  if (!externalEventId) return;
  try {
    // Both a synchronous throw and a rejected promise must stay contained: this
    // runs inside an anchor's onClick, where an escaping error can prevent the
    // browser from following the link to the partner.
    void supabase
      .rpc('track_outbound_click', { p_external_event_id: externalEventId, p_surface: surface })
      .then(undefined, () => undefined);
  } catch {
    // Measurement is best-effort by design.
  }
}
