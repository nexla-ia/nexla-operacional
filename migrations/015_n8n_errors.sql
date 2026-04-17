-- Migration 015 — n8n_errors
-- Armazena erros enviados pelos fluxos n8n via webhook.
-- Execute no Supabase SQL Editor.

create table if not exists public.n8n_errors (
  id          uuid primary key default uuid_generate_v4(),
  payload     jsonb not null,               -- JSON completo enviado pelo n8n
  resolved    boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.n8n_errors enable row level security;

-- n8n insere diretamente via REST API com a anon key (sem autenticação)
drop policy if exists "n8n_errors_insert" on public.n8n_errors;
create policy "n8n_errors_insert"
  on public.n8n_errors for insert
  to anon, authenticated
  with check (true);

-- Apenas usuários autenticados leem e atualizam
drop policy if exists "n8n_errors_select" on public.n8n_errors;
create policy "n8n_errors_select"
  on public.n8n_errors for select
  using (auth.uid() is not null);

drop policy if exists "n8n_errors_update" on public.n8n_errors;
create policy "n8n_errors_update"
  on public.n8n_errors for update
  using (auth.uid() is not null);

drop policy if exists "n8n_errors_delete" on public.n8n_errors;
create policy "n8n_errors_delete"
  on public.n8n_errors for delete
  using (auth.uid() is not null);

-- Índice para busca rápida de não resolvidos
create index if not exists n8n_errors_resolved_idx on public.n8n_errors (resolved, created_at desc);
