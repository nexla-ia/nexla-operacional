-- ============================================================
-- Migration 042 — Radar de Editais: busca feita pelo próprio sistema
--
-- Substitui o n8n. Fluxo:
--   cron (07h, 12h, 15h, 18h, 23h — horário de Rondônia, UTC-4)
--   ou botão "Buscar agora" (nexla_radar_buscar_agora)
--     -> nexla_radar_disparar('ro1')  -> pg_net -> Edge Function nexla-radar-editais
--     -> a função busca no PNCP, grava via nexla_editais_upsert e dispara o
--        próximo lote: ro1 -> ro2 -> nac1 -> nac2
--
-- A Edge Function é chamada com um token próprio guardado no Vault
-- (nome 'nexla_radar_token'); o hash fica em nexla_integracao_tokens ('radar_cron').
-- ============================================================

create extension if not exists pg_cron;

-- ── Histórico das buscas ────────────────────────────────────────────────────
create table if not exists public.nexla_radar_execucoes (
  id           bigserial primary key,
  lote         text not null check (lote in ('ro1', 'ro2', 'nac1', 'nac2')),
  origem       text not null default 'cron' check (origem in ('cron', 'botao')),
  status       text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  iniciado_em  timestamptz not null default now(),
  terminado_em timestamptz,
  recebidos    int not null default 0,
  novos        int not null default 0,
  atualizados  int not null default 0,
  falhas       text[] not null default '{}',
  erro         text
);
create index if not exists nexla_radar_execucoes_ini_idx on public.nexla_radar_execucoes (iniciado_em desc);

alter table public.nexla_radar_execucoes enable row level security;
drop policy if exists "radar_exec_select" on public.nexla_radar_execucoes;
create policy "radar_exec_select" on public.nexla_radar_execucoes
  for select using (public.nexla_tem_tela('radar_editais'));
revoke all on public.nexla_radar_execucoes from anon;
revoke insert, update, delete on public.nexla_radar_execucoes from authenticated;
grant select on public.nexla_radar_execucoes to authenticated;

-- ── Upsert: também aceita a Edge Function (service role) ────────────────────
create or replace function public.nexla_editais_upsert(p_token text, p_editais jsonb)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_novos int := 0;
  v_total int := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or public.nexla_token_valido('n8n_editais', p_token)) then
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
revoke all on function public.nexla_editais_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function public.nexla_editais_upsert(text, jsonb) to service_role;

-- n8n não é mais usado: revoga o token dele
delete from public.nexla_integracao_tokens where nome = 'n8n_editais';

-- ── Dispara um lote (chama a Edge Function pelo pg_net, em segundo plano) ───
create or replace function public.nexla_radar_disparar(p_lote text, p_origem text default 'cron')
returns bigint language plpgsql security definer
set search_path = public as $$
declare
  v_token text;
  v_req   bigint;
begin
  if p_lote not in ('ro1', 'ro2', 'nac1', 'nac2') then
    raise exception 'lote invalido: %', p_lote;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'nexla_radar_token';
  if v_token is null then
    raise exception 'segredo nexla_radar_token nao encontrado no Vault';
  end if;
  select net.http_post(
    url     := 'https://lyvknbggtimdivywfeys.supabase.co/functions/v1/nexla-radar-editais',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nexla-token', v_token),
    body    := jsonb_build_object('lote', p_lote, 'origem', coalesce(p_origem, 'cron'), 'encadear', true),
    timeout_milliseconds := 170000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.nexla_radar_disparar(text, text) from public, anon, authenticated;
grant execute on function public.nexla_radar_disparar(text, text) to service_role;

-- ── Botão "Buscar agora" ────────────────────────────────────────────────────
create or replace function public.nexla_radar_buscar_agora()
returns text language plpgsql security definer
set search_path = public as $$
begin
  if not public.nexla_tem_tela('radar_editais') then
    raise exception 'sem acesso ao radar de editais' using errcode = '42501';
  end if;
  -- já existe uma busca em andamento (lote "rodando" há menos de 5 min ou
  -- chamada ainda na fila do pg_net)?
  if exists (select 1 from public.nexla_radar_execucoes
             where status = 'rodando' and iniciado_em > now() - interval '5 minutes')
     or exists (select 1 from net.http_request_queue where url like '%/nexla-radar-editais') then
    return 'ja_em_andamento';
  end if;
  -- evita cliques repetidos: no máximo uma busca manual a cada 3 min
  if exists (select 1 from public.nexla_radar_execucoes
             where lote = 'ro1' and iniciado_em > now() - interval '3 minutes') then
    return 'ja_em_andamento';
  end if;
  perform public.nexla_radar_disparar('ro1', 'botao');
  return 'iniciado';
end;
$$;
revoke all on function public.nexla_radar_buscar_agora() from public, anon;
grant execute on function public.nexla_radar_buscar_agora() to authenticated;

-- ── Agenda: 07h, 12h, 15h, 18h, 23h em Rondônia (UTC-4) = 11, 16, 19, 22, 03 UTC
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nexla_radar_editais') then
    perform cron.unschedule('nexla_radar_editais');
  end if;
end $$;
select cron.schedule('nexla_radar_editais', '0 3,11,16,19,22 * * *',
                     $$select public.nexla_radar_disparar('ro1', 'cron')$$);

-- O token da Edge Function NÃO fica neste arquivo (repo público). É gerado e gravado direto:
--   select vault.create_secret('<TOKEN>', 'nexla_radar_token');
--   insert into nexla_integracao_tokens (nome, token_hash)
--   values ('radar_cron', encode(extensions.digest('<TOKEN>', 'sha256'), 'hex'));
