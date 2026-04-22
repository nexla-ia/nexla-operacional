-- Migration 021 — Cascade: cliente → projetos → tarefas kanban
-- Apagar cliente apaga seus projetos; apagar projeto apaga suas tarefas do kanban.

-- 1. projects.client_id: SET NULL → CASCADE
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_client_id_fkey;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id)
  ON DELETE CASCADE;

-- 2. kanban_tasks.project_id: SET NULL → CASCADE
ALTER TABLE public.kanban_tasks
  DROP CONSTRAINT IF EXISTS kanban_tasks_project_id_fkey;

ALTER TABLE public.kanban_tasks
  ADD CONSTRAINT kanban_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id)
  ON DELETE CASCADE;
