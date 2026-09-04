-- RPC transacional: registra um pagamento de dívida.
-- Insere a transação (movement=expense, debt_id) e abate remaining_amount na
-- mesma transação, com FOR UPDATE na linha da dívida. Zera -> status quitada.

CREATE OR REPLACE FUNCTION financas.fn_registrar_pagamento_divida(
  p_debt_id UUID,
  p_amount NUMERIC,
  p_account_id UUID,
  p_due_date DATE,
  p_status TEXT
) RETURNS financas.fin_transactions
LANGUAGE plpgsql
AS $$
DECLARE
  v_debt financas.fin_debts;
  v_tx financas.fin_transactions;
  v_novo_restante NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'valor invalido';
  END IF;
  IF p_status NOT IN ('pending','paid','overdue') THEN
    RAISE EXCEPTION 'status invalido';
  END IF;

  SELECT * INTO v_debt FROM financas.fin_debts WHERE id = p_debt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'divida nao encontrada';
  END IF;

  v_novo_restante := greatest(0, v_debt.remaining_amount - p_amount);

  INSERT INTO financas.fin_transactions
    (description, amount, movement, type, due_date, payment_date, status,
     account_id, debt_id, source)
  VALUES
    ('Pagamento: ' || v_debt.creditor, p_amount, 'expense', 'fixed',
     p_due_date,
     CASE WHEN p_status = 'paid' THEN p_due_date ELSE NULL END,
     p_status, p_account_id, p_debt_id, 'manual')
  RETURNING * INTO v_tx;

  UPDATE financas.fin_debts
     SET remaining_amount = v_novo_restante,
         status = CASE WHEN v_novo_restante = 0 THEN 'quitada' ELSE status END,
         atualizado_em = now()
   WHERE id = p_debt_id;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION financas.fn_registrar_pagamento_divida(UUID, NUMERIC, UUID, DATE, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
