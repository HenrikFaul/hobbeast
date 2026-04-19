begin;

alter table public.events
  add column if not exists start_time timestamp with time zone;

alter table public.events
  add column if not exists end_time timestamp with time zone;

alter table public.events
  add column if not exists organizer_id uuid;

alter table public.events
  add column if not exists created_by uuid;

update public.events
set place_categories = '{}'::text[]
where place_categories is null;

alter table public.events
  alter column place_categories set default '{}'::text[];

create unique index if not exists hobby_categories_slug_uidx on public.hobby_categories(slug);
create unique index if not exists hobby_subcategories_slug_uidx on public.hobby_subcategories(slug);
create unique index if not exists hobby_activities_slug_uidx on public.hobby_activities(slug);
create unique index if not exists notification_preferences_user_id_uidx on public.notification_preferences(user_id);

commit;
