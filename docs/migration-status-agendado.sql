-- RASCUNHO. infra/supabase/migrations/ é protegido — criar à mão:
--   pnpm supabase migration new agendamentos_status_agendado
--   colar, revisar, pnpm supabase db push
--
-- Novo modelo de status do agendamento:
--   agendado → confirmado → concluido / nao_compareceu / cancelado
-- Sai 'pendente', entra 'agendado'. O app já escreve 'agendado' — sem esta
-- migration o INSERT/UPDATE quebra no CHECK.
-- ============================================================================

-- migra as linhas existentes
UPDATE barbearia_001.agendamentos
   SET status = 'agendado'
 WHERE status = 'pendente';

-- troca o CHECK
ALTER TABLE barbearia_001.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_status_check;

ALTER TABLE barbearia_001.agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('agendado','confirmado','concluido','nao_compareceu','cancelado'));

ALTER TABLE barbearia_001.agendamentos
  ALTER COLUMN status SET DEFAULT 'agendado';
