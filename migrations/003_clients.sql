-- ============================================================
-- Migration: 003 — Tabela de Clientes
-- ============================================================
create table if not exists public.clients (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  nome        text not null,
  email       text,
  telefone    text,
  cpf_cnpj    text,
  tipo        text not null default 'PF' check (tipo in ('PF', 'PJ')),
  cidade      text,
  estado      text,
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clients_user_id_idx on public.clients (user_id, created_at desc);

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

alter table public.clients enable row level security;
create policy "clients: próprio usuário" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
