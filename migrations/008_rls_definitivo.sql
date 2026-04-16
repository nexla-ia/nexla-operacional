-- ============================================================
-- Migration 008 — RLS definitivo: qualquer usuário autenticado
--                 acessa todos os dados da empresa
--
-- EXECUTE NO SUPABASE SQL EDITOR (inclui tudo da 007 também)
-- ============================================================

-- ── Extensão ─────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- FUNÇÃO: preenche user_id automaticamente no INSERT
-- ============================================================
create or replace function public.set_user_id()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- FUNÇÃO: mantém updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- FUNÇÃO: cria perfil ao registrar novo usuário
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TABELA: profiles
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- RLS profiles: qualquer auth pode ler todos; qualquer auth pode atualizar
alter table public.profiles enable row level security;

drop policy if exists "profiles: leitura própria"     on public.profiles;
drop policy if exists "profiles: atualização própria" on public.profiles;
drop policy if exists "profiles: admin lê todos"      on public.profiles;
drop policy if exists "profiles_select_auth"          on public.profiles;
drop policy if exists "profiles_update_any"           on public.profiles;

create policy "profiles_select"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "profiles_insert"
  on public.profiles for insert
  with check (auth.uid() is not null);

create policy "profiles_update"
  on public.profiles for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABELA: projects
-- ============================================================
create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete cascade,
  nome_projeto    text not null,
  tipo_projeto    text,
  nome_cliente    text,
  numero_cliente  text,
  valor           numeric(15, 2),
  data_termino    date,
  descricao       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Remove constraint de tipo_projeto se existir
alter table public.projects drop constraint if exists projects_tipo_projeto_check;

drop trigger if exists projects_updated_at   on public.projects;
drop trigger if exists projects_set_user_id  on public.projects;

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

create trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

alter table public.projects enable row level security;

drop policy if exists "projects: usuário vê os próprios"      on public.projects;
drop policy if exists "projects: usuário insere os próprios"  on public.projects;
drop policy if exists "projects: usuário atualiza os próprios" on public.projects;
drop policy if exists "projects: usuário exclui os próprios"  on public.projects;
drop policy if exists "projects_all"                          on public.projects;

create policy "projects_all"
  on public.projects for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABELA: clients
-- ============================================================
create table if not exists public.clients (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete cascade,
  nome        text not null,
  email       text,
  telefone    text,
  cpf_cnpj    text,
  tipo        text not null default 'PF' check (tipo in ('PF', 'PJ')),
  cidade      text,
  estado      text,
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists clients_updated_at   on public.clients;
drop trigger if exists clients_set_user_id  on public.clients;

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

create trigger clients_set_user_id
  before insert on public.clients
  for each row execute function public.set_user_id();

alter table public.clients enable row level security;

drop policy if exists "clients: próprio usuário" on public.clients;
drop policy if exists "clients_all"              on public.clients;

create policy "clients_all"
  on public.clients for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABELA: expenses
-- ============================================================
create table if not exists public.expenses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete cascade,
  descricao   text not null,
  valor       numeric(15, 2) not null,
  data        date not null,
  categoria   text,
  tipo        text not null default 'avulsa' check (tipo in ('fixa', 'avulsa')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists expenses_updated_at   on public.expenses;
drop trigger if exists expenses_set_user_id  on public.expenses;

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.set_updated_at();

create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute function public.set_user_id();

alter table public.expenses enable row level security;

drop policy if exists "expenses: próprio usuário" on public.expenses;
drop policy if exists "expenses_all"              on public.expenses;

create policy "expenses_all"
  on public.expenses for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABELA: mensalidades
-- ============================================================
create table if not exists public.mensalidades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete cascade,
  cliente_nome    text not null,
  descricao       text not null,
  valor           numeric(15, 2) not null,
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  status          text not null default 'ativo' check (status in ('ativo', 'inativo')),
  data_inicio     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Garante que data_inicio aceita null
alter table public.mensalidades alter column data_inicio drop not null;

drop trigger if exists mensalidades_updated_at   on public.mensalidades;
drop trigger if exists mensalidades_set_user_id  on public.mensalidades;

create trigger mensalidades_updated_at
  before update on public.mensalidades
  for each row execute procedure public.set_updated_at();

create trigger mensalidades_set_user_id
  before insert on public.mensalidades
  for each row execute function public.set_user_id();

alter table public.mensalidades enable row level security;

drop policy if exists "mensalidades: próprio usuário" on public.mensalidades;
drop policy if exists "mensalidades_all"              on public.mensalidades;

create policy "mensalidades_all"
  on public.mensalidades for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABELA: project_entries
-- ============================================================
create table if not exists public.project_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users (id) on delete cascade,
  nome_projeto  text not null,
  descricao     text,
  valor         numeric(15, 2) not null,
  data          date not null,
  status        text not null default 'pendente' check (status in ('pendente', 'recebido')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists project_entries_updated_at   on public.project_entries;
drop trigger if exists project_entries_set_user_id  on public.project_entries;

create trigger project_entries_updated_at
  before update on public.project_entries
  for each row execute procedure public.set_updated_at();

create trigger project_entries_set_user_id
  before insert on public.project_entries
  for each row execute function public.set_user_id();

alter table public.project_entries enable row level security;

drop policy if exists "project_entries: próprio usuário" on public.project_entries;
drop policy if exists "project_entries_all"              on public.project_entries;

create policy "project_entries_all"
  on public.project_entries for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
