-- v1.6.7 hotfix: runtime provider configuration store for Geodata db:* providers.
-- Safe/idempotent migration. It does not touch event/customer/business data.

create table if not exists public.app_runtime_config (
  key text primary key,
  provider text,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_runtime_config
  add column if not exists provider text,
  add column if not exists options jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_runtime_config_updated_at on public.app_runtime_config;
create trigger trg_app_runtime_config_updated_at
before update on public.app_runtime_config
for each row execute function public.set_updated_at();

alter table public.app_runtime_config enable row level security;

-- Public clients should not read/write this table directly. The place-search Edge Function uses service role.
-- Service role bypasses RLS, so no broad public policy is needed here.

insert into public.app_runtime_config (key, provider, options)
values
  ('address_search', 'geoapify_tomtom', '{}'::jsonb),
  ('address_search:venue', 'geoapify_tomtom', '{}'::jsonb),
  ('address_search:db_tables', 'supabase', '{"geodata_url":"https://buuoyyfzincmbxafvihc.supabase.co","tables":[]}'::jsonb)
on conflict (key) do nothing;
