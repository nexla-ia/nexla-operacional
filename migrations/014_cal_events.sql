-- Migration 014 — cal_events (reuniões e eventos personalizados)
-- Execute no Supabase SQL Editor.

create table if not exists public.cal_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  title       text not null,
  date        date not null,
  time        time,
  description text,
  tipo        text not null default 'evento' check (tipo in ('reuniao', 'evento')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.cal_events alter column user_id drop not null;

drop trigger if exists cal_events_updated_at  on public.cal_events;
drop trigger if exists cal_events_set_user_id on public.cal_events;

create trigger cal_events_updated_at
  before update on public.cal_events
  for each row execute procedure public.set_updated_at();

create trigger cal_events_set_user_id
  before insert on public.cal_events
  for each row execute procedure public.set_user_id();

alter table public.cal_events enable row level security;

drop policy if exists "cal_events_all" on public.cal_events;

create policy "cal_events_all"
  on public.cal_events for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
