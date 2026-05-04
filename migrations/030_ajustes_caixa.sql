-- ============================================================
-- Migration: 030 — Ajustes manuais de caixa
-- Cada linha é uma correção do saldo (positiva ou negativa)
-- aplicada sobre o cálculo automático.
-- ============================================================
create table if not exists public.ajustes_caixa (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
  valor       numeric(15, 2) not null,
  descricao   text,
  data        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists ajustes_caixa_data_idx
  on public.ajustes_caixa (data desc);

drop trigger if exists ajustes_caixa_set_user_id on public.ajustes_caixa;
create trigger ajustes_caixa_set_user_id
  before insert on public.ajustes_caixa
  for each row execute function public.set_user_id();

alter table public.ajustes_caixa enable row level security;

drop policy if exists "ajustes_caixa_all" on public.ajustes_caixa;
create policy "ajustes_caixa_all"
  on public.ajustes_caixa for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
