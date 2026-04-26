-- Geodata db:* address provider configuration.
-- Replaces the retired local catalog runtime provider with configurable
-- Supabase Geodata table providers exposed as db:<provider-id>.

-- app_runtime_config.provider used to have strict enumerations in older
-- migrations. db:* values must be accepted for runtime address-search groups.
do $$
begin
  execute 'alter table public.app_runtime_config drop constraint if exists app_runtime_config_provider_check';
exception when others then null;
end
$$;

alter table public.app_runtime_config
  add constraint app_runtime_config_provider_check
  check (
    provider in (
      'aws',
      'geoapify',
      'tomtom',
      'geoapify_tomtom',
      'mapy',
      'supabase',
      'address_manager'
    )
    or provider like 'db:%'
  )
  not valid;

-- Seed the Geodata configuration row without preselecting any table. The UI
-- configurator owns the concrete list of enabled db:* providers.
insert into public.app_runtime_config (key, provider, options)
values (
  'address_search:db_tables',
  'supabase',
  jsonb_build_object(
    'geodata_url', 'https://buuoyyfzincmbxafvihc.supabase.co',
    'tables', '[]'::jsonb
  )
)
on conflict (key) do update
set provider = 'supabase',
    options = coalesce(public.app_runtime_config.options, '{}'::jsonb) || excluded.options;

-- Retire historical local catalog provider settings so old persisted values
-- cannot keep the removed UI/backend path alive.
update public.app_runtime_config
set provider = 'geoapify_tomtom'
where key like 'address_search%'
  and provider = 'local_catalog';

notify pgrst, 'reload schema';
