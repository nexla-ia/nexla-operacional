-- ============================================================
-- Migration 040 — Tela Sushi Time (avaliações Google)
--
-- A tabela public.review_requests pertence ao fluxo n8n do Sushi Time
-- (outro sistema no banco compartilhado). NÃO alteramos a tabela nem suas
-- policies: a leitura é feita por uma função security definer da Nexla,
-- somente leitura, liberada apenas para quem tiver acesso à tela.
-- ============================================================

-- Acesso por tela (telas restritas a usuários específicos)
create table if not exists public.nexla_tela_acesso (
  user_id    uuid not null references public.nexla_profiles (id) on delete cascade,
  tela       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tela)
);

alter table public.nexla_tela_acesso enable row level security;

drop policy if exists "tela_acesso_select" on public.nexla_tela_acesso;
create policy "tela_acesso_select" on public.nexla_tela_acesso
  for select using (user_id = auth.uid() or public.nexla_is_admin());

drop policy if exists "tela_acesso_admin_write" on public.nexla_tela_acesso;
create policy "tela_acesso_admin_write" on public.nexla_tela_acesso
  for all using (public.nexla_is_admin()) with check (public.nexla_is_admin());

create or replace function public.nexla_tem_tela(p_tela text)
returns boolean language plpgsql stable security definer
set search_path = public as $$
begin
  return exists (
    select 1 from public.nexla_tela_acesso
    where user_id = auth.uid() and tela = p_tela
  );
end;
$$;

-- Leitura das solicitações de avaliação (somente leitura)
create or replace function public.nexla_sushi_review_requests()
returns setof public.review_requests
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.nexla_tem_tela('sushi_time') then
    raise exception 'sem acesso a tela sushi_time' using errcode = '42501';
  end if;
  return query
    select * from public.review_requests
    order by coalesce(sent_at, send_at) desc, id desc;
end;
$$;

revoke all on function public.nexla_tem_tela(text)             from public, anon;
revoke all on function public.nexla_sushi_review_requests()    from public, anon;
grant execute on function public.nexla_tem_tela(text)          to authenticated;
grant execute on function public.nexla_sushi_review_requests() to authenticated;

-- Libera a tela para a conta akira.vha@gmail.com
insert into public.nexla_tela_acesso (user_id, tela)
select p.id, 'sushi_time'
from public.nexla_profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'akira.vha@gmail.com'
on conflict do nothing;
