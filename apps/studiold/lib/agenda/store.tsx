"use client";

// Contexto React em volta do reducer puro (./reducer). Roda sobre o seed em
// memória. A troca por Supabase acontece no reducer, não aqui.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { AgendaData, Cliente, Servico } from "./types";
import { reducer, initState, type Action, type State } from "./reducer.ts";

export type { Action, State } from "./reducer.ts";

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
}
const AgendaCtx = createContext<Ctx | null>(null);

export function AgendaProvider({
  dayKey,
  children,
}: {
  dayKey: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, dayKey, initState);

  useEffect(() => {
    if (state.dayKey !== dayKey) dispatch({ type: "SET_DAY", dayKey });
  }, [dayKey, state.dayKey]);

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: "TICK", now: Date.now() }), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!state.aviso) return;
    const t = setTimeout(() => dispatch({ type: "LIMPAR_AVISO" }), 5500);
    return () => clearTimeout(t);
  }, [state.avisoId, state.aviso]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
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
