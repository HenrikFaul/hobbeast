-- v1.5.2 admin bulk selection and profile reliability

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_origin text NOT NULL DEFAULT 'real';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hobbies text[] DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_profiles_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_profiles_user_id_unique ON public.profiles(user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_notification_preferences_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_notification_preferences_user_id_unique ON public.notification_preferences(user_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
