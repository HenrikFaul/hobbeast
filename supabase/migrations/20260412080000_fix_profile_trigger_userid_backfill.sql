-- Fix handle_new_user_profile trigger to also set user_id (was missing, causing
-- mass-create-users upsert to fail: trigger created profiles with user_id=NULL,
-- then persistProfile queried by user_id → not found → INSERT conflicted on id).
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, display_name, username, email, avatar_url)
  VALUES (
    NEW.id,
    NEW.id,
    coalesce(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name'),
    NEW.raw_user_meta_data ->> 'user_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email        = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    username     = coalesce(excluded.username,     public.profiles.username),
    avatar_url   = coalesce(excluded.avatar_url,   public.profiles.avatar_url),
    user_id      = coalesce(excluded.user_id,      public.profiles.user_id),
    updated_at   = now();
  RETURN NEW;
END;
$$;

-- Backfill: all existing profiles whose user_id was left NULL by the old trigger
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- Backfill user_origin for already-created generated users whose profile
-- was left as 'real' because persistProfile's insert conflicted and was skipped.
UPDATE public.profiles p
SET
  user_origin = 'generated',
  city        = coalesce(p.city, (u.raw_user_meta_data ->> 'city')),
  hobbies     = CASE
                  WHEN p.hobbies IS NULL OR p.hobbies = '{}'
                  THEN coalesce(
                    ARRAY(SELECT jsonb_array_elements_text(u.raw_user_meta_data -> 'hobbies')),
                    '{}'::text[]
                  )
                  ELSE p.hobbies
                END
FROM auth.users u
WHERE u.id = p.id
  AND COALESCE((u.raw_user_meta_data ->> 'is_test_user')::boolean, false) = true
  AND p.user_origin = 'real';
