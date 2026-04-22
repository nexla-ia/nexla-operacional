-- ============================================================
-- Migration 018 — Kanban: cor, project_id; Projects: client_id
-- ============================================================

-- Cor da tarefa (label visual)
alter table public.kanban_tasks
  add column if not exists color text;

-- Vínculo com o projeto de origem
alter table public.kanban_tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Vínculo do projeto com o cliente
alter table public.projects
  add column if not exists client_id uuid references public.clients(id) on delete set null;
