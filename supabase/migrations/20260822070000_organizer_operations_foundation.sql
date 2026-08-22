-- Prompt 07: least-privilege organizer operations, readiness, incident handoff
-- and recurrence exceptions. No existing organizer route is removed.
-- Rollback: hide the new modules, export audit/incident rows, then drop the
-- four new tables in reverse FK order.

BEGIN;

CREATE TABLE IF NOT EXISTS public.organizer_readiness_assessments (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  checklist_version text NOT NULL DEFAULT 'organizer-readiness-v1',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  enforcement_state text NOT NULL DEFAULT 'advisory',
  assessed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (enforcement_state IN ('advisory', 'required_for_publish', 'waived'))
);

CREATE TABLE IF NOT EXISTS public.event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  recurrence_rule text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Budapest',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(title) BETWEEN 1 AND 160),
  CHECK (char_length(recurrence_rule) BETWEEN 1 AND 500)
);

CREATE TABLE IF NOT EXISTS public.event_series_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.event_series(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  occurrence_start timestamptz NOT NULL,
  original_start timestamptz NOT NULL,
  occurrence_state text NOT NULL DEFAULT 'scheduled',
  exception_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, original_start),
  UNIQUE (event_id),
  CHECK (occurrence_state IN ('scheduled', 'skipped', 'rescheduled', 'cancelled')),
  CHECK (exception_reason IS NULL OR char_length(exception_reason) <= 500)
);

CREATE INDEX IF NOT EXISTS event_series_occurrences_upcoming_idx
  ON public.event_series_occurrences (series_id, occurrence_start)
  WHERE occurrence_state = 'scheduled';

CREATE TABLE IF NOT EXISTS public.organizer_incident_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_type text NOT NULL,
  severity text NOT NULL,
  summary text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  resolution_note text,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (incident_type IN ('safety', 'venue', 'attendance', 'accessibility', 'other')),
  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CHECK (state IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  CHECK (char_length(summary) BETWEEN 3 AND 1000),
  CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
  UNIQUE (reporter_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS organizer_incident_handoffs_open_idx
  ON public.organizer_incident_handoffs (severity, created_at)
  WHERE state IN ('open', 'acknowledged', 'in_progress');

ALTER TABLE public.organizer_readiness_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_series_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_incident_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event editors manage readiness" ON public.organizer_readiness_assessments
  FOR ALL TO authenticated
  USING (public.is_event_operator(event_id, 'edit'))
  WITH CHECK (public.is_event_operator(event_id, 'edit'));

CREATE POLICY "Series owners manage own series" ON public.event_series
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Series owners manage occurrence exceptions" ON public.event_series_occurrences
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_series s
    WHERE s.id = event_series_occurrences.series_id
      AND (s.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_series s
    WHERE s.id = event_series_occurrences.series_id
      AND (s.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE POLICY "Event operators read incident handoffs" ON public.organizer_incident_handoffs
  FOR SELECT TO authenticated
  USING (
    reporter_user_id = auth.uid()
    OR assigned_owner_user_id = auth.uid()
    OR public.is_event_operator(event_id, 'moderate')
    OR public.is_event_operator(event_id, 'edit')
  );

CREATE POLICY "Event operators create incident handoffs" ON public.organizer_incident_handoffs
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND (public.is_event_operator(event_id, 'moderate') OR public.is_event_operator(event_id, 'edit'))
  );

CREATE POLICY "Assigned operators update incident handoffs" ON public.organizer_incident_handoffs
  FOR UPDATE TO authenticated
  USING (
    assigned_owner_user_id = auth.uid()
    OR public.is_event_operator(event_id, 'moderate')
    OR public.is_event_operator(event_id, 'edit')
  )
  WITH CHECK (
    public.is_event_operator(event_id, 'moderate')
    OR public.is_event_operator(event_id, 'edit')
  );

COMMIT;
