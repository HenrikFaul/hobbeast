CREATE TABLE public.hike_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL DEFAULT 'Túraútvonal',
  route_type text NOT NULL DEFAULT 'foot-hiking',
  waypoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  geometry jsonb,
  elevation_profile jsonb,
  total_distance_m numeric,
  total_duration_s numeric,
  total_ascent_m numeric,
  total_descent_m numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hike_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view routes for events they can see"
  ON public.hike_routes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create own routes"
  ON public.hike_routes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own routes"
  ON public.hike_routes FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own routes"
  ON public.hike_routes FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE TRIGGER update_hike_routes_updated_at
  BEFORE UPDATE ON public.hike_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();