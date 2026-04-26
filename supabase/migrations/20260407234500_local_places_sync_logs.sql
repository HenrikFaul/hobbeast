-- Local places sync logs viewer support
create table if not exists public.place_sync_logs (
  id bigserial primary key,
  run_id uuid,
  created_at timestamptz not null default now(),
  level text not null default 'info',
  event text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_place_sync_logs_created_at_desc
  on public.place_sync_logs (created_at desc);

create index if not exists idx_place_sync_logs_run_id
  on public.place_sync_logs (run_id);

alter table public.place_sync_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_sync_logs'
      and policyname = 'Authenticated users can read place sync logs'
  ) then
    create policy "Authenticated users can read place sync logs"
      on public.place_sync_logs
      for select
      to authenticated
      using (true);
  end if;
end $$;
