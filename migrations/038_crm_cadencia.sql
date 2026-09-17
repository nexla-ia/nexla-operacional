-- ============================================================
-- Migration: 038 — Réguas de follow-up (cadências) do CRM
-- Um lead novo já nasce com a sequência de toques do comercial
-- (ex.: D1 ligação, D2 WhatsApp, D4 WhatsApp, D6 Instagram…),
-- virando tarefas com data prevista que caem direto na Agenda.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Régua (cadência) ─────────────────────────────────────────
create table if not exists public.crm_cadences (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  nome       text not null,
  descricao  text,
  padrao     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Toques da régua ──────────────────────────────────────────
-- dia_offset: dias após a entrada do lead (0 = mesmo dia)
create table if not exists public.crm_cadence_steps (
  id          uuid primary key default uuid_generate_v4(),
  cadence_id  uuid not null references public.crm_cadences (id) on delete cascade,
  posicao     integer not null default 0,
  dia_offset  integer not null default 0,
  canal       text not null default 'whatsapp'
                check (canal in ('ligacao', 'whatsapp', 'email', 'instagram', 'reuniao', 'outro')),
  titulo      text not null,
  descricao   text,
  created_at  timestamptz not null default now()
);

-- ── Tarefas ganham canal e vínculo com a régua ───────────────
alter table public.crm_tasks
  add column if not exists canal      text
    check (canal in ('ligacao', 'whatsapp', 'email', 'instagram', 'reuniao', 'outro')),
  add column if not exists cadence_id uuid references public.crm_cadences (id)      on delete set null,
  add column if not exists step_id    uuid references public.crm_cadence_steps (id) on delete set null,
  add column if not exists dia_offset integer;

-- ── Índices ──────────────────────────────────────────────────
create index if not exists crm_cadence_steps_cad_idx on public.crm_cadence_steps (cadence_id, posicao);
create index if not exists crm_tasks_cadence_idx     on public.crm_tasks (cadence_id);

-- ── Triggers ─────────────────────────────────────────────────
drop trigger if exists crm_cadences_updated_at on public.crm_cadences;
create trigger crm_cadences_updated_at
  before update on public.crm_cadences
  for each row execute procedure public.set_updated_at();

drop trigger if exists crm_cadences_set_user_id on public.crm_cadences;
create trigger crm_cadences_set_user_id
  before insert on public.crm_cadences
  for each row execute procedure public.set_user_id();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.crm_cadences      enable row level security;
alter table public.crm_cadence_steps enable row level security;

drop policy if exists "crm_cadences_all"      on public.crm_cadences;
drop policy if exists "crm_cadence_steps_all" on public.crm_cadence_steps;

create policy "crm_cadences_all"      on public.crm_cadences      for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "crm_cadence_steps_all" on public.crm_cadence_steps for all using (auth.uid() is not null) with check (auth.uid() is not null);
