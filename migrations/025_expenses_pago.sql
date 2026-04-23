-- Migration: 025 — Adiciona campo pago nas despesas
alter table public.expenses
  add column if not exists pago boolean not null default false;
