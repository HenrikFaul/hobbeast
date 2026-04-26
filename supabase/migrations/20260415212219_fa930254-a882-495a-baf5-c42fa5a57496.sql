-- Ensure the shared updated_at trigger function exists (guard for preview/branch environments)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Auto-event generation configuration table
CREATE TABLE IF NOT EXISTS public.auto_event_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  min_members INTEGER NOT NULL DEFAULT 5,
  max_distance_km INTEGER NOT NULL DEFAULT 30,
  frequency_days INTEGER NOT NULL DEFAULT 7,
  max_events_per_run INTEGER NOT NULL DEFAULT 10,
  categories_filter TEXT[] DEFAULT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  last_run_result JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_event_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auto_event_config' AND policyname = 'Admins can view auto_event_config'
  ) THEN
    CREATE POLICY "Admins can view auto_event_config"
      ON public.auto_event_config FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auto_event_config' AND policyname = 'Admins can insert auto_event_config'
  ) THEN
    CREATE POLICY "Admins can insert auto_event_config"
      ON public.auto_event_config FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auto_event_config' AND policyname = 'Admins can update auto_event_config'
  ) THEN
    CREATE POLICY "Admins can update auto_event_config"
      ON public.auto_event_config FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_auto_event_config_updated_at ON public.auto_event_config;
CREATE TRIGGER update_auto_event_config_updated_at
  BEFORE UPDATE ON public.auto_event_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default config row
INSERT INTO public.auto_event_config (enabled, min_members, max_distance_km, frequency_days, max_events_per_run)
VALUES (false, 5, 30, 7, 10)
ON CONFLICT DO NOTHING;
