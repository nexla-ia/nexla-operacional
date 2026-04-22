-- Migration 022 — Dia de vencimento para despesas fixas
alter table public.expenses
  add column if not exists dia_vencimento integer check (dia_vencimento between 1 and 31);
