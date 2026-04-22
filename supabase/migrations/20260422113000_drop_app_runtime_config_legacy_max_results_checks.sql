-- Hotfix: remove any legacy app_runtime_config CHECK constraints
-- that still cap local places provider limits at 200 (including max_results naming).

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
    def := lower(pg_get_constraintdef(c.oid));

    if (
      def like '%200%'
      and (
        def like '%geo_limit%'
        or def like '%tomtom_limit%'
        or def like '%max_results%'
        or def like '%geoapify%'
        or def like '%tomtom%'
      )
    ) then
      execute format('alter table public.app_runtime_config drop constraint if exists %I;', c.conname);
    end if;
  end loop;
end $$;
