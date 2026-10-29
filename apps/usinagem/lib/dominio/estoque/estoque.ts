import { deduplicarPorChave, falha, ok, type Resultado } from "../comum";

export type SituacaoQualidade = "aguardando_inspecao" | "liberado" | "rejeitado" | "quarentena";
export type Lote = { id: string; produtoId: string; revisaoTecnicaId: string; situacao: SituacaoQualidade };
export type TipoMovimento = "entrada_producao" | "retorno" | "saida_expedicao" | "ajuste";
/** Quantidade com sinal: saída negativa. `chave` única garante idempotência. */
export type MovimentoEstoque = { chave: string; loteId: string; tipo: TipoMovimento; quantidade: number };
export type StatusReserva = "ativa" | "comprometida_bloqueio" | "consumida" | "liberada";
export type Reserva = {
  id: string; loteId: string; tipo: "firme" | "estrategica"; clienteId: string;
  pedidoItemId: string | null; quantidade: number; status: StatusReserva;
};
export type EstadoEstoque = { lotes: Lote[]; movimentos: MovimentoEstoque[]; reservas: Reserva[] };
export type PosicaoEstoque = {
  fisicoTotal: number; fisicoElegivel: number; reservasFirmes: number; reservasEstrategicas: number;
  livre: number; deficitBloqueio: number;
};

/** Local: ehQuantidadeValida de comum.ts ainda aceita inteiro não seguro (corrigir no fim do 1B). */
const ehQtd = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
const INCONSISTENTE = "Estado de estoque inconsistente.";
const SITUACOES = { aguardando_inspecao: 1, liberado: 1, rejeitado: 1, quarentena: 1 };

const TIPOS_MOVIMENTO = { entrada_producao: 1, retorno: 1, saida_expedicao: 1, ajuste: 1 };
const TIPOS_RESERVA = { firme: 1, estrategica: 1 };
const STATUS_RESERVA = { ativa: 1, comprometida_bloqueio: 1, consumida: 1, liberada: 1 };

/** Dado vindo do banco: estado corrompido falha alto, sem ecoar o valor recebido. */
export function validarEstado(e: EstadoEstoque): void {
  const idsLote = new Set<string>();
  for (const l of e.lotes) {
    if (!Object.hasOwn(SITUACOES, l.situacao) || idsLote.has(l.id)) throw new Error(INCONSISTENTE);
    idsLote.add(l.id);
  }
  const vistos = new Map<string, MovimentoEstoque>();
  for (const m of e.movimentos) {
    if (!Object.hasOwn(TIPOS_MOVIMENTO, m.tipo) || !Number.isSafeInteger(m.quantidade) || m.quantidade === 0) {
      throw new Error("Movimento de estoque inválido.");
    }
    const antes = vistos.get(m.chave);
    if (!antes) vistos.set(m.chave, m);
    else if (antes.loteId !== m.loteId || antes.tipo !== m.tipo || antes.quantidade !== m.quantidade) {
      throw new Error("Movimento de estoque repetido com conteúdo diferente.");
    }
  }
  for (const r of e.reservas) {
    if (
      !Number.isSafeInteger(r.quantidade) || r.quantidade < 0 ||
      !Object.hasOwn(TIPOS_RESERVA, r.tipo) || !Object.hasOwn(STATUS_RESERVA, r.status)
    ) {
      throw new Error("Reserva de estoque inválida.");
    }
  }
  if (
    e.movimentos.some((m) => !idsLote.has(m.loteId)) || e.reservas.some((r) => !idsLote.has(r.loteId)) ||
    new Set(e.reservas.map((r) => r.id)).size !== e.reservas.length
  ) {
    throw new Error(INCONSISTENTE);
  }
  for (const l of e.lotes) {
    const fisico = fisicoDoLote(e, l.id);
    const ativas = reservadoNoLote(e, l.id);
    if (fisico < 0 || (l.situacao === "liberado" ? ativas > fisico : ativas > 0)) throw new Error(INCONSISTENTE);
  }
}

const fisicoDoLote = (e: EstadoEstoque, loteId: string): number =>
  deduplicarPorChave(e.movimentos).filter((m) => m.loteId === loteId).reduce((s, m) => s + m.quantidade, 0);

const elegivelDoLote = (e: EstadoEstoque, lote: Lote): number =>
  lote.situacao === "liberado" ? fisicoDoLote(e, lote.id) : 0;

const reservadoNoLote = (e: EstadoEstoque, loteId: string): number =>
  e.reservas.filter((r) => r.loteId === loteId && r.status === "ativa").reduce((s, r) => s + r.quantidade, 0);

const livreDoLote = (e: EstadoEstoque, lote: Lote): number => elegivelDoLote(e, lote) - reservadoNoLote(e, lote.id);

/** Compatibilidade só vale entre os pares declarados (sem transitividade implícita). */
function revisoesQueSomam(revisao: string, compat: readonly (readonly [string, string])[]): Set<string> {
  const s = new Set([revisao]);
  for (const [a, b] of compat) {
    if (a === revisao) s.add(b);
    if (b === revisao) s.add(a);
  }
  return s;
}

export function posicaoEstoque(
  e: EstadoEstoque,
  produtoId: string,
  revisaoTecnicaId: string,
  compatibilidades: readonly (readonly [string, string])[] = [],
): PosicaoEstoque {
  validarEstado(e);
  const revisoes = revisoesQueSomam(revisaoTecnicaId, compatibilidades);
  const lotes = e.lotes.filter((l) => l.produtoId === produtoId && revisoes.has(l.revisaoTecnicaId));
  const ids = new Set(lotes.map((l) => l.id));
  const doGrupo = e.reservas.filter((r) => ids.has(r.loteId));
  const soma = (filtro: (r: Reserva) => boolean) => doGrupo.filter(filtro).reduce((s, r) => s + r.quantidade, 0);
  const fisicoTotal = lotes.reduce((s, l) => s + fisicoDoLote(e, l.id), 0);
  const fisicoElegivel = lotes.reduce((s, l) => s + elegivelDoLote(e, l), 0);
  const reservasFirmes = soma((r) => r.status === "ativa" && r.tipo === "firme");
  const reservasEstrategicas = soma((r) => r.status === "ativa" && r.tipo === "estrategica");
  // Bloqueios já estão fora do elegível: não subtrair de novo (spec §6.3).
  return {
    fisicoTotal, fisicoElegivel, reservasFirmes, reservasEstrategicas,
    livre: fisicoElegivel - reservasFirmes - reservasEstrategicas,
    // Reserva presa em lote bloqueado: compromisso sem peça elegível, alerta para o Admin (spec §6.4).
    deficitBloqueio: soma((r) => r.status === "comprometida_bloqueio"),
  };
}

const CHAVE_USADA = "Chave já usada com conteúdo diferente.";
const ID_USADO = "Identificador de reserva já usado.";
const SEM_PEDIDO = "Reserva firme exige item de pedido formal.";

export function entradaProducao(
  e: EstadoEstoque,
  { chave, lote, quantidade }: { chave: string; lote: Lote; quantidade: number },
): Resultado<EstadoEstoque> {
  validarEstado(e);
  const antes = e.movimentos.find((m) => m.chave === chave);
  if (antes) {
    const igual = antes.tipo === "entrada_producao" && antes.loteId === lote.id && antes.quantidade === quantidade;
    return igual ? ok(e) : falha(CHAVE_USADA);
  }
  if (!ehQtd(quantidade)) return falha("Quantidade de entrada inválida.");
  if (e.lotes.some((l) => l.id === lote.id)) return falha("Lote já existe.");
  return ok({
    ...e,
    lotes: [...e.lotes, { ...lote, situacao: "aguardando_inspecao" }],
    movimentos: [...e.movimentos, { chave, loteId: lote.id, tipo: "entrada_producao", quantidade }],
  });
}

/** Liberação da qualidade: o lote vira elegível e as alocações a pedido viram reservas firmes. */
export function liberarLote(
  e: EstadoEstoque,
  loteId: string,
  alocacoes: { reservaId: string; clienteId: string; pedidoItemId: string; quantidade: number }[],
): Resultado<EstadoEstoque> {
  validarEstado(e);
  const lote = e.lotes.find((l) => l.id === loteId);
  if (!lote) return falha("Lote não encontrado.");
  if (lote.situacao !== "aguardando_inspecao") return falha("Lote não está aguardando inspeção.");
  if (alocacoes.some((a) => !ehQtd(a.quantidade))) return falha("Quantidade de alocação inválida.");
  if (alocacoes.some((a) => !a.pedidoItemId)) return falha(SEM_PEDIDO);
  const ids = alocacoes.map((a) => a.reservaId);
  if (new Set(ids).size !== ids.length || ids.some((id) => e.reservas.some((r) => r.id === id))) return falha(ID_USADO);
  const alocado = alocacoes.reduce((s, a) => s + a.quantidade, 0);
  if (alocado > fisicoDoLote(e, loteId)) return falha("Alocação maior que o lote.");
  return ok({
    ...e,
    lotes: e.lotes.map((l) => (l.id === loteId ? { ...l, situacao: "liberado" } : l)),
    reservas: [
      ...e.reservas,
      ...alocacoes.map((a): Reserva => ({
        id: a.reservaId, loteId, tipo: "firme", clienteId: a.clienteId,
        pedidoItemId: a.pedidoItemId, quantidade: a.quantidade, status: "ativa",
      })),
    ],
  });
}

const marcarReservasDoLote = (e: EstadoEstoque, loteId: string, de: StatusReserva, para: StatusReserva) =>
  e.reservas.map((r) => (r.loteId === loteId && r.status === de ? { ...r, status: para } : r));

/** Bloqueio pela qualidade: reservas ativas ficam comprometidas, nunca liberadas em silêncio. */
export function bloquearLote(
  e: EstadoEstoque,
  loteId: string,
  situacao: "quarentena" | "rejeitado",
): Resultado<EstadoEstoque> {
  validarEstado(e);
  const lote = e.lotes.find((l) => l.id === loteId);
  if (!lote) return falha("Lote não encontrado.");
  if (lote.situacao === "rejeitado") return falha("Lote já rejeitado.");
  return ok({
    ...e,
    lotes: e.lotes.map((l) => (l.id === loteId ? { ...l, situacao } : l)),
    reservas: marcarReservasDoLote(e, loteId, "ativa", "comprometida_bloqueio"),
  });
}

/** Só lote em quarentena volta. Rejeitado fica para decisão do Admin (realocar ou liberar a reserva). */
export function reliberarLote(e: EstadoEstoque, loteId: string): Resultado<EstadoEstoque> {
  validarEstado(e);
  const lote = e.lotes.find((l) => l.id === loteId);
  if (!lote || lote.situacao !== "quarentena") return falha("Só lote em quarentena pode ser reliberado.");
  return ok({
    ...e,
    lotes: e.lotes.map((l) => (l.id === loteId ? { ...l, situacao: "liberado" } : l)),
    reservas: marcarReservasDoLote(e, loteId, "comprometida_bloqueio", "ativa"),
  });
}

export function reservar(e: EstadoEstoque, nova: Omit<Reserva, "status">): Resultado<EstadoEstoque> {
  validarEstado(e);
  if (!ehQtd(nova.quantidade)) return falha("Quantidade de reserva inválida.");
  if (e.reservas.some((r) => r.id === nova.id)) return falha(ID_USADO);
  if (nova.tipo === "firme" && !nova.pedidoItemId) return falha(SEM_PEDIDO);
  if (nova.tipo === "estrategica" && nova.pedidoItemId) return falha("Reserva estratégica não tem pedido formal.");
  const lote = e.lotes.find((l) => l.id === nova.loteId);
  if (!lote || lote.situacao !== "liberado") return falha("Só lote liberado pela qualidade pode ser reservado.");
  if (nova.quantidade > livreDoLote(e, lote)) return falha("Quantidade maior que o estoque livre do lote.");
  return ok({ ...e, reservas: [...e.reservas, { ...nova, status: "ativa" }] });
}

const reduzirReserva = (r: Reserva, quantidade: number): Reserva => {
  const resto = r.quantidade - quantidade;
  return resto === 0 ? { ...r, quantidade: 0, status: "consumida" } : { ...r, quantidade: resto };
};

export function converterEmFirme(
  e: EstadoEstoque,
  { reservaId, novaReservaId, pedidoItemId, quantidade }: { reservaId: string; novaReservaId: string; pedidoItemId: string; quantidade: number },
): Resultado<EstadoEstoque> {
  validarEstado(e);
  const r = e.reservas.find((x) => x.id === reservaId);
  if (!r || r.tipo !== "estrategica" || r.status !== "ativa") return falha("Reserva estratégica ativa não encontrada.");
  if (!ehQtd(quantidade) || quantidade > r.quantidade) return falha("Quantidade maior que a reserva estratégica.");
  if (!pedidoItemId) return falha(SEM_PEDIDO);
  if (e.reservas.some((x) => x.id === novaReservaId)) return falha(ID_USADO);
  return ok({
    ...e,
    reservas: [
      ...e.reservas.map((x) => (x.id === reservaId ? reduzirReserva(x, quantidade) : x)),
      { id: novaReservaId, loteId: r.loteId, tipo: "firme", clienteId: r.clienteId, pedidoItemId, quantidade, status: "ativa" },
    ],
  });
}

/** Expedição: baixa o físico e consome a reserva firme no mesmo passo. Idempotente pela chave. */
export function expedir(
  e: EstadoEstoque,
  { chave, reservaId, quantidade }: { chave: string; reservaId: string; quantidade: number },
): Resultado<EstadoEstoque> {
  validarEstado(e);
  const r = e.reservas.find((x) => x.id === reservaId);
  const antes = e.movimentos.find((m) => m.chave === chave);
  if (antes) {
    const igual = antes.tipo === "saida_expedicao" && antes.quantidade === -quantidade && (!r || antes.loteId === r.loteId);
    return igual ? ok(e) : falha(CHAVE_USADA);
  }
  if (!r || r.tipo !== "firme" || r.status !== "ativa") return falha("Reserva firme ativa não encontrada.");
  if (!ehQtd(quantidade) || quantidade > r.quantidade) return falha("Quantidade maior que a reserva firme.");
  return ok({
    ...e,
    movimentos: [...e.movimentos, { chave, loteId: r.loteId, tipo: "saida_expedicao", quantidade: -quantidade }],
    reservas: e.reservas.map((x) => (x.id === reservaId ? reduzirReserva(x, quantidade) : x)),
  });
}
