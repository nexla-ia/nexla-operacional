-- Migration 017: adiciona coluna resolved_by em n8n_errors
alter table public.n8n_errors
  add column if not exists resolved_by text;
