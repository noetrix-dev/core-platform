import { falha, ok, type Resultado } from "../comum";
import type { EstadoRevisao, ItemRevisao } from "../contratos";
import { pode } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";

export type VinculosOperacionais = { pedidosFormais: number; compras: number; ordensProducao: number };

export function validarCancelamento(perfil: Perfil, v: VinculosOperacionais, motivo: string): Resultado<true> {
  if (!pode(perfil, "processo.cancelar")) return falha("Sem permissão para cancelar processo.");
  if (!motivo.trim()) return falha("Informe o motivo do cancelamento.");
  const temVinculo = v.pedidosFormais + v.compras + v.ordensProducao > 0;
  if (temVinculo && perfil !== "admin") {
    return falha("Processo com pedido formal, compra ou produção: só o Admin cancela.");
  }
  return ok(true);
}

export type Conciliacao = {
  saldoEntrega: number;
  aceitesPendentes: number;
  aceitoSemNf: number;
  devolucoesPendentes: number;
};

export const conciliado = (c: Conciliacao): boolean =>
  c.saldoEntrega === 0 && c.aceitesPendentes === 0 && c.aceitoSemNf === 0 && c.devolucoesPendentes === 0;

export function validarFechamento(perfil: Perfil, c: Conciliacao, justificativa?: string): Resultado<true> {
  if (!pode(perfil, "processo.fechar")) return falha("Sem permissão para fechar processo.");
  if (conciliado(c)) return ok(true);
  if (perfil !== "admin") return falha("Processo não conciliado: só o Admin fecha.");
  if (!justificativa?.trim()) return falha("Fechar sem conciliação exige justificativa.");
  return ok(true);
}

export function validarReabertura(perfil: Perfil, motivo: string): Resultado<true> {
  if (!pode(perfil, "processo.reabrir")) return falha("Só o Admin reabre processo.");
  if (!motivo.trim()) return falha("Informe o motivo da reabertura.");
  return ok(true);
}

const ESTADOS_COM_PRECO: readonly EstadoRevisao[] = ["precificada", "enviada", "aprovada"];

export function validarProposta(
  perfil: Perfil,
  acao: "proposta.gerar_pdf" | "proposta.enviar",
  estado: EstadoRevisao,
): Resultado<true> {
  if (!pode(perfil, acao)) return falha("Sem permissão para esta ação na proposta.");
  if (!ESTADOS_COM_PRECO.includes(estado)) return falha("Preço pendente: o Admin precisa definir o preço antes.");
  return ok(true);
}

export function validarPrecificacao(perfil: Perfil, itens: { precoUnitarioCentavos: number | null }[]): Resultado<true> {
  if (!pode(perfil, "preco.definir")) return falha("Só o Admin define preço.");
  const invalido = itens.some(
    (i) => i.precoUnitarioCentavos === null || !Number.isInteger(i.precoUnitarioCentavos) || i.precoUnitarioCentavos < 0,
  );
  if (itens.length === 0 || invalido) return falha("Todos os itens precisam de preço em centavos inteiros.");
  return ok(true);
}

/** Repetição de peça: copia o que é técnico/descritivo; preço e custo nunca atravessam (spec §7.3). */
export function prepararRevisaoDerivada(itens: ItemRevisao[]) {
  return {
    estado: "preco_pendente" as const,
    itens: itens.map((i) => ({
      ordem: i.ordem,
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade,
      revisaoTecnicaId: i.revisaoTecnicaId,
      precoUnitarioCentavos: null,
      custoEstimadoCentavos: null,
    })),
  };
}
