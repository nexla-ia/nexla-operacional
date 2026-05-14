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
  for each row execute function public.set_user_id();

alter table public.ponto_registros enable row level security;

drop policy if exists "ponto_registros_all" on public.ponto_registros;
create policy "ponto_registros_all"
  on public.ponto_registros for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
