-- Migration 013 — Reduz cargos para admin e operator
-- Execute no Supabase SQL Editor.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'operator'));

-- Converte qualquer viewer existente para operator
update public.profiles set role = 'operator' where role = 'viewer';

-- Ajusta o default e o trigger
alter table public.profiles
  alter column role set default 'operator';
