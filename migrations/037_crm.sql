-- ============================================================
-- Migration: 037 — CRM de Vendas
-- Funis, etapas, leads, interações e tarefas de follow-up.
-- Leads são cadastrados manualmente pelo vendedor (não vêm de
-- conversa/automação) e todo contato vira interação no histórico.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Funis (quadros de venda) ─────────────────────────────────
create table if not exists public.crm_funnels (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  nome       text not null,
  posicao    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Etapas do funil (colunas do board) ───────────────────────
-- tipo: 'aberto' = etapa normal | 'ganho' e 'perdido' fecham o lead
create table if not exists public.crm_stages (
  id          uuid primary key default uuid_generate_v4(),
  funil_id    uuid not null references public.crm_funnels (id) on delete cascade,
  nome        text not null,
  cor         text not null default '#6366f1',
  posicao     integer not null default 0,
  alerta_dias integer,
  tipo        text not null default 'aberto' check (tipo in ('aberto', 'ganho', 'perdido')),
  created_at  timestamptz not null default now()
);

-- ── Leads ────────────────────────────────────────────────────
create table if not exists public.crm_leads (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid references auth.users (id) on delete set null,
  funil_id           uuid references public.crm_funnels (id) on delete cascade,
  stage_id           uuid references public.crm_stages  (id) on delete set null,
  nome               text not null,
  empresa            text,
  telefone           text,
  email              text,
  origem             text,
  temperatura        text not null default 'morno' check (temperatura in ('frio', 'morno', 'quente')),
  valor              numeric(12,2) not null default 0,
  valor_recorrente   numeric(12,2) not null default 0,
  tags               text[] not null default '{}',
  responsavel_id     uuid references auth.users (id) on delete set null,
  responsavel_nome   text,
  observacoes        text,
  status             text not null default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  motivo_perda       text,
  proximo_contato    date,
  data_ult_contato   timestamptz,
  data_entrada_etapa timestamptz not null default now(),
  data_fechamento    timestamptz,
  client_id          uuid references public.clients (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Interações (histórico de cada contato com o lead) ────────
create table if not exists public.crm_interactions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  lead_id    uuid not null references public.crm_leads (id) on delete cascade,
  tipo       text not null check (tipo in (
               'nota', 'ligacao', 'whatsapp', 'email', 'reuniao',
               'proposta', 'etapa', 'tarefa', 'ganho', 'perdido')),
  conteudo   text,
  metadata   jsonb,
  autor_nome text,
  created_at timestamptz not null default now()
);

-- ── Tarefas / follow-ups do vendedor ─────────────────────────
create table if not exists public.crm_tasks (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users (id) on delete set null,
  lead_id          uuid not null references public.crm_leads (id) on delete cascade,
  titulo           text not null,
  descricao        text,
  due_date         date,
  concluida        boolean not null default false,
  concluida_em     timestamptz,
  responsavel_id   uuid references auth.users (id) on delete set null,
  responsavel_nome text,
  created_at       timestamptz not null default now()
);

-- ── Índices ──────────────────────────────────────────────────
create index if not exists crm_stages_funil_idx      on public.crm_stages (funil_id, posicao);
create index if not exists crm_leads_funil_idx       on public.crm_leads (funil_id);
create index if not exists crm_leads_stage_idx       on public.crm_leads (stage_id);
create index if not exists crm_leads_responsavel_idx on public.crm_leads (responsavel_id);
create index if not exists crm_leads_status_idx      on public.crm_leads (status, data_fechamento desc);
create index if not exists crm_interactions_lead_idx on public.crm_interactions (lead_id, created_at desc);
create index if not exists crm_tasks_lead_idx        on public.crm_tasks (lead_id);
create index if not exists crm_tasks_due_idx         on public.crm_tasks (concluida, due_date);

-- ── Triggers ─────────────────────────────────────────────────
drop trigger if exists crm_funnels_updated_at on public.crm_funnels;
create trigger crm_funnels_updated_at
  before update on public.crm_funnels
  for each row execute procedure public.set_updated_at();

drop trigger if exists crm_leads_updated_at on public.crm_leads;
create trigger crm_leads_updated_at
  before update on public.crm_leads
  for each row execute procedure public.set_updated_at();

drop trigger if exists crm_funnels_set_user_id on public.crm_funnels;
create trigger crm_funnels_set_user_id
  before insert on public.crm_funnels
  for each row execute procedure public.set_user_id();

drop trigger if exists crm_leads_set_user_id on public.crm_leads;
create trigger crm_leads_set_user_id
  before insert on public.crm_leads
  for each row execute procedure public.set_user_id();

drop trigger if exists crm_interactions_set_user_id on public.crm_interactions;
create trigger crm_interactions_set_user_id
  before insert on public.crm_interactions
  for each row execute procedure public.set_user_id();

drop trigger if exists crm_tasks_set_user_id on public.crm_tasks;
create trigger crm_tasks_set_user_id
  before insert on public.crm_tasks
  for each row execute procedure public.set_user_id();

-- ── RLS: qualquer usuário autenticado acessa (mesmo padrão do app) ──
alter table public.crm_funnels      enable row level security;
alter table public.crm_stages       enable row level security;
alter table public.crm_leads        enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_tasks        enable row level security;

drop policy if exists "crm_funnels_all"      on public.crm_funnels;
drop policy if exists "crm_stages_all"       on public.crm_stages;
drop policy if exists "crm_leads_all"        on public.crm_leads;
drop policy if exists "crm_interactions_all" on public.crm_interactions;
drop policy if exists "crm_tasks_all"        on public.crm_tasks;

create policy "crm_funnels_all"      on public.crm_funnels      for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "crm_stages_all"       on public.crm_stages       for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "crm_leads_all"        on public.crm_leads        for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "crm_interactions_all" on public.crm_interactions for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "crm_tasks_all"        on public.crm_tasks        for all using (auth.uid() is not null) with check (auth.uid() is not null);
