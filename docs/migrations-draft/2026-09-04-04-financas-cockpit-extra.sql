-- Cockpit Fase 1 revisado: blocos Cartões (manual) e Noetrix (manual).
-- ANTES DE APLICAR: mesma ordem das migrations anteriores (depois da 01/02/03).

ALTER TABLE financas.fin_accounts
  ADD COLUMN fatura_atual NUMERIC(14,2),
  ADD COLUMN limite_disponivel NUMERIC(14,2);

CREATE TABLE financas.fin_noetrix_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  mes DATE NOT NULL,
  mrr NUMERIC(14,2) NOT NULL DEFAULT 0,
  clientes_pagantes INT NOT NULL DEFAULT 0,
  churn_pct NUMERIC(5,2),
  custo_operacional NUMERIC(14,2),
  reserva_meses NUMERIC(5,2),
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, mes)
);

GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA financas TO service_role;
NOTIFY pgrst, 'reload schema';
