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
  for each row execute function public.set_user_id();

alter table public.nps_responses enable row level security;

drop policy if exists "nps_responses_all" on public.nps_responses;
create policy "nps_responses_all"
  on public.nps_responses for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
