-- ============================================================
-- Migration: 006 — Entradas de Projetos
-- ============================================================
create table if not exists public.project_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  nome_projeto  text not null,
  descricao     text,
  valor         numeric(15, 2) not null,
  data          date not null,
  status        text not null default 'pendente' check (status in ('pendente', 'recebido')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_entries_user_id_idx on public.project_entries (user_id, data desc);

create trigger project_entries_updated_at
  before update on public.project_entries
  for each row execute procedure public.set_updated_at();

alter table public.project_entries enable row level security;
create policy "project_entries: próprio usuário" on public.project_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
