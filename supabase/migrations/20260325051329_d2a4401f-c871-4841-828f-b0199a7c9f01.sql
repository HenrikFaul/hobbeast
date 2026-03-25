CREATE TABLE public.event_trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mapy',
  route_type text NOT NULL DEFAULT 'foot_hiking',
  start_point jsonb NOT NULL,
  end_point jsonb NOT NULL,
  waypoints jsonb DEFAULT '[]'::jsonb,
  length_m numeric,
  duration_s numeric,
  geometry jsonb,
  elevation_profile jsonb,
  elevation_summary jsonb,
  warnings jsonb DEFAULT '[]'::jsonb,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip plans viewable by authenticated" ON public.event_trip_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Event owners can manage trip plans" ON public.event_trip_plans FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_trip_plans.event_id AND events.created_by = auth.uid()));
CREATE POLICY "Event owners can update trip plans" ON public.event_trip_plans FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_trip_plans.event_id AND events.created_by = auth.uid()));
CREATE POLICY "Event owners can delete trip plans" ON public.event_trip_plans FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_trip_plans.event_id AND events.created_by = auth.uid()));