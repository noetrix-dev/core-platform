-- RASCUNHO PARA REVISÃO. Não é uma migration ainda — infra/supabase/migrations/
-- é protegido (escrita à mão).
--
-- Para aplicar:
--   pnpm supabase migration new produtos_itens_atendimento
--   colar este conteúdo, revisar, e `pnpm supabase db push`
-- ============================================================================

-- 1. Produtos (espelha cortesias, com preço de venda e descrição).
CREATE TABLE barbearia_001.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_venda NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade_estoque INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- 2. Itens de um atendimento concluído (serviço principal + extras + produtos).
CREATE TABLE barbearia_001.atendimento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES barbearia_001.atendimentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('servico','produto')),
  servico_id UUID REFERENCES barbearia_001.servicos(id),
  produto_id UUID REFERENCES barbearia_001.produtos(id),
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_atendimento_itens_atendimento
  ON barbearia_001.atendimento_itens (atendimento_id);

-- 3. Conclusão do atendimento v2: agora grava os itens e baixa estoque de produto.
DROP FUNCTION IF EXISTS barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION barbearia_001.fn_concluir_atendimento(
  p_agendamento_id  uuid,
  p_valor           numeric,
  p_forma_pagamento text,
  p_cortesia_id     uuid,
  p_itens           jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_id uuid;
  v_servico_id uuid;
  v_status     text;
  v_atend_id   uuid;
  v_item       jsonb;
  v_qtd        integer;
  v_preco      numeric;
BEGIN
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'valor inválido: %', p_valor;
  END IF;
  IF p_forma_pagamento NOT IN ('pix','cartao_debito','cartao_credito','dinheiro') THEN
    RAISE EXCEPTION 'forma de pagamento inválida: %', p_forma_pagamento;
  END IF;

  SELECT cliente_id, servico_id, status
    INTO v_cliente_id, v_servico_id, v_status
    FROM barbearia_001.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'agendamento % não encontrado', p_agendamento_id;
  END IF;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'agendamento % já concluído', p_agendamento_id;
  END IF;

  INSERT INTO barbearia_001.atendimentos
    (agendamento_id, cliente_id, servico_id, valor_cobrado, forma_pagamento, cortesia_id, realizado_em)
  VALUES
    (p_agendamento_id, v_cliente_id, v_servico_id, p_valor, p_forma_pagamento, p_cortesia_id, now())
  RETURNING id INTO v_atend_id;

  IF p_itens IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_qtd   := GREATEST(1, COALESCE((v_item->>'quantidade')::int, 1));
      v_preco := ROUND(GREATEST(0, COALESCE((v_item->>'preco_unitario')::numeric, 0)), 2);

      INSERT INTO barbearia_001.atendimento_itens
        (atendimento_id, tipo, servico_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
      VALUES (
        v_atend_id,
        v_item->>'tipo',
        CASE WHEN v_item->>'tipo' = 'servico' THEN (v_item->>'ref_id')::uuid END,
        CASE WHEN v_item->>'tipo' = 'produto' THEN (v_item->>'ref_id')::uuid END,
        COALESCE(v_item->>'descricao', ''),
        v_qtd,
        v_preco,
        ROUND(v_qtd * v_preco, 2)
      );

      IF v_item->>'tipo' = 'produto' THEN
        UPDATE barbearia_001.produtos
           SET quantidade_estoque = GREATEST(0, quantidade_estoque - v_qtd)
         WHERE id = (v_item->>'ref_id')::uuid;
      END IF;
    END LOOP;
  END IF;

  UPDATE barbearia_001.agendamentos
     SET status = 'concluido',
         cortesia_id = p_cortesia_id,
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  IF p_cortesia_id IS NOT NULL THEN
    UPDATE barbearia_001.cortesias
       SET quantidade_estoque = GREATEST(0, quantidade_estoque - 1)
     WHERE id = p_cortesia_id;
  END IF;

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid, jsonb) TO service_role;

-- PostgREST cacheia o schema; força um reload após aplicar (o histórico do repo
-- mostra RPCs aplicadas fora do tracking de migration).
NOTIFY pgrst, 'reload schema';
