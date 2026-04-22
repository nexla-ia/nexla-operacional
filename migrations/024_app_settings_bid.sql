-- Adiciona taxa bid (compra) separada da ask (venda) para referência
alter table public.app_settings
  add column if not exists usd_brl_bid numeric(10,4);

-- Renomeia usd_brl_rate para representar a taxa ask (venda) usada em custos
comment on column public.app_settings.usd_brl_rate    is 'Taxa ask (venda) – usada para calcular custo de tokens em BRL';
comment on column public.app_settings.usd_brl_bid     is 'Taxa bid (compra) – referência de mercado';
comment on column public.app_settings.currency_provider is 'Provedor fixo: awesomeapi';
