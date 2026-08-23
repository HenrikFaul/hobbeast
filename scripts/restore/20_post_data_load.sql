-- Hobbeast production data re-import — POST step.
--
-- Reverses 10_pre_data_load.sql after the dump's data landed:
--   1. Backfill virtual_hubs.identity_key with the exact normalization the
--      20260822050100 migration uses, dedupe colliding hubs the same way
--      (keeper = earliest created_at), then re-assert NOT NULL.
--   2. Re-enable USER triggers on public tables.
--   3. Re-attach the auth signup trigger.
--   4. Point app_runtime_config's internal Edge base URL at the CURRENT
--      project instead of the retired dsymdijzydaehntlmfzl host. The caller
--      substitutes :edge_base_url (psql -v edge_base_url=...).

-- 1) identity_key backfill + dedup (same semantics as 20260822050100)
UPDATE public.virtual_hubs
SET identity_key = lower(btrim(hobby_category)) || '|' ||
  lower(coalesce(NULLIF(btrim(hobby_subcategory), ''), '-')) || '|' ||
  lower(coalesce(NULLIF(btrim(hobby_activity), ''), '-')) || '|' ||
  lower(coalesce(NULLIF(btrim(city), ''), '-'))
WHERE identity_key IS NULL OR btrim(identity_key) = '';

DO $$
BEGIN
  CREATE TEMP TABLE _hub_dedup_map AS
  SELECT id AS old_hub_id,
         first_value(id) OVER (PARTITION BY identity_key ORDER BY created_at, id) AS keeper_hub_id
  FROM public.virtual_hubs;

  INSERT INTO public.virtual_hub_members (hub_id, user_id, joined_at)
  SELECT m.keeper_hub_id, hm.user_id, min(hm.joined_at)
  FROM _hub_dedup_map m
  JOIN public.virtual_hub_members hm ON hm.hub_id = m.old_hub_id
  WHERE m.old_hub_id <> m.keeper_hub_id
  GROUP BY m.keeper_hub_id, hm.user_id
  ON CONFLICT (hub_id, user_id) DO NOTHING;

  DELETE FROM public.virtual_hub_members hm
  USING _hub_dedup_map m
  WHERE hm.hub_id = m.old_hub_id AND m.old_hub_id <> m.keeper_hub_id;

  DELETE FROM public.virtual_hubs h
  USING _hub_dedup_map m
  WHERE h.id = m.old_hub_id AND m.old_hub_id <> m.keeper_hub_id;

  DROP TABLE _hub_dedup_map;
END;
$$;

ALTER TABLE public.virtual_hubs ALTER COLUMN identity_key SET NOT NULL;

-- 2) Re-enable user triggers
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT relname FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t.relname);
  END LOOP;
END;
$$;

-- 3) Re-attach BOTH signup triggers exactly as production had them
-- (base row + hobbeast enrichment; both are conflict-safe, firing order is
-- alphabetical just like on the retired project).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_hobbeast ON auth.users;
CREATE TRIGGER on_auth_user_created_hobbeast
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 4) Repoint the internal Edge Function base URL at the current project
UPDATE public.app_runtime_config
SET options = jsonb_set(coalesce(options, '{}'::jsonb), '{url}', to_jsonb(:'edge_base_url'::text)),
    updated_at = now()
WHERE key = 'internal_edge_function_base_url';
