-- ============================================================
-- Migration: 005 — Mensalidades
-- ============================================================
create table if not exists public.mensalidades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  cliente_nome    text not null,
  descricao       text not null,
  valor           numeric(15, 2) not null,
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  status          text not null default 'ativo' check (status in ('ativo', 'inativo')),
  data_inicio     date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mensalidades_user_id_idx on public.mensalidades (user_id, created_at desc);

create trigger mensalidades_updated_at
  before update on public.mensalidades
  for each row execute procedure public.set_updated_at();

alter table public.mensalidades enable row level security;
create policy "mensalidades: próprio usuário" on public.mensalidades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
