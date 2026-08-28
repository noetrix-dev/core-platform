// Monta a "pilha" do dia: fichas em ordem de horário, com os vãos vazios entre
// elas e as faixas de bloqueio como itens próprios. A duração vira altura
// relativa do bloco na tela, não coordenada — a lista é cronológica, não uma
// grade posicionada.

import type { AgendaData, Agendamento, Cliente, Servico } from "./types";
import { hmToMin, minsOfDay } from "./time.ts";

export interface Janela {
  aberto: boolean;
  aberturaMin: number;
  fechamentoMin: number;
}

export function janelaDoDia(d: AgendaData, dayKey: string): Janela {
  const dow = new Date(`${dayKey}T12:00:00`).getDay();
  const h = d.horarios.find((x) => x.dia_semana === dow);
  if (!h || !h.aberto || !h.hora_abertura || !h.hora_fechamento) {
    return { aberto: false, aberturaMin: 540, fechamentoMin: 1020 };
  }
  return {
    aberto: true,
    aberturaMin: hmToMin(h.hora_abertura),
    fechamentoMin: hmToMin(h.hora_fechamento),
  };
}

export type ItemFicha = {
  kind: "ficha";
  key: string;
  inicioMin: number;
  fimMin: number;
  agendamento: Agendamento;
  cliente?: Cliente;
  servico?: Servico;
};
export type ItemVao = {
  kind: "vao";
  key: string;
  inicioMin: number;
  fimMin: number;
};
export type ItemBloqueio = {
  kind: "bloqueio";
  key: string;
  inicioMin: number;
  fimMin: number;
  descricao: string;
  tipo: "suave" | "rigido";
};
export type ItemAgora = { kind: "agora"; key: "agora"; inicioMin: number };
export type ItemFim = { kind: "fim"; key: "fim"; inicioMin: number };

export type TimelineItem =
  | ItemFicha
  | ItemVao
  | ItemBloqueio
  | ItemAgora
  | ItemFim;

const VAO_MINIMO = 15;

export function buildTimeline(
  d: AgendaData,
  dayKey: string,
  nowMin: number | null,
): { itens: TimelineItem[]; janela: Janela } {
  const janela = janelaDoDia(d, dayKey);
  const { aberturaMin, fechamentoMin } = janela;

  const ocupados: Array<ItemFicha | ItemBloqueio> = [];

  for (const ag of d.agendamentos) {
    if (ag.status === "cancelado") continue;
    if (ag.inicio.slice(0, 10) !== dayKey) continue;
    const inicioMin = minsOfDay(ag.inicio);
    ocupados.push({
      kind: "ficha",
      key: ag.id,
      inicioMin,
      fimMin: inicioMin + ag.duracao_minutos,
      agendamento: ag,
      cliente: d.clientes.find((c) => c.id === ag.cliente_id),
      servico: d.servicos.find((s) => s.id === ag.servico_id),
    });
  }

  for (const b of d.bloqueios_fixos) {
    if (b.dia_semana !== null) {
      const dow = new Date(`${dayKey}T12:00:00`).getDay();
      if (b.dia_semana !== dow) continue;
    }
    ocupados.push({
      kind: "bloqueio",
      key: b.id,
      inicioMin: hmToMin(b.hora_inicio),
      fimMin: hmToMin(b.hora_fim),
      descricao: b.descricao,
      tipo: b.tipo,
    });
  }
  for (const b of d.bloqueios_pontuais) {
    if (b.data !== dayKey) continue;
    ocupados.push({
      kind: "bloqueio",
      key: b.id,
      inicioMin: hmToMin(b.hora_inicio),
      fimMin: hmToMin(b.hora_fim),
      descricao: b.descricao || "Bloqueio",
      tipo: "rigido",
    });
  }

  ocupados.sort((a, b) => a.inicioMin - b.inicioMin || a.fimMin - b.fimMin);

  const base: Array<ItemFicha | ItemBloqueio | ItemVao | ItemFim> = [];
  let cursor = aberturaMin;
  for (const it of ocupados) {
    if (it.inicioMin - cursor >= VAO_MINIMO) {
      base.push({
        kind: "vao",
        key: `vao-${cursor}`,
        inicioMin: cursor,
        fimMin: it.inicioMin,
      });
    }
    base.push(it);
    cursor = Math.max(cursor, it.fimMin);
  }
  if (fechamentoMin - cursor >= VAO_MINIMO) {
    base.push({
      kind: "vao",
      key: `vao-${cursor}`,
      inicioMin: cursor,
      fimMin: fechamentoMin,
    });
  }
  base.push({ kind: "fim", key: "fim", inicioMin: fechamentoMin });

  if (nowMin == null) return { itens: base, janela };

  const itens: TimelineItem[] = [];
  let inserido = false;
  for (const it of base) {
    if (!inserido && it.inicioMin > nowMin) {
      itens.push({ kind: "agora", key: "agora", inicioMin: nowMin });
      inserido = true;
    }
    itens.push(it);
  }
  if (!inserido) {
    // agora é depois do último item — encaixa antes do "fim"
    itens.splice(Math.max(0, itens.length - 1), 0, {
      kind: "agora",
      key: "agora",
      inicioMin: nowMin,
    });
  }
  return { itens, janela };
}

/** vãos abertos onde cabe um serviço de `duracao` minutos, para os seletores de horário */
export function vagasLivres(
  d: AgendaData,
  dayKey: string,
  duracao: number,
): number[] {
  const { itens } = buildTimeline(d, dayKey, null);
  const out: number[] = [];
  for (const it of itens) {
    if (it.kind !== "vao") continue;
    for (let m = it.inicioMin; m + duracao <= it.fimMin; m += 15) out.push(m);
  }
  return out;
}
