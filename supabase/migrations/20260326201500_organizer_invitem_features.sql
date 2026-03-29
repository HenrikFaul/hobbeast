alter table public.events
  add column if not exists waitlist_enabled boolean default false,
  add column if not exists visibility_type text default 'public',
  add column if not exists participation_type text default 'free',
  add column if not exists organizer_notes text,
  add column if not exists external_ticket_url text,
  add column if not exists entry_start_at timestamptz,
  add column if not exists entry_end_at timestamptz;

alter table public.event_participants
  add column if not exists status text default 'going',
  add column if not exists checked_in_at timestamptz,
  add column if not exists organizer_note text,
  add column if not exists invite_code text,
  add column if not exists ticket_token text,
  add column if not exists status_updated_at timestamptz default now();

update public.event_participants
set status = coalesce(status, 'going'), status_updated_at = coalesce(status_updated_at, now())
where status is null or status_updated_at is null;

create table if not exists public.participation_audits (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.event_participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null,
  audience_filter text not null,
  subject text,
  body text not null,
  delivery_state text not null default 'draft',
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_event_reminders boolean not null default true,
  reminder_hours_before integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.participation_audits enable row level security;
alter table public.event_messages enable row level security;
alter table public.user_reminder_preferences enable row level security;

create policy if not exists "Owners can manage participants on owned events" on public.event_participants
  for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_participants.event_id and e.created_by = auth.uid()));

create policy if not exists "Owners can read audits on owned events" on public.participation_audits
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = participation_audits.event_id and e.created_by = auth.uid()));
create policy if not exists "Owners can write audits on owned events" on public.participation_audits
  for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = participation_audits.event_id and e.created_by = auth.uid()));

create policy if not exists "Owners can read messages on owned events" on public.event_messages
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_messages.event_id and e.created_by = auth.uid()));
create policy if not exists "Owners can write messages on owned events" on public.event_messages
  for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_messages.event_id and e.created_by = auth.uid()));

create policy if not exists "Users can read own reminder preferences" on public.user_reminder_preferences
  for select to authenticated using (auth.uid() = user_id);
create policy if not exists "Users can insert own reminder preferences" on public.user_reminder_preferences
  for insert to authenticated with check (auth.uid() = user_id);
create policy if not exists "Users can update own reminder preferences" on public.user_reminder_preferences
  for update to authenticated using (auth.uid() = user_id);
