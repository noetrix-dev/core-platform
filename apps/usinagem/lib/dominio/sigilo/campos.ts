import { pode } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";

export type Contexto = "item_revisao" | "cotacao_fornecedor" | "titulo_pagar" | "titulo_receber";
type Categoria = "preco" | "custo" | "vinculo_processo";

/** Campos sensíveis por contexto. Campo fora do mapa é público para quem vê o registro. */
const SENSIVEIS: Record<Contexto, Record<string, Categoria>> = {
  item_revisao: { precoUnitarioCentavos: "preco", custoEstimadoCentavos: "custo" },
  cotacao_fornecedor: { precoCentavos: "custo" },
  titulo_pagar: { valorCentavos: "custo", processoId: "vinculo_processo" },
  titulo_receber: { valorCentavos: "preco", processoId: "vinculo_processo" },
};

/** Entidade da auditoria → contexto. Entidade fora do mapa: antes/depois só para o Admin. */
export const CONTEXTO_DA_ENTIDADE: Record<string, Contexto> = {
  itens_revisao: "item_revisao",
  cotacoes_fornecedor: "cotacao_fornecedor",
  titulos_pagar: "titulo_pagar",
  titulos_receber: "titulo_receber",
};

export function podeVerCampo(perfil: Perfil, contexto: Contexto, campo: string): boolean {
  const categoria = SENSIVEIS[contexto][campo];
  if (!categoria || perfil === "admin") return true;
  // Financeiro: preço só em AR, custo só em AP (spec §7.3).
  if (categoria === "preco") return pode(perfil, "preco.ver") && (perfil !== "financeiro" || contexto === "titulo_receber");
  if (categoria === "custo") return pode(perfil, "custo.ver") && (perfil !== "financeiro" || contexto === "titulo_pagar");
  // Vínculo de processo em título: só Admin (pendente com o dono, spec §12).
  return false;
}
