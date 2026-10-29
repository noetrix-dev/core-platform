import type { EstadoRevisao, SituacaoComercial } from "../contratos";

export type StatusMacro =
  | "cancelado" | "perdido" | "suspenso" | "fechado" | "nf_emitida"
  | "pronto_para_entrega" | "em_fabricacao" | "cotacao_enviada" | "cotacao_aberta";

export type EntradaStatusMacro = {
  situacaoComercial: SituacaoComercial;
  estadoRevisaoVigente: EstadoRevisao | null;
  pedidosAtivos: number;
  itens: { saldoEntrega: number; reservaFirmeAtiva: number; aceitoSemNf: number }[];
};

const SITUACOES: Record<SituacaoComercial, true> = {
  cotacao_aberta: true, cotacao_enviada: true, aprovado: true, parcialmente_contratado: true, contratado: true,
  fechado: true, reaberto: true, perdido: true, cancelado: true, suspenso: true,
};
const ESTADOS: Record<EstadoRevisao, true> = {
  rascunho: true, preco_pendente: true, precificada: true, enviada: true, aprovada: true, recusada: true, substituida: true,
};

function invalida(): never {
  throw new Error("Entrada de status inválida.");
}
const seguro = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

// Dado vindo do banco falha alto; a mensagem nunca ecoa o valor.
function validar(e: EntradaStatusMacro): void {
  if (typeof e.situacaoComercial !== "string" || !Object.hasOwn(SITUACOES, e.situacaoComercial)) invalida();
  if (e.estadoRevisaoVigente !== null && (typeof e.estadoRevisaoVigente !== "string" || !Object.hasOwn(ESTADOS, e.estadoRevisaoVigente))) invalida();
  if (!seguro(e.pedidosAtivos) || e.pedidosAtivos < 0) invalida();
  for (const i of e.itens) {
    // saldoEntrega pode ser negativo (sobre-entrega); reserva e aceite sem NF não.
    if (!seguro(i.saldoEntrega) || !seguro(i.reservaFirmeAtiva) || i.reservaFirmeAtiva < 0 || !seguro(i.aceitoSemNf) || i.aceitoSemNf < 0) invalida();
  }
  // Combinações impossíveis entre os eixos.
  const s = e.situacaoComercial;
  if (e.itens.length > 0 && e.pedidosAtivos === 0) invalida();
  if (e.estadoRevisaoVigente === "substituida") invalida();
  if ((s === "cotacao_aberta" || s === "cotacao_enviada") && e.pedidosAtivos > 0) invalida();
  if (s === "cotacao_enviada" && e.estadoRevisaoVigente === null) invalida();
}

/** Calculado, nunca gravado. A primeira regra que casar vence (spec §5.2). */
export function statusMacro(e: EntradaStatusMacro): StatusMacro {
  validar(e);
  const s = e.situacaoComercial;
  if (s === "cancelado" || s === "perdido" || s === "suspenso") return s;
  if (s === "fechado") return "fechado";
  if (e.pedidosAtivos > 0 && e.itens.length > 0) {
    // saldo <= 0 cobre sobre-entrega: nada mais a entregar.
    if (e.itens.every((i) => i.saldoEntrega <= 0 && i.aceitoSemNf === 0)) return "nf_emitida";
    const comSaldo = e.itens.filter((i) => i.saldoEntrega > 0);
    if (comSaldo.length > 0 && comSaldo.every((i) => i.reservaFirmeAtiva >= i.saldoEntrega)) return "pronto_para_entrega";
  }
  if (e.pedidosAtivos > 0) return "em_fabricacao";
  if (e.estadoRevisaoVigente === "enviada") return "cotacao_enviada";
  return "cotacao_aberta";
}
