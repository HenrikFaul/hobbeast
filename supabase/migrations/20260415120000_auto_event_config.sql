-- Auto event config table for AI-based hub event generation
create table if not exists public.auto_event_config (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  min_members integer not null default 5,
  max_distance_km numeric not null default 30,
  frequency_days integer not null default 7,
  max_events_per_run integer not null default 10,
  categories_filter text[],
  last_run_at timestamptz,
  last_run_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auto_event_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'auto_event_config'
      and policyname = 'Admins can manage auto_event_config'
  ) then
    create policy "Admins can manage auto_event_config"
      on public.auto_event_config for all
      to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

notify pgrst, 'reload schema';
