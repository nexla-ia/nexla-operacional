-- ============================================================
-- Migration: 027 — Propostas comerciais
-- ============================================================
create table if not exists public.proposals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,

  client_id       uuid references public.clients (id) on delete set null,
  cliente_nome    text not null,
  titulo          text not null,
  descricao       text,

  setup_valor     numeric(15, 2) not null default 0,
  mensalidade_valor numeric(15, 2) not null default 0,
  recorrencia     text not null default 'mensal'
                    check (recorrencia in ('mensal', 'semestral', 'anual')),

  status          text not null default 'enviada'
                    check (status in ('enviada', 'aceita', 'recusada', 'rascunho')),

  data_envio      date,
  observacoes     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists proposals_user_id_idx
  on public.proposals (user_id, created_at desc);

create index if not exists proposals_client_id_idx
  on public.proposals (client_id);

drop trigger if exists proposals_updated_at  on public.proposals;
drop trigger if exists proposals_set_user_id on public.proposals;

create trigger proposals_updated_at
  before update on public.proposals
  for each row execute procedure public.set_updated_at();

create trigger proposals_set_user_id
  before insert on public.proposals
  for each row execute function public.set_user_id();

alter table public.proposals enable row level security;

drop policy if exists "proposals_all" on public.proposals;
create policy "proposals_all"
  on public.proposals for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
