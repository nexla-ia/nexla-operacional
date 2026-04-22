-- Migration 020 — flag "importante" nas tarefas do Kanban
alter table public.kanban_tasks
  add column if not exists important boolean not null default false;
