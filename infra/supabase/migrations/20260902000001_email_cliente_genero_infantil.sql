-- RASCUNHO PARA REVISÃO. Não é uma migration ainda — infra/supabase/migrations/
-- é protegido (escrita à mão).
--
-- Para aplicar:
--   pnpm supabase migration new email_cliente_genero_infantil
--   colar este conteúdo, revisar, e `pnpm supabase db push`
--
-- ORDEM: aplicar ANTES do deploy do app. getPerfilCliente passa a fazer
-- `select` da coluna `email`; sem ela, a query quebra com 42703.
-- ============================================================================

-- 1. E-mail opcional do cliente. Sem UNIQUE de propósito: famílias
--    compartilham e-mail (relevante com o gênero 'infantil' — filhos usam
--    o e-mail do responsável). `telefone` segue como a chave única.
ALTER TABLE barbearia_001.clientes ADD COLUMN email TEXT;

-- 2. Gênero 'infantil'. O CHECK do banco vivo JÁ inclui 'infantil' (aplicado
--    fora do tracking de migration, como o resto do schema). Este bloco é
--    defensivo/idempotente: no-op no banco atual, mas deixa o CHECK rastreado
--    caso o schema seja recriado do zero.
ALTER TABLE barbearia_001.clientes DROP CONSTRAINT IF EXISTS clientes_genero_check;
ALTER TABLE barbearia_001.clientes ADD CONSTRAINT clientes_genero_check
  CHECK (genero = ANY (ARRAY['masculino', 'feminino', 'infantil', 'nao_informado']));

-- PostgREST cacheia o schema; força reload após aplicar.
NOTIFY pgrst, 'reload schema';
