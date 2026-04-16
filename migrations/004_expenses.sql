-- ============================================================
-- Migration: 004 — Despesas (fixas e avulsas)
-- ============================================================
create table if not exists public.expenses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  descricao   text not null,
  valor       numeric(15, 2) not null,
  data        date not null,
  categoria   text,
  tipo        text not null default 'avulsa' check (tipo in ('fixa', 'avulsa')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses (user_id, data desc);

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.set_updated_at();

alter table public.expenses enable row level security;
create policy "expenses: próprio usuário" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
