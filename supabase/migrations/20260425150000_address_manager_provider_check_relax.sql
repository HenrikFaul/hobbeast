-- Address Manager: relax app_runtime_config provider check.
-- Some projects already have rows where provider IN ('geoapify','tomtom')
-- separately — the v1.6.2 migration's ADD CONSTRAINT then fails with
-- "violates check constraint", which leaves the constraint missing AND
-- means deploys silently misbehave. Re-define the check with a
-- superset that accepts ALL historical values, validated NOT VALID so
-- existing rows can never block the deploy.

do $$
begin
  execute 'alter table public.app_runtime_config drop constraint if exists app_runtime_config_provider_check';
exception when others then null;
end
$$;

alter table public.app_runtime_config
  add constraint app_runtime_config_provider_check
  check (provider in (
    'aws',
    'geoapify',
    'tomtom',
    'geoapify_tomtom',
    'local_catalog',
    'supabase',
    'address_manager'
  ))
  not valid;

-- Don't VALIDATE — we don't care about historical rows.

-- Make sure the schema cache is refreshed for the freshly created tables.
notify pgrst, 'reload schema';
