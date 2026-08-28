-- RASCUNHO. infra/supabase/migrations/ é protegido — criar à mão:
--   pnpm supabase migration new concluir_atendimento
--   colar o conteúdo abaixo, revisar, pnpm supabase db push
--
-- Conclusão do atendimento numa transação: grava atendimentos, marca o
-- agendamento como concluido e baixa 1 no estoque da cortesia servida.
-- A cortesia servida também é sincronizada em agendamentos.cortesia_id.
-- ============================================================================

ALTER TABLE barbearia_001.atendimentos
  ADD COLUMN IF NOT EXISTS cortesia_id UUID REFERENCES barbearia_001.cortesias(id);

create or replace function barbearia_001.fn_concluir_atendimento(
  p_agendamento_id  uuid,
  p_valor           numeric,
  p_forma_pagamento text,
  p_cortesia_id     uuid
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_servico_id uuid;
  v_status     text;
  v_atend_id   uuid;
begin
  if p_valor is null or p_valor < 0 then
    raise exception 'valor inválido: %', p_valor;
  end if;
  if p_forma_pagamento not in ('pix','cartao_debito','cartao_credito','dinheiro') then
    raise exception 'forma de pagamento inválida: %', p_forma_pagamento;
  end if;

  select cliente_id, servico_id, status
    into v_cliente_id, v_servico_id, v_status
    from barbearia_001.agendamentos
   where id = p_agendamento_id
     for update;

  if v_cliente_id is null then
    raise exception 'agendamento % não encontrado', p_agendamento_id;
  end if;
  if v_status = 'concluido' then
    raise exception 'agendamento % já concluído', p_agendamento_id;
  end if;

  insert into barbearia_001.atendimentos
    (agendamento_id, cliente_id, servico_id, valor_cobrado, forma_pagamento, cortesia_id, realizado_em)
  values
    (p_agendamento_id, v_cliente_id, v_servico_id, p_valor, p_forma_pagamento, p_cortesia_id, now())
  returning id into v_atend_id;

  update barbearia_001.agendamentos
     set status = 'concluido',
         cortesia_id = p_cortesia_id,
         atualizado_em = now()
   where id = p_agendamento_id;

  if p_cortesia_id is not null then
    update barbearia_001.cortesias
       set quantidade_estoque = greatest(0, quantidade_estoque - 1)
     where id = p_cortesia_id;
  end if;

  return v_atend_id;
end;
$$;

grant execute on function
  barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid) to service_role;
