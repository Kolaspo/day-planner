-- Day Planner schema. Run once in Supabase → SQL Editor (or `supabase db push`).
-- Every table is locked to its owner with Row Level Security.

create extension if not exists pgcrypto;

-- ── Settings (one row per user) ─────────────────────────────────────────────
create table if not exists public.settings (
  user_id        uuid primary key default auth.uid() references auth.users on delete cascade,
  day_start      time    not null default '08:00',
  day_end        time    not null default '22:00',
  buffer_minutes integer not null default 10 check (buffer_minutes between 0 and 120),
  use_learning   boolean not null default true,
  include_q4     boolean not null default false,
  updated_at     timestamptz not null default now(),
  check (day_end > day_start)
);

-- ── Calendar sources (private ICS links, encrypted by the server) ───────────
create table if not exists public.calendar_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  provider      text not null check (provider in ('google', 'outlook', 'other')),
  color         text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  url_encrypted text not null,
  created_at    timestamptz not null default now()
);
create index if not exists calendar_sources_user_idx on public.calendar_sources (user_id);

-- ── Tasks ───────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  category         text check (category is null or char_length(category) <= 60),
  notes            text check (notes is null or char_length(notes) <= 2000),
  estimate_minutes integer not null check (estimate_minutes between 5 and 600),
  quadrant         smallint check (quadrant between 1 and 4), -- 1 urgent+important, 2 important, 3 urgent, 4 neither
  due_date         date,
  planned_start    timestamptz,
  planned_end      timestamptz,
  status           text not null default 'todo' check (status in ('todo', 'done')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((planned_start is null) = (planned_end is null)),
  check (planned_end is null or planned_end > planned_start)
);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_planned_idx on public.tasks (user_id, planned_start);

-- ── Time entries (each start/resume → pause/finish is one entry) ────────────
create table if not exists public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  task_id    uuid not null references public.tasks on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists time_entries_task_idx on public.time_entries (task_id);
create index if not exists time_entries_user_started_idx on public.time_entries (user_id, started_at);
-- Only one timer may run at a time.
create unique index if not exists time_entries_one_running on public.time_entries (user_id) where ended_at is null;

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.settings         enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.tasks            enable row level security;
alter table public.time_entries     enable row level security;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own calendar sources" on public.calendar_sources;
create policy "own calendar sources" on public.calendar_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own time entries" on public.time_entries;
create policy "own time entries" on public.time_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );

-- ── Live sync between phone and PC ──────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.tasks;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.time_entries; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.settings;     exception when duplicate_object then null; end;
end $$;
