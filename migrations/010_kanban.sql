-- ============================================================
-- Migration 010 — Kanban persistente
-- ============================================================

-- Colunas do Kanban
create table if not exists public.kanban_columns (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete set null,
  title      text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- Tarefas do Kanban
create table if not exists public.kanban_tasks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  column_id    uuid not null references public.kanban_columns(id) on delete cascade,
  title        text not null,
  subtitle     text,
  position     int  not null default 0,
  from_project boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Triggers user_id
drop trigger if exists kanban_columns_set_user_id on public.kanban_columns;
create trigger kanban_columns_set_user_id
  before insert on public.kanban_columns
  for each row execute procedure public.set_user_id();

drop trigger if exists kanban_tasks_set_user_id on public.kanban_tasks;
create trigger kanban_tasks_set_user_id
  before insert on public.kanban_tasks
  for each row execute procedure public.set_user_id();

-- RLS
alter table public.kanban_columns enable row level security;
alter table public.kanban_tasks   enable row level security;

drop policy if exists "kanban_columns_all" on public.kanban_columns;
drop policy if exists "kanban_tasks_all"   on public.kanban_tasks;

create policy "kanban_columns_all"
  on public.kanban_columns for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "kanban_tasks_all"
  on public.kanban_tasks for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
