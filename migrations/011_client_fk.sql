-- ============================================================
-- Migration 011 — FK client_id em mensalidades e project_entries
-- ============================================================

-- Adiciona client_id às mensalidades (opcional para retrocompatibilidade)
alter table public.mensalidades
  add column if not exists client_id uuid references public.clients(id) on delete set null;

-- Adiciona client_id às entradas de projetos
alter table public.project_entries
  add column if not exists client_id uuid references public.clients(id) on delete set null;
