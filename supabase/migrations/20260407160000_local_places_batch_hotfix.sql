-- Hobbeast local places batch hotfix
-- Run after the base local-places schema hotfix if cursor/task_count columns are missing.
-- Also refresh PostgREST schema cache so the new tables become visible to the client API layer.

alter table public.place_sync_state
  add column if not exists cursor integer not null default 0,
  add column if not exists task_count integer not null default 0;

-- Ask PostgREST to reload schema cache so app_runtime_config / place_sync_state
-- become queryable immediately from the client API layer.
notify pgrst, 'reload schema';
