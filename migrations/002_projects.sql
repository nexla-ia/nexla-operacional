-- ============================================================
-- Migration: 002 — Tabela de Projetos
-- Projeto: Nexla Operacional
-- ============================================================

create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  nome_projeto    text        not null,
  tipo_projeto    text        not null default 'outro'
                    check (tipo_projeto in (
                      'web', 'mobile', 'desktop', 'api',
                      'consultoria', 'design', 'outro'
                    )),
  nome_cliente    text,
  numero_cliente  text,
  valor           numeric(15, 2),
  data_termino    date,
  descricao       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índice para listagem por usuário
create index if not exists projects_user_id_idx
  on public.projects (user_id, created_at desc);

-- Trigger de updated_at (reutiliza a função criada em 001)
create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────

alter table public.projects enable row level security;

create policy "projects: usuário vê os próprios"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: usuário insere os próprios"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "projects: usuário atualiza os próprios"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: usuário exclui os próprios"
  on public.projects for delete
  using (auth.uid() = user_id);
