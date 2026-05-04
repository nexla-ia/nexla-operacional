-- ============================================================
-- Migration: 029 — Projetos: campo de valor já recebido
-- ============================================================
alter table public.projects
  add column if not exists valor_recebido numeric(15, 2) not null default 0;
