-- ============================================================
-- Migration: 001 — Schema inicial
-- Projeto: Nexla Operacional
-- ============================================================

-- ── Extensões necessárias ────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ============================================================
-- TABELA: profiles
-- Complementa auth.users com dados de perfil do usuário.
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

-- Trigger: mantém updated_at sincronizado
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Trigger: cria perfil automaticamente ao registrar usuário
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- RLS — profiles
-- ============================================================
alter table public.profiles enable row level security;

-- Cada usuário lê e atualiza apenas o próprio perfil
create policy "profiles: leitura própria"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: atualização própria"
  on public.profiles for update
  using (auth.uid() = id);

-- Admin lê todos os perfis
create policy "profiles: admin lê todos"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
