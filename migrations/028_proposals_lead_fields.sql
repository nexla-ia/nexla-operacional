-- ============================================================
-- Migration: 028 — Propostas: telefone manual para leads sem cadastro
-- ============================================================
alter table public.proposals
  add column if not exists cliente_telefone text;
