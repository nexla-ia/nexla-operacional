-- ============================================================
-- Setup Nexla Operacional em banco Supabase COMPARTILHADO
-- Gerado a partir de migrations/001..038 com:
--   * profiles / handle_new_user / on_auth_user_created / set_updated_at /
--     set_user_id renomeados com prefixo nexla_ (colidiam com outro projeto)
--   * sem trigger em auth.users (perfil é criado explicitamente pelo app)
--   * RLS "auth.uid() is not null" -> nexla_is_member(), para que usuários
--     de outros apps no mesmo auth não acessem os dados da Nexla
-- ============================================================

create or replace function public.nexla_is_member()
returns boolean language plpgsql stable security definer
set search_path = public as $$
begin
  return exists (select 1 from public.nexla_profiles where id = auth.uid());
end;
$$;


-- >>>>> migrations/001_initial_schema.sql
-- ============================================================
-- Migration: 001 — Schema inicial
-- Projeto: Nexla Operacional
-- ============================================================

-- ── Extensões necessárias ────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ============================================================
-- TABELA: nexla_profiles
-- Complementa auth.users com dados de perfil do usuário.
-- ============================================================
create table if not exists public.nexla_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger: mantém updated_at sincronizado
create or replace function public.nexla_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.nexla_profiles
  for each row execute procedure public.nexla_set_updated_at();

-- Trigger: cria perfil automaticamente ao registrar usuário
create or replace function public.nexla_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.nexla_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

-- (trigger em auth.users removido: banco compartilhado)


-- ============================================================
-- RLS — nexla_profiles
-- ============================================================
alter table public.nexla_profiles enable row level security;

-- Cada usuário lê e atualiza apenas o próprio perfil
create policy "nexla_profiles: leitura própria"
  on public.nexla_profiles for select
  using (auth.uid() = id);

create policy "nexla_profiles: atualização própria"
  on public.nexla_profiles for update
  using (auth.uid() = id);

-- Admin lê todos os perfis
create policy "nexla_profiles: admin lê todos"
  on public.nexla_profiles for select
  using (
    exists (
      select 1 from public.nexla_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );


-- >>>>> migrations/002_projects.sql
-- ============================================================
-- Migration: 002 — Tabela de Projetos
-- Projeto: Nexla Operacional
-- ============================================================

create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  nome_projeto    text        not null,
  tipo_projeto    text        not null default 'outro'
                    check (tipo_projeto in (
                      'web', 'mobile', 'desktop', 'api',
                      'consultoria', 'design', 'outro'
                    )),
  nome_cliente    text,
  numero_cliente  text,
  valor           numeric(15, 2),
  data_termino    date,
  descricao       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índice para listagem por usuário
create index if not exists projects_user_id_idx
  on public.projects (user_id, created_at desc);

-- Trigger de updated_at (reutiliza a função criada em 001)
create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.nexla_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────

alter table public.projects enable row level security;

create policy "projects: usuário vê os próprios"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: usuário insere os próprios"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "projects: usuário atualiza os próprios"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: usuário exclui os próprios"
  on public.projects for delete
  using (auth.uid() = user_id);


-- >>>>> migrations/003_clients.sql
-- ============================================================
-- Migration: 003 — Tabela de Clientes
-- ============================================================
create table if not exists public.clients (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
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

create index if not exists clients_user_id_idx on public.clients (user_id, created_at desc);

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.nexla_set_updated_at();

alter table public.clients enable row level security;
create policy "clients: próprio usuário" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- >>>>> migrations/004_expenses.sql
-- ============================================================
-- Migration: 004 — Despesas (fixas e avulsas)
-- ============================================================
create table if not exists public.expenses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  descricao   text not null,
  valor       numeric(15, 2) not null,
  data        date not null,
  categoria   text,
  tipo        text not null default 'avulsa' check (tipo in ('fixa', 'avulsa')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses (user_id, data desc);

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.nexla_set_updated_at();

alter table public.expenses enable row level security;
create policy "expenses: próprio usuário" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- >>>>> migrations/005_mensalidades.sql
-- ============================================================
-- Migration: 005 — Mensalidades
-- ============================================================
create table if not exists public.mensalidades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  cliente_nome    text not null,
  descricao       text not null,
  valor           numeric(15, 2) not null,
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  status          text not null default 'ativo' check (status in ('ativo', 'inativo')),
  data_inicio     date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mensalidades_user_id_idx on public.mensalidades (user_id, created_at desc);

create trigger mensalidades_updated_at
  before update on public.mensalidades
  for each row execute procedure public.nexla_set_updated_at();

alter table public.mensalidades enable row level security;
create policy "mensalidades: próprio usuário" on public.mensalidades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- >>>>> migrations/006_project_entries.sql
-- ============================================================
-- Migration: 006 — Entradas de Projetos
-- ============================================================
create table if not exists public.project_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  nome_projeto  text not null,
  descricao     text,
  valor         numeric(15, 2) not null,
  data          date not null,
  status        text not null default 'pendente' check (status in ('pendente', 'recebido')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_entries_user_id_idx on public.project_entries (user_id, data desc);

create trigger project_entries_updated_at
  before update on public.project_entries
  for each row execute procedure public.nexla_set_updated_at();

alter table public.project_entries enable row level security;
create policy "project_entries: próprio usuário" on public.project_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- >>>>> migrations/007_fix_inserts.sql
-- ============================================================
-- Migration 007 — Corrige inserts: user_id automático + constraints
-- ============================================================

-- Função que preenche user_id automaticamente no INSERT
create or replace function public.nexla_set_user_id()
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
  for each row execute function public.nexla_set_user_id();

-- Remove constraint de tipo_projeto (agora é texto livre)
alter table public.projects
  drop constraint if exists projects_tipo_projeto_check;

-- ── Clients ───────────────────────────────────────────────────
drop trigger if exists clients_set_user_id on public.clients;
create trigger clients_set_user_id
  before insert on public.clients
  for each row execute function public.nexla_set_user_id();

-- ── Expenses ──────────────────────────────────────────────────
drop trigger if exists expenses_set_user_id on public.expenses;
create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute function public.nexla_set_user_id();

-- ── Mensalidades ──────────────────────────────────────────────
drop trigger if exists mensalidades_set_user_id on public.mensalidades;
create trigger mensalidades_set_user_id
  before insert on public.mensalidades
  for each row execute function public.nexla_set_user_id();

-- data_inicio pode ser nula (campo opcional no formulário)
alter table public.mensalidades
  alter column data_inicio drop not null,
  alter column data_inicio set default null;

-- ── Project Entries ───────────────────────────────────────────
drop trigger if exists project_entries_set_user_id on public.project_entries;
create trigger project_entries_set_user_id
  before insert on public.project_entries
  for each row execute function public.nexla_set_user_id();

-- ── Profiles: permite que qualquer auth ver e admin alterar ───
drop policy if exists "profiles_select" on public.nexla_profiles;
drop policy if exists "profiles_update" on public.nexla_profiles;
drop policy if exists "nexla_profiles: usuário vê o próprio" on public.nexla_profiles;
drop policy if exists "nexla_profiles: usuário atualiza o próprio" on public.nexla_profiles;

create policy "profiles_select_auth"
  on public.nexla_profiles for select
  using (public.nexla_is_member());

create policy "profiles_update_any"
  on public.nexla_profiles for update
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/008_rls_definitivo.sql
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
create or replace function public.nexla_set_user_id()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- FUNÇÃO: mantém updated_at
-- ============================================================
create or replace function public.nexla_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- FUNÇÃO: cria perfil ao registrar novo usuário
-- ============================================================
create or replace function public.nexla_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.nexla_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists nexla_on_auth_user_created on auth.users;
-- (trigger em auth.users removido: banco compartilhado)

-- ============================================================
-- TABELA: nexla_profiles
-- ============================================================
create table if not exists public.nexla_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.nexla_profiles;
create trigger profiles_updated_at
  before update on public.nexla_profiles
  for each row execute procedure public.nexla_set_updated_at();

-- RLS nexla_profiles: qualquer auth pode ler todos; qualquer auth pode atualizar
alter table public.nexla_profiles enable row level security;

drop policy if exists "nexla_profiles: leitura própria"     on public.nexla_profiles;
drop policy if exists "nexla_profiles: atualização própria" on public.nexla_profiles;
drop policy if exists "nexla_profiles: admin lê todos"      on public.nexla_profiles;
drop policy if exists "profiles_select_auth"          on public.nexla_profiles;
drop policy if exists "profiles_update_any"           on public.nexla_profiles;

create policy "profiles_select"
  on public.nexla_profiles for select
  using (public.nexla_is_member());

create policy "profiles_insert"
  on public.nexla_profiles for insert
  with check (public.nexla_is_member());

create policy "profiles_update"
  on public.nexla_profiles for update
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

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
  for each row execute procedure public.nexla_set_updated_at();

create trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.nexla_set_user_id();

alter table public.projects enable row level security;

drop policy if exists "projects: usuário vê os próprios"      on public.projects;
drop policy if exists "projects: usuário insere os próprios"  on public.projects;
drop policy if exists "projects: usuário atualiza os próprios" on public.projects;
drop policy if exists "projects: usuário exclui os próprios"  on public.projects;
drop policy if exists "projects_all"                          on public.projects;

create policy "projects_all"
  on public.projects for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

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
  for each row execute procedure public.nexla_set_updated_at();

create trigger clients_set_user_id
  before insert on public.clients
  for each row execute function public.nexla_set_user_id();

alter table public.clients enable row level security;

drop policy if exists "clients: próprio usuário" on public.clients;
drop policy if exists "clients_all"              on public.clients;

create policy "clients_all"
  on public.clients for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

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
  for each row execute procedure public.nexla_set_updated_at();

create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute function public.nexla_set_user_id();

alter table public.expenses enable row level security;

drop policy if exists "expenses: próprio usuário" on public.expenses;
drop policy if exists "expenses_all"              on public.expenses;

create policy "expenses_all"
  on public.expenses for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

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
  for each row execute procedure public.nexla_set_updated_at();

create trigger mensalidades_set_user_id
  before insert on public.mensalidades
  for each row execute function public.nexla_set_user_id();

alter table public.mensalidades enable row level security;

drop policy if exists "mensalidades: próprio usuário" on public.mensalidades;
drop policy if exists "mensalidades_all"              on public.mensalidades;

create policy "mensalidades_all"
  on public.mensalidades for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

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
  for each row execute procedure public.nexla_set_updated_at();

create trigger project_entries_set_user_id
  before insert on public.project_entries
  for each row execute function public.nexla_set_user_id();

alter table public.project_entries enable row level security;

drop policy if exists "project_entries: próprio usuário" on public.project_entries;
drop policy if exists "project_entries_all"              on public.project_entries;

create policy "project_entries_all"
  on public.project_entries for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/009_setup_completo.sql
-- ============================================================
-- Migration 009 — Setup completo e definitivo
-- Execute este arquivo no Supabase SQL Editor.
-- É idempotente: pode rodar várias vezes sem quebrar.
-- ============================================================

-- ── Extensão ─────────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ============================================================
-- FUNÇÕES UTILITÁRIAS
-- ============================================================

-- Atualiza updated_at automaticamente
create or replace function public.nexla_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Preenche user_id = auth.uid() no INSERT (security definer
-- garante que auth.uid() funcione mesmo via RLS)
create or replace function public.nexla_set_user_id()
returns trigger language plpgsql security definer as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

-- Cria perfil ao cadastrar novo usuário no Supabase Auth
create or replace function public.nexla_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.nexla_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;   -- seguro rodar múltiplas vezes
  return new;
end;
$$;

-- Recria trigger de novo usuário
drop trigger if exists nexla_on_auth_user_created on auth.users;
-- (trigger em auth.users removido: banco compartilhado)


-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.nexla_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.nexla_profiles;
create trigger profiles_updated_at
  before update on public.nexla_profiles
  for each row execute procedure public.nexla_set_updated_at();

-- RLS
alter table public.nexla_profiles enable row level security;

-- Remove TODAS as policies antigas (nomes usados nas migrations 001, 007, 008)
drop policy if exists "nexla_profiles: leitura própria"          on public.nexla_profiles;
drop policy if exists "nexla_profiles: atualização própria"      on public.nexla_profiles;
drop policy if exists "nexla_profiles: admin lê todos"           on public.nexla_profiles;
drop policy if exists "nexla_profiles: usuário vê o próprio"     on public.nexla_profiles;
drop policy if exists "nexla_profiles: usuário atualiza o próprio" on public.nexla_profiles;
drop policy if exists "profiles_select"                    on public.nexla_profiles;
drop policy if exists "profiles_select_auth"               on public.nexla_profiles;
drop policy if exists "profiles_update"                    on public.nexla_profiles;
drop policy if exists "profiles_update_any"                on public.nexla_profiles;
drop policy if exists "profiles_insert"                    on public.nexla_profiles;

-- Políticas limpas: qualquer usuário autenticado lê e edita todos os perfis
create policy "profiles_select"
  on public.nexla_profiles for select
  using (public.nexla_is_member());

create policy "profiles_insert"
  on public.nexla_profiles for insert
  with check (public.nexla_is_member());

create policy "profiles_update"
  on public.nexla_profiles for update
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- ============================================================
-- PROJECTS
-- ============================================================

create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,
  nome_projeto    text not null,
  tipo_projeto    text,
  nome_cliente    text,
  numero_cliente  text,
  valor           numeric(15,2),
  data_termino    date,
  descricao       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Garante que user_id não seja NOT NULL (migrations antigas puseram NOT NULL)
alter table public.projects alter column user_id drop not null;
-- Remove constraint de tipo_projeto se ainda existir
alter table public.projects drop constraint if exists projects_tipo_projeto_check;

drop trigger if exists projects_updated_at  on public.projects;
drop trigger if exists projects_set_user_id on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.nexla_set_updated_at();
create trigger projects_set_user_id
  before insert on public.projects
  for each row execute procedure public.nexla_set_user_id();

alter table public.projects enable row level security;

drop policy if exists "projects: usuário vê os próprios"       on public.projects;
drop policy if exists "projects: usuário insere os próprios"   on public.projects;
drop policy if exists "projects: usuário atualiza os próprios" on public.projects;
drop policy if exists "projects: usuário exclui os próprios"   on public.projects;
drop policy if exists "projects_all"                           on public.projects;

create policy "projects_all"
  on public.projects for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- ============================================================
-- CLIENTS
-- ============================================================

create table if not exists public.clients (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
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

alter table public.clients alter column user_id drop not null;

drop trigger if exists clients_updated_at  on public.clients;
drop trigger if exists clients_set_user_id on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.nexla_set_updated_at();
create trigger clients_set_user_id
  before insert on public.clients
  for each row execute procedure public.nexla_set_user_id();

alter table public.clients enable row level security;

drop policy if exists "clients: próprio usuário" on public.clients;
drop policy if exists "clients_all"              on public.clients;

create policy "clients_all"
  on public.clients for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- ============================================================
-- EXPENSES
-- ============================================================

create table if not exists public.expenses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
  descricao   text not null,
  valor       numeric(15,2) not null,
  data        date not null,
  categoria   text,
  tipo        text not null default 'avulsa' check (tipo in ('fixa', 'avulsa')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.expenses alter column user_id drop not null;

drop trigger if exists expenses_updated_at  on public.expenses;
drop trigger if exists expenses_set_user_id on public.expenses;
create trigger expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.nexla_set_updated_at();
create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute procedure public.nexla_set_user_id();

alter table public.expenses enable row level security;

drop policy if exists "expenses: próprio usuário" on public.expenses;
drop policy if exists "expenses_all"              on public.expenses;

create policy "expenses_all"
  on public.expenses for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- ============================================================
-- MENSALIDADES
-- ============================================================

create table if not exists public.mensalidades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,
  cliente_nome    text not null,
  descricao       text not null,
  valor           numeric(15,2) not null,
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  status          text not null default 'ativo' check (status in ('ativo', 'inativo')),
  data_inicio     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.mensalidades alter column user_id     drop not null;
alter table public.mensalidades alter column data_inicio drop not null;

drop trigger if exists mensalidades_updated_at  on public.mensalidades;
drop trigger if exists mensalidades_set_user_id on public.mensalidades;
create trigger mensalidades_updated_at
  before update on public.mensalidades
  for each row execute procedure public.nexla_set_updated_at();
create trigger mensalidades_set_user_id
  before insert on public.mensalidades
  for each row execute procedure public.nexla_set_user_id();

alter table public.mensalidades enable row level security;

drop policy if exists "mensalidades: próprio usuário" on public.mensalidades;
drop policy if exists "mensalidades_all"              on public.mensalidades;

create policy "mensalidades_all"
  on public.mensalidades for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- ============================================================
-- PROJECT_ENTRIES
-- ============================================================

create table if not exists public.project_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users (id) on delete set null,
  nome_projeto  text not null,
  descricao     text,
  valor         numeric(15,2) not null,
  data          date not null,
  status        text not null default 'pendente' check (status in ('pendente', 'recebido')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.project_entries alter column user_id drop not null;

drop trigger if exists project_entries_updated_at  on public.project_entries;
drop trigger if exists project_entries_set_user_id on public.project_entries;
create trigger project_entries_updated_at
  before update on public.project_entries
  for each row execute procedure public.nexla_set_updated_at();
create trigger project_entries_set_user_id
  before insert on public.project_entries
  for each row execute procedure public.nexla_set_user_id();

alter table public.project_entries enable row level security;

drop policy if exists "project_entries: próprio usuário" on public.project_entries;
drop policy if exists "project_entries_all"              on public.project_entries;

create policy "project_entries_all"
  on public.project_entries for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/010_kanban.sql
-- ============================================================
-- Migration 010 — Kanban persistente
-- ============================================================

-- Colunas do Kanban
create table if not exists public.kanban_columns (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete set null,
  title      text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- Tarefas do Kanban
create table if not exists public.kanban_tasks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  column_id    uuid not null references public.kanban_columns(id) on delete cascade,
  title        text not null,
  subtitle     text,
  position     int  not null default 0,
  from_project boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Triggers user_id
drop trigger if exists kanban_columns_set_user_id on public.kanban_columns;
create trigger kanban_columns_set_user_id
  before insert on public.kanban_columns
  for each row execute procedure public.nexla_set_user_id();

drop trigger if exists kanban_tasks_set_user_id on public.kanban_tasks;
create trigger kanban_tasks_set_user_id
  before insert on public.kanban_tasks
  for each row execute procedure public.nexla_set_user_id();

-- RLS
alter table public.kanban_columns enable row level security;
alter table public.kanban_tasks   enable row level security;

drop policy if exists "kanban_columns_all" on public.kanban_columns;
drop policy if exists "kanban_tasks_all"   on public.kanban_tasks;

create policy "kanban_columns_all"
  on public.kanban_columns for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());

create policy "kanban_tasks_all"
  on public.kanban_tasks for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/011_client_fk.sql
-- ============================================================
-- Migration 011 — FK client_id em mensalidades e project_entries
-- ============================================================

-- Adiciona client_id às mensalidades (opcional para retrocompatibilidade)
alter table public.mensalidades
  add column if not exists client_id uuid references public.clients(id) on delete set null;

-- Adiciona client_id às entradas de projetos
alter table public.project_entries
  add column if not exists client_id uuid references public.clients(id) on delete set null;


-- >>>>> migrations/012_user_creation.sql
-- ============================================================
-- Migration 012 — Trigger de perfil lê role dos metadados
-- Execute no Supabase SQL Editor.
-- ============================================================

-- Atualiza o trigger para também ler o role do metadata (se fornecido pela Edge Function)
create or replace function public.nexla_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.nexla_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'operator')
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.nexla_profiles.full_name),
        role      = coalesce(excluded.role,      public.nexla_profiles.role),
        updated_at = now();
  return new;
end;
$$;


-- >>>>> migrations/013_roles_admin_operator.sql
-- Migration 013 — Reduz cargos para admin e operator
-- Execute no Supabase SQL Editor.

alter table public.nexla_profiles
  drop constraint if exists profiles_role_check;

alter table public.nexla_profiles
  add constraint profiles_role_check
  check (role in ('admin', 'operator'));

-- Converte qualquer viewer existente para operator
update public.nexla_profiles set role = 'operator' where role = 'viewer';

-- Ajusta o default e o trigger
alter table public.nexla_profiles
  alter column role set default 'operator';


-- >>>>> migrations/014_cal_events.sql
-- Migration 014 — cal_events (reuniões e eventos personalizados)
-- Execute no Supabase SQL Editor.

create table if not exists public.cal_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  title       text not null,
  date        date not null,
  time        time,
  description text,
  tipo        text not null default 'evento' check (tipo in ('reuniao', 'evento')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.cal_events alter column user_id drop not null;

drop trigger if exists cal_events_updated_at  on public.cal_events;
drop trigger if exists cal_events_set_user_id on public.cal_events;

create trigger cal_events_updated_at
  before update on public.cal_events
  for each row execute procedure public.nexla_set_updated_at();

create trigger cal_events_set_user_id
  before insert on public.cal_events
  for each row execute procedure public.nexla_set_user_id();

alter table public.cal_events enable row level security;

drop policy if exists "cal_events_all" on public.cal_events;

create policy "cal_events_all"
  on public.cal_events for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/015_n8n_errors.sql
-- Migration 015 — n8n_errors
-- Armazena erros enviados pelos fluxos n8n via webhook.
-- Execute no Supabase SQL Editor.

create table if not exists public.n8n_errors (
  id          uuid primary key default uuid_generate_v4(),
  payload     jsonb not null,               -- JSON completo enviado pelo n8n
  resolved    boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.n8n_errors enable row level security;

-- n8n insere diretamente via REST API com a anon key (sem autenticação)
drop policy if exists "n8n_errors_insert" on public.n8n_errors;
create policy "n8n_errors_insert"
  on public.n8n_errors for insert
  to anon, authenticated
  with check (true);

-- Apenas usuários autenticados leem e atualizam
drop policy if exists "n8n_errors_select" on public.n8n_errors;
create policy "n8n_errors_select"
  on public.n8n_errors for select
  using (public.nexla_is_member());

drop policy if exists "n8n_errors_update" on public.n8n_errors;
create policy "n8n_errors_update"
  on public.n8n_errors for update
  using (public.nexla_is_member());

drop policy if exists "n8n_errors_delete" on public.n8n_errors;
create policy "n8n_errors_delete"
  on public.n8n_errors for delete
  using (public.nexla_is_member());

-- Índice para busca rápida de não resolvidos
create index if not exists n8n_errors_resolved_idx on public.n8n_errors (resolved, created_at desc);


-- >>>>> migrations/016_realtime.sql
-- Migration 016 — Habilita Realtime para as tabelas que precisam de atualização ao vivo
-- Execute no Supabase SQL Editor.

-- Adiciona as tabelas à publicação padrão do Supabase (supabase_realtime)
-- Isso permite que o cliente JS receba eventos INSERT/UPDATE/DELETE em tempo real.

alter publication supabase_realtime add table public.n8n_errors;
alter publication supabase_realtime add table public.kanban_tasks;
alter publication supabase_realtime add table public.projects;


-- >>>>> migrations/017_n8n_errors_resolved_by.sql
-- Migration 017: adiciona coluna resolved_by em n8n_errors
alter table public.n8n_errors
  add column if not exists resolved_by text;


-- >>>>> migrations/018_kanban_enhancements.sql
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


-- >>>>> migrations/019_kanban_task_due_date.sql
-- Migration 019 — data limite nas tarefas do Kanban
alter table public.kanban_tasks
  add column if not exists due_date date;


-- >>>>> migrations/020_kanban_task_important.sql
-- Migration 020 — flag "importante" nas tarefas do Kanban
alter table public.kanban_tasks
  add column if not exists important boolean not null default false;


-- >>>>> migrations/021_cascade_client_project_kanban.sql
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


-- >>>>> migrations/022_expenses_dia_vencimento.sql
-- Migration 022 — Dia de vencimento para despesas fixas
alter table public.expenses
  add column if not exists dia_vencimento integer check (dia_vencimento between 1 and 31);


-- >>>>> migrations/023_app_settings.sql
-- App-level settings (single row, singleton pattern)
create table if not exists public.app_settings (
  id                  int primary key default 1 check (id = 1),
  currency_provider   text not null default 'awesomeapi',
  currency_api_key    text,
  usd_brl_rate        numeric(10,4),
  rate_fetched_at     timestamptz,
  updated_at          timestamptz default now(),
  updated_by          uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "admins_select_app_settings" on public.app_settings
  for select using (
    exists (select 1 from public.nexla_profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins_insert_app_settings" on public.app_settings
  for insert with check (
    exists (select 1 from public.nexla_profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins_update_app_settings" on public.app_settings
  for update using (
    exists (select 1 from public.nexla_profiles where id = auth.uid() and role = 'admin')
  );

-- Seed default row
insert into public.app_settings (id, currency_provider)
values (1, 'awesomeapi')
on conflict (id) do nothing;


-- >>>>> migrations/024_app_settings_bid.sql
-- Adiciona taxa bid (compra) separada da ask (venda) para referência
alter table public.app_settings
  add column if not exists usd_brl_bid numeric(10,4);

-- Renomeia usd_brl_rate para representar a taxa ask (venda) usada em custos
comment on column public.app_settings.usd_brl_rate    is 'Taxa ask (venda) – usada para calcular custo de tokens em BRL';
comment on column public.app_settings.usd_brl_bid     is 'Taxa bid (compra) – referência de mercado';
comment on column public.app_settings.currency_provider is 'Provedor fixo: awesomeapi';


-- >>>>> migrations/025_expenses_pago.sql
-- Migration: 025 — Adiciona campo pago nas despesas
alter table public.expenses
  add column if not exists pago boolean not null default false;


-- >>>>> migrations/026_cobranca_pagamentos.sql
-- Migration: 026 — Status de pagamento mensal por cliente (Cobranças)
create table if not exists public.cobranca_pagamentos (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  mes        text not null, -- formato: 'YYYY-MM'
  status     text not null default 'nao_pago' check (status in ('pago', 'nao_pago')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id, mes)
);

create index if not exists cobranca_pagamentos_user_mes_idx on public.cobranca_pagamentos (user_id, mes);

create trigger cobranca_pagamentos_updated_at
  before update on public.cobranca_pagamentos
  for each row execute procedure public.nexla_set_updated_at();

alter table public.cobranca_pagamentos enable row level security;
create policy "cobranca_pagamentos: próprio usuário" on public.cobranca_pagamentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- >>>>> migrations/027_proposals.sql
-- ============================================================
-- Migration: 027 — Propostas comerciais
-- ============================================================
create table if not exists public.proposals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,

  client_id       uuid,
  cliente_nome    text not null,
  titulo          text not null,
  descricao       text,

  setup_valor     numeric(15, 2) not null default 0,
  mensalidade_valor numeric(15, 2) not null default 0,
  recorrencia     text not null default 'mensal'
                    check (recorrencia in ('mensal', 'semestral', 'anual')),

  status          text not null default 'enviada'
                    check (status in ('enviada', 'aceita', 'recusada', 'rascunho')),

  data_envio      date,
  observacoes     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists proposals_user_id_idx
  on public.proposals (user_id, created_at desc);

create index if not exists proposals_client_id_idx
  on public.proposals (client_id);

drop trigger if exists proposals_updated_at  on public.proposals;
drop trigger if exists proposals_set_user_id on public.proposals;

create trigger proposals_updated_at
  before update on public.proposals
  for each row execute procedure public.nexla_set_updated_at();

create trigger proposals_set_user_id
  before insert on public.proposals
  for each row execute function public.nexla_set_user_id();

alter table public.proposals enable row level security;

drop policy if exists "proposals_all" on public.proposals;
create policy "proposals_all"
  on public.proposals for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/028_proposals_lead_fields.sql
-- ============================================================
-- Migration: 028 — Propostas: telefone manual para leads sem cadastro
-- ============================================================
alter table public.proposals
  add column if not exists cliente_telefone text;


-- >>>>> migrations/029_projects_valor_recebido.sql
-- ============================================================
-- Migration: 029 — Projetos: campo de valor já recebido
-- ============================================================
alter table public.projects
  add column if not exists valor_recebido numeric(15, 2) not null default 0;


-- >>>>> migrations/030_ajustes_caixa.sql
-- ============================================================
-- Migration: 030 — Ajustes manuais de caixa
-- Cada linha é uma correção do saldo (positiva ou negativa)
-- aplicada sobre o cálculo automático.
-- ============================================================
create table if not exists public.ajustes_caixa (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
  valor       numeric(15, 2) not null,
  descricao   text,
  data        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists ajustes_caixa_data_idx
  on public.ajustes_caixa (data desc);

drop trigger if exists ajustes_caixa_set_user_id on public.ajustes_caixa;
create trigger ajustes_caixa_set_user_id
  before insert on public.ajustes_caixa
  for each row execute function public.nexla_set_user_id();

alter table public.ajustes_caixa enable row level security;

drop policy if exists "ajustes_caixa_all" on public.ajustes_caixa;
create policy "ajustes_caixa_all"
  on public.ajustes_caixa for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/031_nps_responses.sql
-- ============================================================
-- Migration: 031 — NPS (Net Promoter Score) — pesquisa mensal
-- ============================================================
create table if not exists public.nps_responses (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users (id) on delete set null,
  client_id    uuid references public.clients (id) on delete set null,
  cliente_nome text not null,
  score        int  not null check (score between 0 and 10),
  comentario   text,
  data         date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists nps_responses_data_idx
  on public.nps_responses (data desc);

drop trigger if exists nps_responses_set_user_id on public.nps_responses;
create trigger nps_responses_set_user_id
  before insert on public.nps_responses
  for each row execute function public.nexla_set_user_id();

alter table public.nps_responses enable row level security;

drop policy if exists "nps_responses_all" on public.nps_responses;
create policy "nps_responses_all"
  on public.nps_responses for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/032_cobranca_data_prometida.sql
-- ============================================================
-- Migration: 032 — Cobranças: data prometida de pagamento
-- Permite reagendar a cobrança para uma data combinada com o cliente
-- ============================================================
alter table public.cobranca_pagamentos
  add column if not exists data_prometida date;

create index if not exists cobranca_pagamentos_data_prometida_idx
  on public.cobranca_pagamentos (data_prometida);


-- >>>>> migrations/033_acessos.sql
-- ============================================================
-- Migration: 033 — Acessos (cofre criptografado E2E)
-- Tudo o que importa entra como ciphertext (AES-GCM 256). O servidor
-- nunca tem a chave — derivada via PBKDF2 da master password no browser.
-- ============================================================

-- Singleton: salt + verifier (ciphertext de uma sentinela conhecida)
-- usado para validar a master password sem armazená-la.
create table if not exists public.acesso_config (
  id          int primary key default 1 check (id = 1),
  salt        text not null,
  verifier_iv text not null,
  verifier    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.acesso_config enable row level security;

drop policy if exists "acesso_config_all" on public.acesso_config;
create policy "acesso_config_all"
  on public.acesso_config for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());

drop trigger if exists acesso_config_updated_at on public.acesso_config;
create trigger acesso_config_updated_at
  before update on public.acesso_config
  for each row execute procedure public.nexla_set_updated_at();

-- Cofre: cada linha tem ciphertext de um JSON de campos secretos.
create table if not exists public.acessos (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
  nome        text not null,
  categoria   text not null default 'outro'
                check (categoria in ('api', 'login', 'banco', 'outro')),
  descricao   text,
  iv          text not null,
  ciphertext  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists acessos_user_idx
  on public.acessos (user_id, created_at desc);

drop trigger if exists acessos_updated_at on public.acessos;
create trigger acessos_updated_at
  before update on public.acessos
  for each row execute procedure public.nexla_set_updated_at();

drop trigger if exists acessos_set_user_id on public.acessos;
create trigger acessos_set_user_id
  before insert on public.acessos
  for each row execute function public.nexla_set_user_id();

alter table public.acessos enable row level security;

drop policy if exists "acessos_all" on public.acessos;
create policy "acessos_all"
  on public.acessos for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/034_expense_pagamentos.sql
-- ============================================================
-- Migration: 034 — Pagamentos mensais de despesas fixas
-- Cada fixa pode ser quitada mês a mês — antes o campo `pago` era
-- booleano global, perdendo histórico ao reabrir o mês seguinte.
-- ============================================================
create table if not exists public.expense_pagamentos (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete set null,
  expense_id      uuid not null references public.expenses (id) on delete cascade,
  mes             text not null,             -- YYYY-MM
  data_pagamento  date,                      -- data efetiva da quitação
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (expense_id, mes)
);

create index if not exists expense_pagamentos_mes_idx
  on public.expense_pagamentos (mes);

drop trigger if exists expense_pagamentos_updated_at on public.expense_pagamentos;
create trigger expense_pagamentos_updated_at
  before update on public.expense_pagamentos
  for each row execute procedure public.nexla_set_updated_at();

drop trigger if exists expense_pagamentos_set_user_id on public.expense_pagamentos;
create trigger expense_pagamentos_set_user_id
  before insert on public.expense_pagamentos
  for each row execute function public.nexla_set_user_id();

alter table public.expense_pagamentos enable row level security;

drop policy if exists "expense_pagamentos_all" on public.expense_pagamentos;
create policy "expense_pagamentos_all"
  on public.expense_pagamentos for all
  using (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/035_ponto.sql
-- ============================================================
-- Migration: 035 — Sistema de ponto eletrônico
-- Cada colaborador bate os 4 pontos do dia (entrada / saída
-- almoço / retorno / saída final) e o frontend calcula horas.
-- ============================================================
create table if not exists public.ponto_registros (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references auth.users(id) on delete cascade,
  tipo           text not null
                   check (tipo in ('entrada','saida_almoco','retorno_almoco','saida')),
  registrado_em  timestamptz not null default now(),
  data           date not null,        -- data local enviada pelo browser
  created_at     timestamptz not null default now(),
  unique (user_id, data, tipo)
);

create index if not exists ponto_registros_user_data_idx
  on public.ponto_registros (user_id, data desc);

drop trigger if exists ponto_registros_set_user_id on public.ponto_registros;
create trigger ponto_registros_set_user_id
  before insert on public.ponto_registros
  for each row execute function public.nexla_set_user_id();

alter table public.ponto_registros enable row level security;

drop policy if exists "ponto_registros_all" on public.ponto_registros;
create policy "ponto_registros_all"
  on public.ponto_registros for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/036_churn.sql
-- ============================================================
-- Migration: 036 — Rastreamento de churn de clientes
-- Adiciona campo ativo em clients e tabela churn_events para
-- registrar motivo, MRR perdido e comentário ao desativar.
-- ============================================================

alter table public.clients
  add column if not exists ativo boolean not null default true;

create table if not exists public.churn_events (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete set null,
  client_id    uuid not null references public.clients(id) on delete cascade,
  motivo       text not null check (motivo in (
                 'preco','concorrencia','projeto_encerrado',
                 'insatisfeito','internalizou','inadimplencia','outro')),
  comentario   text,
  mrr_perdido  numeric(12,2) not null default 0,
  data_churn   date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists churn_events_client_idx on public.churn_events (client_id);
create index if not exists churn_events_data_idx   on public.churn_events (data_churn desc);

drop trigger if exists churn_events_set_user_id on public.churn_events;
create trigger churn_events_set_user_id
  before insert on public.churn_events
  for each row execute function public.nexla_set_user_id();

alter table public.churn_events enable row level security;

drop policy if exists "churn_events_all" on public.churn_events;
create policy "churn_events_all"
  on public.churn_events for all
  using  (public.nexla_is_member())
  with check (public.nexla_is_member());


-- >>>>> migrations/037_crm.sql
-- ============================================================
-- Migration: 037 — CRM de Vendas
-- Funis, etapas, leads, interações e tarefas de follow-up.
-- Leads são cadastrados manualmente pelo vendedor (não vêm de
-- conversa/automação) e todo contato vira interação no histórico.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Funis (quadros de venda) ─────────────────────────────────
create table if not exists public.crm_funnels (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  nome       text not null,
  posicao    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Etapas do funil (colunas do board) ───────────────────────
-- tipo: 'aberto' = etapa normal | 'ganho' e 'perdido' fecham o lead
create table if not exists public.crm_stages (
  id          uuid primary key default uuid_generate_v4(),
  funil_id    uuid not null references public.crm_funnels (id) on delete cascade,
  nome        text not null,
  cor         text not null default '#6366f1',
  posicao     integer not null default 0,
  alerta_dias integer,
  tipo        text not null default 'aberto' check (tipo in ('aberto', 'ganho', 'perdido')),
  created_at  timestamptz not null default now()
);

-- ── Leads ────────────────────────────────────────────────────
create table if not exists public.crm_leads (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid references auth.users (id) on delete set null,
  funil_id           uuid references public.crm_funnels (id) on delete cascade,
  stage_id           uuid references public.crm_stages  (id) on delete set null,
  nome               text not null,
  empresa            text,
  telefone           text,
  email              text,
  origem             text,
  temperatura        text not null default 'morno' check (temperatura in ('frio', 'morno', 'quente')),
  valor              numeric(12,2) not null default 0,
  valor_recorrente   numeric(12,2) not null default 0,
  tags               text[] not null default '{}',
  responsavel_id     uuid references auth.users (id) on delete set null,
  responsavel_nome   text,
  observacoes        text,
  status             text not null default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  motivo_perda       text,
  proximo_contato    date,
  data_ult_contato   timestamptz,
  data_entrada_etapa timestamptz not null default now(),
  data_fechamento    timestamptz,
  client_id          uuid references public.clients (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Interações (histórico de cada contato com o lead) ────────
create table if not exists public.crm_interactions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  lead_id    uuid not null references public.crm_leads (id) on delete cascade,
  tipo       text not null check (tipo in (
               'nota', 'ligacao', 'whatsapp', 'email', 'reuniao',
               'proposta', 'etapa', 'tarefa', 'ganho', 'perdido')),
  conteudo   text,
  metadata   jsonb,
  autor_nome text,
  created_at timestamptz not null default now()
);

-- ── Tarefas / follow-ups do vendedor ─────────────────────────
create table if not exists public.crm_tasks (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users (id) on delete set null,
  lead_id          uuid not null references public.crm_leads (id) on delete cascade,
  titulo           text not null,
  descricao        text,
  due_date         date,
  concluida        boolean not null default false,
  concluida_em     timestamptz,
  responsavel_id   uuid references auth.users (id) on delete set null,
  responsavel_nome text,
  created_at       timestamptz not null default now()
);

-- ── Índices ──────────────────────────────────────────────────
create index if not exists crm_stages_funil_idx      on public.crm_stages (funil_id, posicao);
create index if not exists crm_leads_funil_idx       on public.crm_leads (funil_id);
create index if not exists crm_leads_stage_idx       on public.crm_leads (stage_id);
create index if not exists crm_leads_responsavel_idx on public.crm_leads (responsavel_id);
create index if not exists crm_leads_status_idx      on public.crm_leads (status, data_fechamento desc);
create index if not exists crm_interactions_lead_idx on public.crm_interactions (lead_id, created_at desc);
create index if not exists crm_tasks_lead_idx        on public.crm_tasks (lead_id);
create index if not exists crm_tasks_due_idx         on public.crm_tasks (concluida, due_date);

-- ── Triggers ─────────────────────────────────────────────────
drop trigger if exists crm_funnels_updated_at on public.crm_funnels;
create trigger crm_funnels_updated_at
  before update on public.crm_funnels
  for each row execute procedure public.nexla_set_updated_at();

drop trigger if exists crm_leads_updated_at on public.crm_leads;
create trigger crm_leads_updated_at
  before update on public.crm_leads
  for each row execute procedure public.nexla_set_updated_at();

drop trigger if exists crm_funnels_set_user_id on public.crm_funnels;
create trigger crm_funnels_set_user_id
  before insert on public.crm_funnels
  for each row execute procedure public.nexla_set_user_id();

drop trigger if exists crm_leads_set_user_id on public.crm_leads;
create trigger crm_leads_set_user_id
  before insert on public.crm_leads
  for each row execute procedure public.nexla_set_user_id();

drop trigger if exists crm_interactions_set_user_id on public.crm_interactions;
create trigger crm_interactions_set_user_id
  before insert on public.crm_interactions
  for each row execute procedure public.nexla_set_user_id();

drop trigger if exists crm_tasks_set_user_id on public.crm_tasks;
create trigger crm_tasks_set_user_id
  before insert on public.crm_tasks
  for each row execute procedure public.nexla_set_user_id();

-- ── RLS: qualquer usuário autenticado acessa (mesmo padrão do app) ──
alter table public.crm_funnels      enable row level security;
alter table public.crm_stages       enable row level security;
alter table public.crm_leads        enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_tasks        enable row level security;

drop policy if exists "crm_funnels_all"      on public.crm_funnels;
drop policy if exists "crm_stages_all"       on public.crm_stages;
drop policy if exists "crm_leads_all"        on public.crm_leads;
drop policy if exists "crm_interactions_all" on public.crm_interactions;
drop policy if exists "crm_tasks_all"        on public.crm_tasks;

create policy "crm_funnels_all"      on public.crm_funnels      for all using (public.nexla_is_member()) with check (public.nexla_is_member());
create policy "crm_stages_all"       on public.crm_stages       for all using (public.nexla_is_member()) with check (public.nexla_is_member());
create policy "crm_leads_all"        on public.crm_leads        for all using (public.nexla_is_member()) with check (public.nexla_is_member());
create policy "crm_interactions_all" on public.crm_interactions for all using (public.nexla_is_member()) with check (public.nexla_is_member());
create policy "crm_tasks_all"        on public.crm_tasks        for all using (public.nexla_is_member()) with check (public.nexla_is_member());


-- >>>>> migrations/038_crm_cadencia.sql
-- ============================================================
-- Migration: 038 — Réguas de follow-up (cadências) do CRM
-- Um lead novo já nasce com a sequência de toques do comercial
-- (ex.: D1 ligação, D2 WhatsApp, D4 WhatsApp, D6 Instagram…),
-- virando tarefas com data prevista que caem direto na Agenda.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Régua (cadência) ─────────────────────────────────────────
create table if not exists public.crm_cadences (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users (id) on delete set null,
  nome       text not null,
  descricao  text,
  padrao     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Toques da régua ──────────────────────────────────────────
-- dia_offset: dias após a entrada do lead (0 = mesmo dia)
create table if not exists public.crm_cadence_steps (
  id          uuid primary key default uuid_generate_v4(),
  cadence_id  uuid not null references public.crm_cadences (id) on delete cascade,
  posicao     integer not null default 0,
  dia_offset  integer not null default 0,
  canal       text not null default 'whatsapp'
                check (canal in ('ligacao', 'whatsapp', 'email', 'instagram', 'reuniao', 'outro')),
  titulo      text not null,
  descricao   text,
  created_at  timestamptz not null default now()
);

-- ── Tarefas ganham canal e vínculo com a régua ───────────────
alter table public.crm_tasks
  add column if not exists canal      text
    check (canal in ('ligacao', 'whatsapp', 'email', 'instagram', 'reuniao', 'outro')),
  add column if not exists cadence_id uuid references public.crm_cadences (id)      on delete set null,
  add column if not exists step_id    uuid references public.crm_cadence_steps (id) on delete set null,
  add column if not exists dia_offset integer;

-- ── Índices ──────────────────────────────────────────────────
create index if not exists crm_cadence_steps_cad_idx on public.crm_cadence_steps (cadence_id, posicao);
create index if not exists crm_tasks_cadence_idx     on public.crm_tasks (cadence_id);

-- ── Triggers ─────────────────────────────────────────────────
drop trigger if exists crm_cadences_updated_at on public.crm_cadences;
create trigger crm_cadences_updated_at
  before update on public.crm_cadences
  for each row execute procedure public.nexla_set_updated_at();

drop trigger if exists crm_cadences_set_user_id on public.crm_cadences;
create trigger crm_cadences_set_user_id
  before insert on public.crm_cadences
  for each row execute procedure public.nexla_set_user_id();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.crm_cadences      enable row level security;
alter table public.crm_cadence_steps enable row level security;

drop policy if exists "crm_cadences_all"      on public.crm_cadences;
drop policy if exists "crm_cadence_steps_all" on public.crm_cadence_steps;

create policy "crm_cadences_all"      on public.crm_cadences      for all using (public.nexla_is_member()) with check (public.nexla_is_member());
create policy "crm_cadence_steps_all" on public.crm_cadence_steps for all using (public.nexla_is_member()) with check (public.nexla_is_member());


-- Segurança extra: garante que nenhum trigger nexla ficou em auth.users
drop trigger if exists nexla_on_auth_user_created on auth.users;
drop function if exists public.nexla_handle_new_user();
