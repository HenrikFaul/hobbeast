CREATE TABLE IF NOT EXISTS public.event_trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mapy',
  route_type TEXT NOT NULL,
  start_point JSONB NOT NULL,
  end_point JSONB NOT NULL,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  length_m INTEGER,
  duration_s INTEGER,
  geometry JSONB,
  warnings JSONB,
  external_url TEXT,
  elevation_profile JSONB,
  elevation_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip plans are viewable by authenticated users"
ON public.event_trip_plans
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create trip plans for own events"
ON public.event_trip_plans
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_id
      AND e.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update trip plans for own events"
ON public.event_trip_plans
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_id
      AND e.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_id
      AND e.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete trip plans for own events"
ON public.event_trip_plans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_id
      AND e.created_by = auth.uid()
  )
);

CREATE TRIGGER update_event_trip_plans_updated_at
BEFORE UPDATE ON public.event_trip_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
