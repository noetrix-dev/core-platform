-- RASCUNHO PARA REVISÃO. infra/supabase/migrations/ é protegido (escrita à mão).
-- Aplicar: pnpm supabase migration new codigos_verificacao → colar → revisar → pnpm supabase db push
-- ORDEM: aplicar ANTES do deploy do app (Server Actions de /agendar dependem desta tabela).

create table barbearia_001.codigos_verificacao (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  codigo text not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  email text,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_codigos_verificacao_telefone
  on barbearia_001.codigos_verificacao (telefone, usado, expira_em);

-- Spec B (/agendar): agendamento self-service grava origem 'site'.
alter table barbearia_001.agendamentos
  drop constraint agendamentos_origem_check;
alter table barbearia_001.agendamentos
  add constraint agendamentos_origem_check check (origem = any (array[
    'dashboard', 'whatsapp_bot', 'fila_espera', 'encaixe', 'manual', 'migracao', 'site'
  ]));

-- fn_criar_agendamento_v2 valida a origem numa lista fixa no corpo — sem
-- isto, 'site' falha com "Origem inválida" mesmo com a constraint acima.
-- Corpo copiado de pg_get_functiondef (2026-10-04); ÚNICA mudança: + 'site'
-- na lista de origem (conferido por md5 contra a definição ao vivo).
-- CREATE OR REPLACE mantém os GRANTs existentes. Usada também pelo bot do WhatsApp.
CREATE OR REPLACE FUNCTION barbearia_001.fn_criar_agendamento_v2(p_cliente_id uuid, p_servicos uuid[], p_inicio timestamp with time zone, p_cortesia_id uuid DEFAULT NULL::uuid, p_estilo_musica_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'whatsapp_bot'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_qtd_informada integer;
    v_qtd_distinta integer;
    v_qtd_validos integer;

    v_duracao_total integer;
    v_valor_total numeric(10,2);

    v_servico_principal uuid;

    v_validacao jsonb;

    v_slot_id uuid;
    v_agendamento_id uuid;
BEGIN

    -- --------------------------------------------------------
    -- Lock global da agenda desta barbearia.
    -- Evita duas reservas simultâneas passarem pela validação.
    -- --------------------------------------------------------

    PERFORM pg_advisory_xact_lock(
        hashtextextended('barbearia_001:agenda', 0)
    );


    -- --------------------------------------------------------
    -- Cliente
    -- --------------------------------------------------------

    PERFORM 1
    FROM barbearia_001.clientes
    WHERE id = p_cliente_id
      AND ativo = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente inexistente ou inativo.';
    END IF;


    -- --------------------------------------------------------
    -- Serviços
    -- --------------------------------------------------------

    IF p_servicos IS NULL
       OR cardinality(p_servicos) = 0
    THEN
        RAISE EXCEPTION 'Informe ao menos um serviço.';
    END IF;


    v_qtd_informada := cardinality(p_servicos);


    SELECT COUNT(DISTINCT x)
    INTO v_qtd_distinta
    FROM unnest(p_servicos) x;


    IF v_qtd_distinta <> v_qtd_informada THEN
        RAISE EXCEPTION 'A lista possui serviços duplicados.';
    END IF;


    SELECT
        COUNT(*),
        SUM(duracao_minutos)::integer,
        SUM(preco)::numeric(10,2)
    INTO
        v_qtd_validos,
        v_duracao_total,
        v_valor_total
    FROM barbearia_001.servicos
    WHERE id = ANY(p_servicos)
      AND ativo = true;


    IF v_qtd_validos <> v_qtd_informada THEN
        RAISE EXCEPTION
            'Um ou mais serviços não existem ou estão inativos.';
    END IF;


    v_servico_principal := p_servicos[1];


    -- --------------------------------------------------------
    -- Cortesia
    -- --------------------------------------------------------

    IF p_cortesia_id IS NOT NULL THEN

        PERFORM 1
        FROM barbearia_001.cortesias
        WHERE id = p_cortesia_id
          AND ativo = true
          AND quantidade_estoque > 0;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Cortesia inexistente, inativa ou sem estoque.';
        END IF;

    END IF;


    -- --------------------------------------------------------
    -- Estilo musical
    -- --------------------------------------------------------

    IF p_estilo_musica_id IS NOT NULL THEN

        PERFORM 1
        FROM barbearia_001.estilos_musica
        WHERE id = p_estilo_musica_id
          AND ativo = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Estilo musical inexistente ou inativo.';
        END IF;

    END IF;


    -- --------------------------------------------------------
    -- Origem
    -- --------------------------------------------------------

    IF p_origem NOT IN (
        'dashboard',
        'whatsapp_bot',
        'fila_espera',
        'encaixe',
        'manual',
        'migracao',
        'site'
    ) THEN

        RAISE EXCEPTION 'Origem inválida: %', p_origem;

    END IF;


    -- --------------------------------------------------------
    -- Revalida disponibilidade dentro da transação
    -- --------------------------------------------------------

    v_validacao :=
        barbearia_001.fn_validar_disponibilidade(
            p_inicio,
            v_duracao_total,
            NULL
        );


    IF NOT COALESCE(
        (v_validacao ->> 'disponivel')::boolean,
        false
    ) THEN

        RAISE EXCEPTION
            'Horário indisponível [%]: %',
            COALESCE(v_validacao ->> 'codigo', 'ERRO'),
            COALESCE(
                v_validacao ->> 'motivo',
                'Horário indisponível.'
            );

    END IF;


    -- --------------------------------------------------------
    -- Cria/reaproveita slot técnico
    -- --------------------------------------------------------

    INSERT INTO barbearia_001.slots (
        data_hora,
        duracao_minutos,
        disponivel
    )
    VALUES (
        p_inicio,
        v_duracao_total,
        false
    )

    ON CONFLICT (data_hora)
    DO UPDATE SET
        duracao_minutos = EXCLUDED.duracao_minutos,
        disponivel = false

    RETURNING id
    INTO v_slot_id;


    -- --------------------------------------------------------
    -- Agendamento
    -- --------------------------------------------------------

    INSERT INTO barbearia_001.agendamentos (
        slot_id,
        cliente_id,
        servico_id,
        duracao_minutos,
        status,
        cortesia_id,
        estilo_musica_id,
        valor_total,
        origem,
        encaixe
    )
    VALUES (
        v_slot_id,
        p_cliente_id,
        v_servico_principal,
        v_duracao_total,
        'agendado',
        p_cortesia_id,
        p_estilo_musica_id,
        v_valor_total,
        p_origem,
        false
    )
    RETURNING id
    INTO v_agendamento_id;


    -- --------------------------------------------------------
    -- Snapshot dos serviços
    -- --------------------------------------------------------

    INSERT INTO barbearia_001.agendamento_servicos (
        agendamento_id,
        servico_id,
        duracao_minutos,
        preco_unitario,
        ordem
    )

    SELECT
        v_agendamento_id,
        s.id,
        s.duracao_minutos,
        s.preco,
        u.ordem::integer

    FROM unnest(p_servicos)
        WITH ORDINALITY AS u(servico_id, ordem)

    JOIN barbearia_001.servicos s
      ON s.id = u.servico_id

    ORDER BY u.ordem;


    -- --------------------------------------------------------
    -- Auditoria
    -- --------------------------------------------------------

    INSERT INTO barbearia_001.agendamento_eventos (
        agendamento_id,
        cliente_id,
        tipo,
        origem,
        dados
    )
    VALUES (
        v_agendamento_id,
        p_cliente_id,
        'agendamento_criado',
        p_origem,
        jsonb_build_object(
            'inicio', p_inicio,
            'duracao_minutos', v_duracao_total,
            'valor_total', v_valor_total,
            'servicos', to_jsonb(p_servicos)
        )
    );


    RETURN jsonb_build_object(
        'sucesso', true,
        'agendamento_id', v_agendamento_id,
        'slot_id', v_slot_id,
        'inicio', p_inicio,
        'fim',
            p_inicio
            + make_interval(mins => v_duracao_total),
        'duracao_total', v_duracao_total,
        'valor_total', v_valor_total
    );

END;
$function$;

GRANT ALL ON ALL TABLES IN SCHEMA barbearia_001 TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA barbearia_001 TO service_role;

NOTIFY pgrst, 'reload schema';
