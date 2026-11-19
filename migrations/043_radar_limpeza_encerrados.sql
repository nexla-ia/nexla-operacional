-- ============================================================
-- Migration 043 — Radar de Editais: limpeza de encerrados
--
-- Na tela, edital com prazo vencido já sai das listas (vai para "Encerrados").
-- Aqui, uma rotina diária (04h de Rondônia = 08h UTC) apaga do banco:
--   * encerrados há mais de 60 dias (novos/descartados)
--   * interessantes encerrados há mais de 1 ano (ficam mais tempo como histórico)
--   * histórico de execuções do radar com mais de 30 dias
-- ============================================================

create or replace function public.nexla_radar_limpar()
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_editais int;
  v_execs   int;
begin
  delete from public.nexla_editais
  where encerramento_propostas is not null
    and (
      (status <> 'interessante' and encerramento_propostas < now() - interval '60 days')
      or (status = 'interessante' and encerramento_propostas < now() - interval '365 days')
    );
  get diagnostics v_editais = row_count;

  delete from public.nexla_radar_execucoes where iniciado_em < now() - interval '30 days';
  get diagnostics v_execs = row_count;

  return jsonb_build_object('editais_apagados', v_editais, 'execucoes_apagadas', v_execs);
end;
$$;
revoke all on function public.nexla_radar_limpar() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nexla_radar_limpeza') then
    perform cron.unschedule('nexla_radar_limpeza');
  end if;
end $$;
select cron.schedule('nexla_radar_limpeza', '0 8 * * *', $$select public.nexla_radar_limpar()$$);
