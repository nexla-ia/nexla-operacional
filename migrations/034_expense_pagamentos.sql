-- ============================================================
-- Migration: 034 — Pagamentos mensais de despesas fixas
-- Cada fixa pode ser quitada mês a mês — antes o campo `pago` era
-- booleano global, perdendo histórico ao reabrir o mês seguinte.
-- ============================================================
create table if not exists public.expense_pagamentos (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,
  expense_id      uuid not null references public.expenses (id) on delete cascade,
  mes             text not null,             -- YYYY-MM
  data_pagamento  date,                      -- data efetiva da quitação
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (expense_id, mes)
);

create index if not exists expense_pagamentos_mes_idx
  on public.expense_pagamentos (mes);

drop trigger if exists expense_pagamentos_updated_at on public.expense_pagamentos;
create trigger expense_pagamentos_updated_at
  before update on public.expense_pagamentos
  for each row execute procedure public.set_updated_at();

drop trigger if exists expense_pagamentos_set_user_id on public.expense_pagamentos;
create trigger expense_pagamentos_set_user_id
  before insert on public.expense_pagamentos
  for each row execute function public.set_user_id();

alter table public.expense_pagamentos enable row level security;

drop policy if exists "expense_pagamentos_all" on public.expense_pagamentos;
create policy "expense_pagamentos_all"
  on public.expense_pagamentos for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
