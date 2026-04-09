
-- Virtual hubs: invisible interest-based communities
CREATE TABLE public.virtual_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hobby_category text NOT NULL,
  hobby_subcategory text,
  hobby_activity text,
  city text,
  member_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hobby_category, hobby_subcategory, hobby_activity, city)
);

ALTER TABLE public.virtual_hubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view virtual hubs"
ON public.virtual_hubs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Hub members
CREATE TABLE public.virtual_hub_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.virtual_hubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, user_id)
);

ALTER TABLE public.virtual_hub_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all hub members"
ON public.virtual_hub_members FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own hub memberships"
ON public.virtual_hub_members FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Function to refresh virtual hubs from profiles.hobbies
CREATE OR REPLACE FUNCTION public.refresh_virtual_hubs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_hobby text;
  v_hub_id uuid;
BEGIN
  -- Clear existing members (rebuild)
  DELETE FROM virtual_hub_members;

  -- For each profile with hobbies
  FOR v_profile IN
    SELECT user_id, hobbies, city FROM profiles WHERE hobbies IS NOT NULL AND array_length(hobbies, 1) > 0
  LOOP
    FOREACH v_hobby IN ARRAY v_profile.hobbies
    LOOP
      -- Upsert hub
      INSERT INTO virtual_hubs (hobby_category, city)
      VALUES (v_hobby, v_profile.city)
      ON CONFLICT (hobby_category, hobby_subcategory, hobby_activity, city)
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_hub_id;

      -- Add member
      INSERT INTO virtual_hub_members (hub_id, user_id)
      VALUES (v_hub_id, v_profile.user_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Update member counts
  UPDATE virtual_hubs SET member_count = (
    SELECT count(*) FROM virtual_hub_members WHERE hub_id = virtual_hubs.id
  );
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_virtual_hubs_updated_at
BEFORE UPDATE ON public.virtual_hubs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
