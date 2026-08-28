"use client";

// Contexto React em volta do reducer puro (./reducer).
//
// Fluxo com Supabase (path A): os dados chegam prontos do servidor via prop
// `data` (lib/agenda/load, chamado no RSC). Cada mutação faz update otimista
// no reducer e chama a Server Action correspondente; no fim, router.refresh()
// repuxa a verdade do banco e o HYDRATE reconcilia. O reducer não sabe de
// nada disso.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AgendaData, Cliente, Servico } from "./types";
import { reducer, initState, type Action, type State } from "./reducer.ts";
import {
  aceitarEncaixe,
  agendar,
  bloquear,
  cancelar,
  confirmarFila,
  mudarStatus,
  notificarFila,
  recusarEncaixe,
} from "@/app/agenda/actions";

export type { Action, State } from "./reducer.ts";

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
}
const AgendaCtx = createContext<Ctx | null>(null);

type Resultado = { ok: true } | { ok: false; error: string };

/** manda a mutação pro servidor; devolve null quando é ação só local */
async function persistir(
  action: Action,
  dayKey: string,
): Promise<Resultado | null> {
  switch (action.type) {
    case "CONFIRMAR_AG":
      return mudarStatus(action.agId, "confirmado");
    case "CONCLUIR":
      return mudarStatus(action.agId, "concluido");
    case "FALTOU":
      return mudarStatus(action.agId, "nao_compareceu");
    case "CANCELAR":
      return cancelar(action.agId);
    case "NOTIFICAR_FILA":
      return notificarFila(action.filaId);
    case "CONFIRMAR_FILA":
      return confirmarFila(action.filaId, action.inicioMin, dayKey);
    case "ACEITAR_ENCAIXE":
      return aceitarEncaixe(action.encId);
    case "RECUSAR_ENCAIXE":
      return recusarEncaixe(action.encId);
    case "AGENDAR":
      return agendar({
        nome: action.nome,
        telefone: action.telefone,
        clienteId: action.clienteId,
        servicoId: action.servicoId,
        inicioMin: action.inicioMin,
        dayKey,
      });
    case "BLOQUEAR":
      return bloquear({
        dataKey: action.dataKey,
        horaInicio: action.horaInicio,
        horaFim: action.horaFim,
        descricao: action.descricao,
      });
    default:
      // TICK, HYDRATE, CHECK_IN, AVISO, LIMPAR_AVISO — só estado local.
      // CHECK_IN não persiste: "na cadeira" é estado de sessão (não há coluna
      // no schema). ponytail: virar coluna se precisar sobreviver a reload.
      return null;
  }
}

export function AgendaProvider({
  dayKey,
  data,
  children,
}: {
  dayKey: string;
  data: AgendaData;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, rawDispatch] = useReducer(reducer, undefined, () =>
    initState(dayKey, data),
  );

  // dados novos do servidor (carga, troca de dia, refresh pós-mutação)
  useEffect(() => {
    rawDispatch({ type: "HYDRATE", dayKey, data });
  }, [dayKey, data]);

  // expiração da fila/encaixe
  useEffect(() => {
    const t = setInterval(
      () => rawDispatch({ type: "TICK", now: Date.now() }),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  // some com o aviso
  useEffect(() => {
    if (!state.aviso) return;
    const t = setTimeout(() => rawDispatch({ type: "LIMPAR_AVISO" }), 5500);
    return () => clearTimeout(t);
  }, [state.avisoId, state.aviso]);

  const dispatch = useMemo<Dispatch<Action>>(() => {
    return (action: Action) => {
      rawDispatch(action); // otimista
      persistir(action, dayKey).then((r) => {
        if (r === null) return; // ação local
        if (!r.ok) {
          rawDispatch({
            type: "AVISO",
            texto: "Não deu para salvar. Recarregando a agenda…",
          });
        }
        router.refresh(); // repuxa a verdade do banco -> HYDRATE
      });
    };
  }, [router, dayKey]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <AgendaCtx.Provider value={value}>{children}</AgendaCtx.Provider>;
}

export function useAgenda(): Ctx {
  const c = useContext(AgendaCtx);
  if (!c) throw new Error("useAgenda fora do AgendaProvider");
  return c;
}

// --- seletores derivados (dados pequenos, sem memo) ---

export function getServico(d: AgendaData, id: string): Servico | undefined {
  return d.servicos.find((s) => s.id === id);
}
export function getCliente(d: AgendaData, id: string): Cliente | undefined {
  return d.clientes.find((c) => c.id === id);
}
