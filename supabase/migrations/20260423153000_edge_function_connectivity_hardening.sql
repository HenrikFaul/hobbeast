-- Edge function connectivity hardening for Address Manager / sync-local-places

-- 1) Ensure internal edge base URL is canonical (no trailing slash)
insert into public.app_runtime_config (key, provider, options)
values (
  'internal_edge_function_base_url',
  'supabase',
  jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co')
)
on conflict (key) do update
set provider = excluded.provider,
    options = jsonb_build_object('url', 'https://dsymdijzydaehntlmfzl.supabase.co'),
    updated_at = now();

-- 2) Drop app_runtime_config CHECK constraints that constrain JSON options content.
do $$
declare
  c record;
  def text;
begin
  for c in
    select conname, oid
    from pg_constraint
    where conrelid = 'public.app_runtime_config'::regclass
      and contype = 'c'
  loop
    def := pg_get_constraintdef(c.oid);
    if def ilike '%options%'
       or def ilike '%geo_limit%'
       or def ilike '%tomtom_limit%'
       or def ilike '%max_results%'
       or def ilike '%internal_edge_function_base_url%'
    then
      execute format('alter table public.app_runtime_config drop constraint if exists %I', c.conname);
    end if;
  end loop;
end
$$;

-- 3) Normalize URL resolver to always strip trailing slash.
create or replace function public.resolve_internal_edge_function_base_url()
returns text
language sql
security definer
set search_path = public
as $$
  select rtrim(coalesce(
    (
      select nullif(trim(options ->> 'url'), '')
      from public.app_runtime_config
      where key = 'internal_edge_function_base_url'
      limit 1
    ),
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'project_url' limit 1),
    (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
  ), '/');
$$;

notify pgrst, 'reload schema';
