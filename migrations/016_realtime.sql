-- Migration 016 — Habilita Realtime para as tabelas que precisam de atualização ao vivo
-- Execute no Supabase SQL Editor.

-- Adiciona as tabelas à publicação padrão do Supabase (supabase_realtime)
-- Isso permite que o cliente JS receba eventos INSERT/UPDATE/DELETE em tempo real.

alter publication supabase_realtime add table public.n8n_errors;
alter publication supabase_realtime add table public.kanban_tasks;
alter publication supabase_realtime add table public.projects;
