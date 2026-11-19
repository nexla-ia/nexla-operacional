-- ============================================================
-- Migration 041 — Radar de Editais
--
-- Editais com propostas abertas (fonte: PNCP), separados por escopo:
--   RO       → todos os editais abertos de Rondônia
--   NACIONAL → editais do Brasil que batem com palavras-chave da Nexla
--
-- Quem grava é o n8n, pela função nexla_editais_upsert(), autenticada por
-- um token próprio (guardado só como hash em nexla_integracao_tokens).
-- O n8n NÃO usa a service role key (o banco é compartilhado com outros
-- sistemas; a chave daria acesso a todos eles).
-- Quem lê é quem tem a tela 'radar_editais' em nexla_tela_acesso.
-- ============================================================

-- ── Tokens de integração (n8n etc.) ─────────────────────────────────────────
create table if not exists public.nexla_integracao_tokens (
  nome        text primary key,
  token_hash  text not null,              -- sha256 hex do token
  created_at  timestamptz not null default now()
);
alter table public.nexla_integracao_tokens enable row level security;
-- sem policies: nenhum usuário/anon lê ou altera; só funções security definer

create or replace function public.nexla_token_valido(p_nome text, p_token text)
returns boolean language plpgsql stable security definer
set search_path = public, extensions as $$
begin
  return p_token is not null and exists (
    select 1 from public.nexla_integracao_tokens
    where nome = p_nome
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  );
end;
$$;
revoke all on function public.nexla_token_valido(text, text) from public, anon, authenticated;

-- ── Editais ─────────────────────────────────────────────────────────────────
create table if not exists public.nexla_editais (
  id                     uuid primary key default gen_random_uuid(),
  escopo                 text not null check (escopo in ('RO', 'NACIONAL')),
  fonte                  text not null default 'PNCP',
  id_externo             text not null,           -- numero de controle PNCP
  titulo                 text,
  objeto                 text,
  orgao                  text,
  unidade                text,
  uf                     text,
  municipio              text,
  modalidade             text,
  valor_estimado         numeric,
  data_publicacao        timestamptz,
  abertura_propostas     timestamptz,
  encerramento_propostas timestamptz,
  link                   text,                    -- página do edital no PNCP
  link_origem            text,                    -- sistema de compras de origem
  palavras_chave         text[] not null default '{}',
  status                 text not null default 'novo'
                           check (status in ('novo', 'interessante', 'descartado')),
  encontrado_em          timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  unique (escopo, id_externo)
);

create index if not exists nexla_editais_escopo_enc_idx
  on public.nexla_editais (escopo, encerramento_propostas);

alter table public.nexla_editais enable row level security;

drop policy if exists "editais_select" on public.nexla_editais;
create policy "editais_select" on public.nexla_editais
  for select using (public.nexla_tem_tela('radar_editais'));

drop policy if exists "editais_update" on public.nexla_editais;
create policy "editais_update" on public.nexla_editais
  for update using (public.nexla_tem_tela('radar_editais'))
  with check (public.nexla_tem_tela('radar_editais'));

-- Usuário só pode mudar o status (triagem); o resto vem do n8n
revoke all on public.nexla_editais from anon;
revoke insert, update, delete on public.nexla_editais from authenticated;
grant select on public.nexla_editais to authenticated;
grant update (status) on public.nexla_editais to authenticated;

-- ── Upsert chamado pelo n8n ─────────────────────────────────────────────────
-- POST /rest/v1/rpc/nexla_editais_upsert  { "p_token": "...", "p_editais": [ {...}, ... ] }
-- Não sobrescreve o status da triagem; atualiza datas/valores se o edital mudou.
create or replace function public.nexla_editais_upsert(p_token text, p_editais jsonb)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_novos int := 0;
  v_total int := 0;
begin
  if not public.nexla_token_valido('n8n_editais', p_token) then
    raise exception 'token invalido' using errcode = '42501';
  end if;
  if jsonb_typeof(p_editais) <> 'array' then
    raise exception 'p_editais deve ser um array';
  end if;
  if jsonb_array_length(p_editais) > 5000 then
    raise exception 'maximo de 5000 editais por chamada';
  end if;

  with dados as (
    select distinct on (e->>'escopo', e->>'id_externo')
      upper(e->>'escopo')                                   as escopo,
      coalesce(nullif(e->>'fonte', ''), 'PNCP')             as fonte,
      e->>'id_externo'                                      as id_externo,
      left(e->>'titulo', 300)                               as titulo,
      left(e->>'objeto', 5000)                              as objeto,
      left(e->>'orgao', 300)                                as orgao,
      left(e->>'unidade', 300)                              as unidade,
      upper(left(e->>'uf', 2))                              as uf,
      left(e->>'municipio', 120)                            as municipio,
      left(e->>'modalidade', 120)                           as modalidade,
      nullif(e->>'valor_estimado', '')::numeric             as valor_estimado,
      nullif(e->>'data_publicacao', '')::timestamptz        as data_publicacao,
      nullif(e->>'abertura_propostas', '')::timestamptz     as abertura_propostas,
      nullif(e->>'encerramento_propostas', '')::timestamptz as encerramento_propostas,
      left(e->>'link', 500)                                 as link,
      left(e->>'link_origem', 500)                          as link_origem,
      coalesce(
        (select array_agg(left(x, 60)) from jsonb_array_elements_text(
           case when jsonb_typeof(e->'palavras_chave') = 'array' then e->'palavras_chave' else '[]'::jsonb end) x),
        '{}')                                               as palavras_chave
    from jsonb_array_elements(p_editais) e
    where upper(e->>'escopo') in ('RO', 'NACIONAL')
      and coalesce(e->>'id_externo', '') <> ''
  ),
  up as (
    insert into public.nexla_editais as t (
      escopo, fonte, id_externo, titulo, objeto, orgao, unidade, uf, municipio,
      modalidade, valor_estimado, data_publicacao, abertura_propostas,
      encerramento_propostas, link, link_origem, palavras_chave)
    select escopo, fonte, id_externo, titulo, objeto, orgao, unidade, uf, municipio,
      modalidade, valor_estimado, data_publicacao, abertura_propostas,
      encerramento_propostas, link, link_origem, palavras_chave
    from dados
    on conflict (escopo, id_externo) do update set
      titulo                 = excluded.titulo,
      objeto                 = excluded.objeto,
      orgao                  = excluded.orgao,
      unidade                = excluded.unidade,
      uf                     = excluded.uf,
      municipio              = excluded.municipio,
      modalidade             = excluded.modalidade,
      valor_estimado         = coalesce(excluded.valor_estimado, t.valor_estimado),
      data_publicacao        = coalesce(excluded.data_publicacao, t.data_publicacao),
      abertura_propostas     = coalesce(excluded.abertura_propostas, t.abertura_propostas),
      encerramento_propostas = coalesce(excluded.encerramento_propostas, t.encerramento_propostas),
      link                   = coalesce(excluded.link, t.link),
      link_origem            = coalesce(excluded.link_origem, t.link_origem),
      palavras_chave         = (select array(select distinct unnest(t.palavras_chave || excluded.palavras_chave))),
      atualizado_em          = now()
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) into v_novos, v_total from up;

  return jsonb_build_object('recebidos', jsonb_array_length(p_editais),
                            'novos', v_novos, 'atualizados', v_total - v_novos);
end;
$$;

revoke all on function public.nexla_editais_upsert(text, jsonb) from public;
grant execute on function public.nexla_editais_upsert(text, jsonb) to anon, authenticated;

-- ── Acesso à tela ───────────────────────────────────────────────────────────
insert into public.nexla_tela_acesso (user_id, tela)
select p.id, 'radar_editais'
from public.nexla_profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'akira.vha@gmail.com'
on conflict do nothing;

-- O token do n8n NÃO fica neste arquivo (repo público). Ele é gerado e
-- gravado direto no banco:
--   insert into nexla_integracao_tokens (nome, token_hash)
--   values ('n8n_editais', encode(extensions.digest('<TOKEN>', 'sha256'), 'hex'))
--   on conflict (nome) do update set token_hash = excluded.token_hash;
