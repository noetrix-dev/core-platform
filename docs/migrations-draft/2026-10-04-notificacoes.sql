-- RASCUNHO PARA REVISÃO. infra/supabase/migrations/ é protegido (escrita à mão).
-- Aplicar: pnpm supabase migration new notificacoes → colar → revisar → pnpm supabase db push
-- ORDEM: aplicar ANTES do deploy do sino (as Server Actions leem esta tabela;
-- sem ela o painel só mostra "Não foi possível carregar as notificações").
-- Spec: docs/superpowers/specs/2026-10-04-notificacoes-painel-design.md

-- não segurar o bot: desiste se não pegar o lock em 5 s (rodar de novo)
set lock_timeout = '5s';

create table barbearia_001.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('agendamento_criado', 'agendamento_cancelado', 'agendamento_remarcado')),
  canal text not null check (canal in ('site', 'whatsapp_bot')),
  cliente_id uuid references barbearia_001.clientes (id) on delete set null,
  agendamento_id uuid references barbearia_001.agendamentos (id) on delete set null,
  -- um evento do log gera no máximo uma notificação (idempotência)
  evento_id uuid unique references barbearia_001.agendamento_eventos (id) on delete set null,
  -- horário antigo de uma remarcação
  inicio_anterior timestamptz,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_notificacoes_lida_criado
  on barbearia_001.notificacoes (lida, criado_em desc);

-- Lê o log agendamento_eventos (gravado por todas as RPCs v2), não a tabela
-- agendamentos: agendamentos.origem é o canal que CRIOU o agendamento; o canal
-- de quem cancelou/remarcou só existe em agendamento_eventos.origem.
--
-- Remarcação pelo site (Spec C) = dois eventos em transações separadas:
-- agendamento_criado (novo) e, segundos depois, agendamento_cancelado com
-- dados.motivo = 'remarcado' (antigo). O cancelamento funde no último "criado"
-- do site do mesmo cliente nos últimos 2 min (lido ou não), vira "remarcado"
-- e volta a não lida.
-- Remarcação pelo bot = um evento agendamento_remarcado (move o mesmo agendamento).
--
-- Roda dentro da transação das RPCs de agendar/cancelar (também usadas pelo
-- bot): qualquer erro aqui vira WARNING e o agendamento segue.
create or replace function barbearia_001.fn_notificar_evento()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  begin
    if new.tipo = 'agendamento_criado' then
      insert into barbearia_001.notificacoes (tipo, canal, cliente_id, agendamento_id, evento_id)
      values ('agendamento_criado', new.origem, new.cliente_id, new.agendamento_id, new.id)
      on conflict (evento_id) do nothing;

    elsif new.tipo = 'agendamento_remarcado' then
      insert into barbearia_001.notificacoes
        (tipo, canal, cliente_id, agendamento_id, evento_id, inicio_anterior)
      values (
        'agendamento_remarcado', new.origem, new.cliente_id, new.agendamento_id, new.id,
        (new.dados ->> 'inicio_anterior')::timestamptz
      )
      on conflict (evento_id) do nothing;

    elsif new.tipo = 'agendamento_cancelado' then
      if new.origem = 'site' and new.dados ->> 'motivo' = 'remarcado' then
        -- ponytail: casa só por cliente + canal + 2 min; duas remarcações simultâneas do mesmo cliente (duas abas) podem fundir na linha errada.
        select n.id
          into v_id
          from barbearia_001.notificacoes n
         where n.tipo = 'agendamento_criado'
           and n.canal = 'site'
           and n.cliente_id = new.cliente_id
           and n.criado_em > now() - interval '2 minutes'
         order by n.criado_em desc
         limit 1
         for update;

        if v_id is not null then
          update barbearia_001.notificacoes
             set tipo = 'agendamento_remarcado',
                 inicio_anterior = (new.dados ->> 'inicio_liberado')::timestamptz,
                 lida = false
           where id = v_id;
        else
          insert into barbearia_001.notificacoes
            (tipo, canal, cliente_id, agendamento_id, evento_id, inicio_anterior)
          values (
            'agendamento_remarcado', new.origem, new.cliente_id, new.agendamento_id, new.id,
            (new.dados ->> 'inicio_liberado')::timestamptz
          )
          on conflict (evento_id) do nothing;
        end if;
      else
        insert into barbearia_001.notificacoes (tipo, canal, cliente_id, agendamento_id, evento_id)
        values ('agendamento_cancelado', new.origem, new.cliente_id, new.agendamento_id, new.id)
        on conflict (evento_id) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'fn_notificar_evento: % (evento %)', sqlerrm, new.id;
  end;

  return new;
end;
$function$;

create trigger trg_notificar_evento
  after insert on barbearia_001.agendamento_eventos
  for each row
  when (
    new.origem in ('site', 'whatsapp_bot')
    and new.tipo in ('agendamento_criado', 'agendamento_cancelado', 'agendamento_remarcado')
  )
  execute function barbearia_001.fn_notificar_evento();

GRANT ALL ON barbearia_001.notificacoes TO service_role;

NOTIFY pgrst, 'reload schema';

-- Desfazer:
-- drop trigger trg_notificar_evento on barbearia_001.agendamento_eventos;
-- drop function barbearia_001.fn_notificar_evento();
-- drop table barbearia_001.notificacoes;
