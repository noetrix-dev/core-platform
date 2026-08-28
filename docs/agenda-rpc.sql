-- ============================================================================
-- Funções RPC da agenda — operações de fila com SELECT ... FOR UPDATE.
--
-- RASCUNHO PARA REVISÃO. Não aplicar direto. Mover para uma migration:
--   pnpm supabase migration new agenda_rpc_fila
-- colar o conteúdo, revisar à mão, e então `pnpm supabase db push`.
--
-- Pré-requisitos no projeto Supabase:
--   1. schema `barbearia_001` exposto no PostgREST
--      (Dashboard > Settings > API > Exposed schemas, ou config.toml [api] schemas).
--   2. As tabelas de infra/supabase/migrations/20260825000002_* já criadas.
--
-- Convenção: a agenda é fila única (um profissional). Fuso do tenant:
-- America/Sao_Paulo.
-- ============================================================================

set search_path = barbearia_001, public;

-- ---------------------------------------------------------------------------
-- Cancela um agendamento, libera o slot e avisa o topo da fila de espera
-- daquele dia (15 min para responder). Retorna o id da linha da fila avisada,
-- ou null se não havia ninguém aguardando.
-- ---------------------------------------------------------------------------
create or replace function barbearia_001.fn_cancelar_agendamento(
  p_agendamento_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_slot_id   uuid;
  v_data_hora timestamptz;
  v_data      date;
  v_fila_id   uuid;
begin
  update barbearia_001.agendamentos
     set status = 'cancelado', atualizado_em = now()
   where id = p_agendamento_id
  returning slot_id into v_slot_id;

  if v_slot_id is null then
    raise exception 'agendamento % não encontrado', p_agendamento_id;
  end if;

  update barbearia_001.slots
     set disponivel = true
   where id = v_slot_id
  returning data_hora into v_data_hora;

  v_data := (v_data_hora at time zone 'America/Sao_Paulo')::date;

  select id
    into v_fila_id
    from barbearia_001.fila_espera
   where status = 'aguardando'
     and data_desejada = v_data
   order by posicao
     for update skip locked
   limit 1;

  if v_fila_id is not null then
    update barbearia_001.fila_espera
       set status       = 'notificado',
           notificado_em = now(),
           expira_em     = now() + interval '15 minutes'
     where id = v_fila_id;
  end if;

  return v_fila_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avisa manualmente uma pessoa da fila (15 min para responder).
-- ---------------------------------------------------------------------------
create or replace function barbearia_001.fn_notificar_fila(
  p_fila_id uuid
)
returns void
language plpgsql
as $$
declare
  v_status text;
begin
  select status
    into v_status
    from barbearia_001.fila_espera
   where id = p_fila_id
     for update;

  if v_status is null then
    raise exception 'fila_espera % não encontrada', p_fila_id;
  end if;
  if v_status <> 'aguardando' then
    raise exception 'fila_espera % não está aguardando (status=%)', p_fila_id, v_status;
  end if;

  update barbearia_001.fila_espera
     set status       = 'notificado',
         notificado_em = now(),
         expira_em     = now() + interval '15 minutes'
   where id = p_fila_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirma alguém da fila num horário livre: reserva o slot, cria o
-- agendamento e fecha a linha da fila.
-- ---------------------------------------------------------------------------
create or replace function barbearia_001.fn_confirmar_fila(
  p_fila_id uuid,
  p_inicio  timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_servico_id uuid;
  v_dur        integer;
  v_slot_id    uuid;
  v_ag_id      uuid;
begin
  select cliente_id, servico_id
    into v_cliente_id, v_servico_id
    from barbearia_001.fila_espera
   where id = p_fila_id
     for update;

  if v_cliente_id is null then
    raise exception 'fila_espera % não encontrada', p_fila_id;
  end if;

  select coalesce(duracao_minutos, 30)
    into v_dur
    from barbearia_001.servicos
   where id = v_servico_id;
  v_dur := coalesce(v_dur, 30);

  insert into barbearia_001.slots (data_hora, duracao_minutos, disponivel)
  values (p_inicio, v_dur, false)
  on conflict (data_hora) do update set disponivel = false
  returning id into v_slot_id;

  insert into barbearia_001.agendamentos
    (slot_id, cliente_id, servico_id, duracao_minutos, status)
  values
    (v_slot_id, v_cliente_id, v_servico_id, v_dur, 'confirmado')
  returning id into v_ag_id;

  update barbearia_001.fila_espera
     set status = 'confirmado'
   where id = p_fila_id;

  return v_ag_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceita um pedido de encaixe: reserva o slot no horário pedido, cria o
-- agendamento e amarra ao pedido.
-- ---------------------------------------------------------------------------
create or replace function barbearia_001.fn_aceitar_encaixe(
  p_pedido_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_servico_id uuid;
  v_inicio     timestamptz;
  v_status     text;
  v_dur        integer;
  v_slot_id    uuid;
  v_ag_id      uuid;
begin
  select cliente_id, servico_id, horario_solicitado, status
    into v_cliente_id, v_servico_id, v_inicio, v_status
    from barbearia_001.pedidos_encaixe
   where id = p_pedido_id
     for update;

  if v_cliente_id is null then
    raise exception 'pedido_encaixe % não encontrado', p_pedido_id;
  end if;
  if v_status <> 'pendente' then
    raise exception 'pedido_encaixe % não está pendente (status=%)', p_pedido_id, v_status;
  end if;

  select coalesce(duracao_minutos, 30)
    into v_dur
    from barbearia_001.servicos
   where id = v_servico_id;
  v_dur := coalesce(v_dur, 30);

  insert into barbearia_001.slots (data_hora, duracao_minutos, disponivel)
  values (v_inicio, v_dur, false)
  on conflict (data_hora) do update set disponivel = false
  returning id into v_slot_id;

  insert into barbearia_001.agendamentos
    (slot_id, cliente_id, servico_id, duracao_minutos, status)
  values
    (v_slot_id, v_cliente_id, v_servico_id, v_dur, 'confirmado')
  returning id into v_ag_id;

  update barbearia_001.pedidos_encaixe
     set status = 'confirmado', agendamento_id = v_ag_id, atualizado_em = now()
   where id = p_pedido_id;

  return v_ag_id;
end;
$$;

-- A app acessa via service-role (bypassa RLS). Grants explícitos por garantia:
grant execute on function barbearia_001.fn_cancelar_agendamento(uuid) to service_role;
grant execute on function barbearia_001.fn_notificar_fila(uuid)        to service_role;
grant execute on function barbearia_001.fn_confirmar_fila(uuid, timestamptz) to service_role;
grant execute on function barbearia_001.fn_aceitar_encaixe(uuid)       to service_role;
