-- Remove legacy hard caps (<=200) from app_runtime_config options checks
-- so Geoapify/TomTom max result settings can be saved above 200.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.app_runtime_config'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%geo_limit%'
      and pg_get_constraintdef(oid) ilike '%200%'
  loop
    execute format('alter table public.app_runtime_config drop constraint if exists %I;', c.conname);
  end loop;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.app_runtime_config'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tomtom_limit%'
      and pg_get_constraintdef(oid) ilike '%200%'
  loop
    execute format('alter table public.app_runtime_config drop constraint if exists %I;', c.conname);
  end loop;
end $$;
