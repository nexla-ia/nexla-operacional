-- Migration 019 — data limite nas tarefas do Kanban
alter table public.kanban_tasks
  add column if not exists due_date date;
