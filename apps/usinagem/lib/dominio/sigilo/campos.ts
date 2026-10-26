import { pode, type Permissao } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";

export type Contexto = "item_revisao" | "cotacao_fornecedor" | "titulo_pagar" | "titulo_receber";
type Categoria = "publico" | "preco" | "custo" | "vinculo_processo";

/**
 * Lista de PERMITIDOS por contexto: só sai do servidor campo declarado aqui (spec §7.3).
 * Campo novo, snake_case ou desconhecido falha fechado, inclusive para o Admin em podeVerCampo.
 * Entidades dos PRs 3 a 5 ainda não têm contexto e, por isso, não são serializáveis por quem não é Admin.
 * Cada PR declara o seu.
 */
const CAMPOS: Record<Contexto, Record<string, Categoria>> = {
  item_revisao: { id: "publico", revisaoId: "publico", ordem: "publico", descricao: "publico", quantidade: "publico", unidade: "publico", revisaoTecnicaId: "publico", precoUnitarioCentavos: "preco", custoEstimadoCentavos: "custo" },
  cotacao_fornecedor: { id: "publico", criadoEm: "publico", criadoPor: "publico", rfqId: "publico", processoId: "publico", itemRevisaoId: "publico", parceiroId: "publico", prazoDias: "publico", validade: "publico", escolhida: "publico", precoCentavos: "custo" },
  titulo_pagar: { id: "publico", parceiroId: "publico", vencimento: "publico", situacao: "publico", versao: "publico", valorCentavos: "custo", processoId: "vinculo_processo" },
  titulo_receber: { id: "publico", clienteId: "publico", documentoFiscalId: "publico", vencimento: "publico", situacao: "publico", versao: "publico", valorCentavos: "preco", processoId: "vinculo_processo" },
};

export const PERMISSAO_DE_LEITURA: Record<Contexto, Permissao> = {
  item_revisao: "processo.ver", cotacao_fornecedor: "processo.ver",
  titulo_pagar: "titulo_pagar.operar", titulo_receber: "titulo_receber.operar",
};

export const podeLerContexto = (perfil: Perfil, contexto: Contexto) => pode(perfil, PERMISSAO_DE_LEITURA[contexto]);

/** Entidade da auditoria → contexto. Entidade fora do mapa: antes/depois só para o Admin. */
export const CONTEXTO_DA_ENTIDADE: Record<string, Contexto> = {
  itens_revisao: "item_revisao",
  cotacoes_fornecedor: "cotacao_fornecedor",
  titulos_pagar: "titulo_pagar",
  titulos_receber: "titulo_receber",
};

export function podeVerCampo(perfil: Perfil, contexto: Contexto, campo: string): boolean {
  if (!podeLerContexto(perfil, contexto)) return false;
  if (!Object.hasOwn(CAMPOS[contexto], campo)) return false;
  if (perfil === "admin") return true;
  const categoria = CAMPOS[contexto][campo];
  if (categoria === "publico") return true;
  // Financeiro: preço só em AR, custo só em AP (spec §7.3).
  if (categoria === "preco") return pode(perfil, "preco.ver") && (perfil !== "financeiro" || contexto === "titulo_receber");
  if (categoria === "custo") return pode(perfil, "custo.ver") && (perfil !== "financeiro" || contexto === "titulo_pagar");
  // Vínculo de processo em título: só Admin (pendente com o dono, spec §12).
  return false;
}
