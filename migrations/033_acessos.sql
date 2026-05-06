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
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop trigger if exists acesso_config_updated_at on public.acesso_config;
create trigger acesso_config_updated_at
  before update on public.acesso_config
  for each row execute procedure public.set_updated_at();

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
  for each row execute procedure public.set_updated_at();

drop trigger if exists acessos_set_user_id on public.acessos;
create trigger acessos_set_user_id
  before insert on public.acessos
  for each row execute function public.set_user_id();

alter table public.acessos enable row level security;

drop policy if exists "acessos_all" on public.acessos;
create policy "acessos_all"
  on public.acessos for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
