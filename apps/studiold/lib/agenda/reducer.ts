// Reducer puro da agenda — sem React, para poder rodar num check de node.
// Trocar por Supabase = reimplementar cada ação como query no schema do tenant
// (operações de fila com SELECT ... FOR UPDATE, conforme .claude/rules/database.md).

import type { AgendaData, Agendamento, Cliente } from "./types";
import { buildSeed } from "./seed.ts";
import { addMinutesIso, isoAt } from "./time.ts";

export const JANELA_FILA_MIN = 15;

export type Action =
  | { type: "TICK"; now: number }
  | { type: "HYDRATE"; dayKey: string; data: AgendaData }
  | { type: "CONFIRMAR_PRESENCA"; agId: string }
  | { type: "CHECK_IN"; agId: string }
  | { type: "CONCLUIR"; agId: string }
  | { type: "FALTOU"; agId: string }
  | { type: "CANCELAR"; agId: string }
  | { type: "NOTIFICAR_FILA"; filaId: string }
  | { type: "CONFIRMAR_FILA"; filaId: string; inicioMin: number }
  | { type: "ACEITAR_ENCAIXE"; encId: string }
  | { type: "RECUSAR_ENCAIXE"; encId: string }
  | {
      type: "AGENDAR";
      nome: string;
      telefone: string;
      clienteId?: string;
      servicoId: string;
      cortesiaId?: string;
      inicioMin: number;
      naCadeira?: boolean;
      origem: Agendamento["origem"];
    }
  | {
      type: "BLOQUEAR";
      dataKey: string;
      horaInicio: string;
      horaFim: string;
      descricao: string;
    }
  | { type: "AVISO"; texto: string }
  | { type: "LIMPAR_AVISO" };

export interface State {
  dayKey: string;
  data: AgendaData;
  aviso: string | null;
  avisoId: number;
}

/** `data` vem do servidor (lib/agenda/load). Sem `data`, cai no mock — usado
 *  só pelo check de node. */
export function initState(dayKey: string, data?: AgendaData): State {
  return { dayKey, data: data ?? buildSeed(dayKey), aviso: null, avisoId: 0 };
}

function upd<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

function limparCadeira(ags: Agendamento[]): Agendamento[] {
  return ags.map((a) => (a.em_atendimento ? { ...a, em_atendimento: false } : a));
}

function avisar(state: State, texto: string): State {
  return { ...state, aviso: texto, avisoId: state.avisoId + 1 };
}

export function reducer(state: State, action: Action): State {
  const d = state.data;

  switch (action.type) {
    case "HYDRATE":
      // troca a verdade local pela do servidor (carga inicial, troca de dia,
      // reconciliação depois de uma mutação). Preserva o aviso em curso.
      return {
        dayKey: action.dayKey,
        data: action.data,
        aviso: state.aviso,
        avisoId: state.avisoId,
      };

    case "TICK": {
      const fila = d.fila.map((f) =>
        f.status === "notificado" &&
        f.expira_em &&
        new Date(f.expira_em).getTime() <= action.now
          ? { ...f, status: "expirado" as const }
          : f,
      );
      const encaixes = d.encaixes.map((e) =>
        e.status === "pendente" && new Date(e.expira_em).getTime() <= action.now
          ? { ...e, status: "expirado" as const }
          : e,
      );
      const mudou =
        fila.some((f, i) => f !== d.fila[i]) ||
        encaixes.some((e, i) => e !== d.encaixes[i]);
      return mudou ? { ...state, data: { ...d, fila, encaixes } } : state;
    }

    case "CONFIRMAR_PRESENCA":
      // agendado → confirmado (cliente confirmou / apareceu)
      return {
        ...state,
        data: {
          ...d,
          agendamentos: upd(d.agendamentos, action.agId, { status: "confirmado" }),
        },
      };

    case "CHECK_IN":
      return {
        ...state,
        data: {
          ...d,
          agendamentos: upd(limparCadeira(d.agendamentos), action.agId, {
            em_atendimento: true,
            status: "confirmado",
          }),
        },
      };

    case "CONCLUIR":
      return {
        ...state,
        data: {
          ...d,
          agendamentos: upd(d.agendamentos, action.agId, {
            status: "concluido",
            em_atendimento: false,
          }),
        },
      };

    case "FALTOU":
      return {
        ...state,
        data: {
          ...d,
          agendamentos: upd(d.agendamentos, action.agId, {
            status: "nao_compareceu",
            em_atendimento: false,
          }),
        },
      };

    case "CANCELAR": {
      const ag = d.agendamentos.find((a) => a.id === action.agId);
      let fila = d.fila;
      let texto = "Agendamento cancelado.";
      const proximo = d.fila
        .filter((f) => f.status === "aguardando" && f.data_desejada === state.dayKey)
        .sort((a, b) => a.posicao - b.posicao)[0];
      if (ag && proximo) {
        const cli = d.clientes.find((c) => c.id === proximo.cliente_id);
        fila = upd(d.fila, proximo.id, {
          status: "notificado",
          notificado_em: new Date().toISOString(),
          expira_em: addMinutesIso(new Date().toISOString(), JANELA_FILA_MIN),
        });
        texto = `Vaga aberta. ${cli?.nome ?? "Próximo da fila"} foi avisado — ${JANELA_FILA_MIN} min para responder.`;
      }
      return avisar(
        {
          ...state,
          data: {
            ...d,
            agendamentos: upd(d.agendamentos, action.agId, {
              status: "cancelado",
              em_atendimento: false,
            }),
            fila,
          },
        },
        texto,
      );
    }

    case "NOTIFICAR_FILA": {
      const f = d.fila.find((x) => x.id === action.filaId);
      const cli = d.clientes.find((c) => c.id === f?.cliente_id);
      return avisar(
        {
          ...state,
          data: {
            ...d,
            fila: upd(d.fila, action.filaId, {
              status: "notificado",
              notificado_em: new Date().toISOString(),
              expira_em: addMinutesIso(new Date().toISOString(), JANELA_FILA_MIN),
            }),
          },
        },
        `${cli?.nome ?? "Cliente"} avisado na fila — ${JANELA_FILA_MIN} min para responder.`,
      );
    }

    case "CONFIRMAR_FILA": {
      const f = d.fila.find((x) => x.id === action.filaId);
      if (!f) return state;
      const nova: Agendamento = {
        id: crypto.randomUUID(),
        cliente_id: f.cliente_id,
        servico_id: f.servico_id ?? d.servicos[0].id,
        inicio: isoAt(state.dayKey, action.inicioMin),
        duracao_minutos:
          d.servicos.find((s) => s.id === f.servico_id)?.duracao_minutos ?? 30,
        status: "confirmado",
        origem: "encaixe",
      };
      return avisar(
        {
          ...state,
          data: {
            ...d,
            agendamentos: [...d.agendamentos, nova],
            fila: upd(d.fila, action.filaId, { status: "confirmado" }),
          },
        },
        "Cliente da fila encaixado na agenda.",
      );
    }

    case "ACEITAR_ENCAIXE": {
      const e = d.encaixes.find((x) => x.id === action.encId);
      if (!e) return state;
      const nova: Agendamento = {
        id: crypto.randomUUID(),
        cliente_id: e.cliente_id,
        servico_id: e.servico_id,
        inicio: e.horario_solicitado,
        duracao_minutos:
          d.servicos.find((s) => s.id === e.servico_id)?.duracao_minutos ?? 30,
        status: "confirmado",
        origem: "encaixe",
      };
      return avisar(
        {
          ...state,
          data: {
            ...d,
            agendamentos: [...d.agendamentos, nova],
            encaixes: upd(d.encaixes, action.encId, {
              status: "confirmado",
              agendamento_id: nova.id,
            }),
          },
        },
        "Encaixe aceito e colocado na agenda.",
      );
    }

    case "RECUSAR_ENCAIXE":
      return {
        ...state,
        data: {
          ...d,
          encaixes: upd(d.encaixes, action.encId, { status: "recusado" }),
        },
      };

    case "AGENDAR": {
      let clientes = d.clientes;
      let clienteId = action.clienteId;
      if (!clienteId) {
        const achado = d.clientes.find(
          (c) => c.telefone.replace(/\D/g, "") === action.telefone.replace(/\D/g, ""),
        );
        if (achado) {
          clienteId = achado.id;
        } else {
          const novo: Cliente = {
            id: crypto.randomUUID(),
            nome: action.nome.trim(),
            telefone: action.telefone.trim(),
            genero: "nao_informado",
            total_visitas: 0,
          };
          clientes = [...d.clientes, novo];
          clienteId = novo.id;
        }
      }
      const servico = d.servicos.find((s) => s.id === action.servicoId)!;
      const cortesia = action.cortesiaId
        ? d.cortesias.find((c) => c.id === action.cortesiaId)
        : undefined;
      const nova: Agendamento = {
        id: crypto.randomUUID(),
        cliente_id: clienteId,
        servico_id: action.servicoId,
        inicio: isoAt(state.dayKey, action.inicioMin),
        duracao_minutos: servico.duracao_minutos,
        // na cadeira agora = presença confirmada; senão só agendado
        status: action.naCadeira ? "confirmado" : "agendado",
        origem: action.origem,
        // cortesia no agendamento é só intenção — não baixa estoque aqui
        cortesia_id: action.cortesiaId,
        cortesia_nome: cortesia?.nome,
        em_atendimento: action.naCadeira ?? false,
      };
      const ags = action.naCadeira
        ? [...limparCadeira(d.agendamentos), nova]
        : [...d.agendamentos, nova];
      return avisar(
        { ...state, data: { ...d, clientes, agendamentos: ags } },
        action.origem === "walkin" ? "Walk-in adicionado." : "Agendamento criado.",
      );
    }

    case "BLOQUEAR":
      return avisar(
        {
          ...state,
          data: {
            ...d,
            bloqueios_pontuais: [
              ...d.bloqueios_pontuais,
              {
                id: crypto.randomUUID(),
                descricao: action.descricao || undefined,
                data: action.dataKey,
                hora_inicio: action.horaInicio,
                hora_fim: action.horaFim,
              },
            ],
          },
        },
        "Horário bloqueado.",
      );

    case "AVISO":
      return avisar(state, action.texto);

    case "LIMPAR_AVISO":
      return { ...state, aviso: null };

    default:
      return state;
  }
}
