-- ============================================================
-- Migration: 036 — Rastreamento de churn de clientes
-- Adiciona campo ativo em clients e tabela churn_events para
-- registrar motivo, MRR perdido e comentário ao desativar.
-- ============================================================

alter table public.clients
  add column if not exists ativo boolean not null default true;

create table if not exists public.churn_events (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  client_id    uuid not null references public.clients(id) on delete cascade,
  motivo       text not null check (motivo in (
                 'preco','concorrencia','projeto_encerrado',
                 'insatisfeito','internalizou','inadimplencia','outro')),
  comentario   text,
  mrr_perdido  numeric(12,2) not null default 0,
  data_churn   date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists churn_events_client_idx on public.churn_events (client_id);
create index if not exists churn_events_data_idx   on public.churn_events (data_churn desc);

drop trigger if exists churn_events_set_user_id on public.churn_events;
create trigger churn_events_set_user_id
  before insert on public.churn_events
  for each row execute function public.set_user_id();

alter table public.churn_events enable row level security;

drop policy if exists "churn_events_all" on public.churn_events;
create policy "churn_events_all"
  on public.churn_events for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
