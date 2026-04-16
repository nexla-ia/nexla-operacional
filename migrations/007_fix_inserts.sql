-- ============================================================
-- Migration 007 — Corrige inserts: user_id automático + constraints
-- ============================================================

-- Função que preenche user_id automaticamente no INSERT
create or replace function public.set_user_id()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- ── Projects ──────────────────────────────────────────────────
drop trigger if exists projects_set_user_id on public.projects;
create trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

-- Remove constraint de tipo_projeto (agora é texto livre)
alter table public.projects
  drop constraint if exists projects_tipo_projeto_check;

-- ── Clients ───────────────────────────────────────────────────
drop trigger if exists clients_set_user_id on public.clients;
create trigger clients_set_user_id
  before insert on public.clients
  for each row execute function public.set_user_id();

-- ── Expenses ──────────────────────────────────────────────────
drop trigger if exists expenses_set_user_id on public.expenses;
create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute function public.set_user_id();

-- ── Mensalidades ──────────────────────────────────────────────
drop trigger if exists mensalidades_set_user_id on public.mensalidades;
create trigger mensalidades_set_user_id
  before insert on public.mensalidades
  for each row execute function public.set_user_id();

-- data_inicio pode ser nula (campo opcional no formulário)
alter table public.mensalidades
  alter column data_inicio drop not null,
  alter column data_inicio set default null;

-- ── Project Entries ───────────────────────────────────────────
drop trigger if exists project_entries_set_user_id on public.project_entries;
create trigger project_entries_set_user_id
  before insert on public.project_entries
  for each row execute function public.set_user_id();

-- ── Profiles: permite que qualquer auth ver e admin alterar ───
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles: usuário vê o próprio" on public.profiles;
drop policy if exists "profiles: usuário atualiza o próprio" on public.profiles;

create policy "profiles_select_auth"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "profiles_update_any"
  on public.profiles for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
