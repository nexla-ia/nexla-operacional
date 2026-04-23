-- Migration: 026 — Status de pagamento mensal por cliente (Cobranças)
create table if not exists public.cobranca_pagamentos (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  mes        text not null, -- formato: 'YYYY-MM'
  status     text not null default 'nao_pago' check (status in ('pago', 'nao_pago')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id, mes)
);

create index if not exists cobranca_pagamentos_user_mes_idx on public.cobranca_pagamentos (user_id, mes);

create trigger cobranca_pagamentos_updated_at
  before update on public.cobranca_pagamentos
  for each row execute procedure public.set_updated_at();

alter table public.cobranca_pagamentos enable row level security;
create policy "cobranca_pagamentos: próprio usuário" on public.cobranca_pagamentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
