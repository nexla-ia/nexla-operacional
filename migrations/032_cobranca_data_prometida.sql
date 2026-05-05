-- ============================================================
-- Migration: 032 — Cobranças: data prometida de pagamento
-- Permite reagendar a cobrança para uma data combinada com o cliente
-- ============================================================
alter table public.cobranca_pagamentos
  add column if not exists data_prometida date;

create index if not exists cobranca_pagamentos_data_prometida_idx
  on public.cobranca_pagamentos (data_prometida);
