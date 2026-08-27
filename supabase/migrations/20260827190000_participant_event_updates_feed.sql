-- What a participant is told, and what changed.
--
-- Organizers could already send official messages: event_messages, its
-- recipients table, and organizer_send_event_message_atomic all existed and
-- worked. The person receiving one had nowhere to read it — the only SELECT
-- policy on event_message_recipients is "Message operators read recipient
-- evidence", which does not cover the recipient.
--
-- Rather than widen those policies, this exposes ONE curated feed. That
-- matters most for the audit half: event_operation_audits.metadata carries
-- crew user ids, admin_override flags and internal notes that must never
-- reach a participant. A SECURITY DEFINER function returning a fixed
-- projection can guarantee that; an RLS policy over the raw table cannot.
--
-- Applied via the Supabase MCP; this file is the record.
--
-- Verified against live data before shipping: a participant saw exactly the
-- sent message and the reschedule, a message still in `scheduled` state did
-- NOT appear, a crew change did NOT appear, the internal metadata did not
-- leak into any field, and somebody who had not joined saw zero rows.

CREATE OR REPLACE FUNCTION public.my_event_updates(p_event_id uuid)
RETURNS TABLE (
  kind text,
  id uuid,
  headline text,
  body text,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH me AS (
    -- Only somebody who actually holds a place on this event sees any of it.
    SELECT 1
    FROM public.event_participants p
    WHERE p.event_id = p_event_id
      AND p.user_id = auth.uid()
      AND p.status IN ('going', 'waitlist', 'checked_in', 'completed', 'invited')
  ),
  messages AS (
    SELECT
      'message'::text AS kind,
      m.id,
      COALESCE(NULLIF(btrim(m.subject), ''), 'Üzenet a szervezőtől') AS headline,
      m.body,
      m.created_at AS occurred_at
    FROM public.event_message_recipients r
    JOIN public.event_messages m ON m.id = r.message_id
    WHERE r.recipient_user_id = auth.uid()
      AND m.event_id = p_event_id
      -- A message still waiting to go out is not yet news.
      AND m.delivery_state <> 'scheduled'
  ),
  changes AS (
    SELECT
      'change'::text AS kind,
      a.id,
      CASE a.action
        WHEN 'event_cancelled'   THEN 'A programot lemondták'
        WHEN 'event_rescheduled' THEN 'Új időpont'
        WHEN 'event_published'   THEN 'A program elindult'
        WHEN 'event_completed'   THEN 'A program lezárult'
      END AS headline,
      -- The organizer's own words only. Never a.metadata: it holds crew user
      -- ids and admin_override flags that are nobody else's business.
      NULLIF(btrim(COALESCE(a.reason, '')), '') AS body,
      a.created_at AS occurred_at
    FROM public.event_operation_audits a
    WHERE a.event_id = p_event_id
      AND a.action IN ('event_cancelled', 'event_rescheduled', 'event_published', 'event_completed')
  )
  SELECT kind, id, headline, body, occurred_at
  FROM (SELECT * FROM messages UNION ALL SELECT * FROM changes) feed
  WHERE EXISTS (SELECT 1 FROM me)
  ORDER BY occurred_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.my_event_updates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_event_updates(uuid) TO authenticated;

COMMENT ON FUNCTION public.my_event_updates(uuid) IS
  'Official updates and changes for one event, for a participant of that event. Curated projection: never exposes event_operation_audits.metadata.';
