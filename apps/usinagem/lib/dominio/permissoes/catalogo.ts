import { falha, ok, type Resultado } from "../comum";
import { PERFIS, type Perfil } from "./perfis";

/** Catálogo fixo (spec §7.2). Valor `true` = travada: só Admin, nunca atribuível. */
export const PERMISSOES = {
  "processo.ver": false,
  "processo.criar": false,
  "processo.editar": false,
  "processo.cancelar": false,
  "processo.fechar": false,
  "processo.reabrir": true,
  "cliente.gerenciar": false,
  "revisao_comercial.criar": false,
  "proposta.gerar_pdf": false,
  "proposta.enviar": false,
  "proposta.registrar_aprovacao": false,
  "preco.ver": false,
  "preco.definir": true,
  "parceiro.gerenciar": false,
  "rfq.enviar": false,
  "cotacao_fornecedor.registrar": false,
  "custo.ver": false,
  "margem.ver": true,
  "custo_lote.ver": true,
  "estoque.valorizacao.ver": true,
  "desenho.gerenciar": false,
  "revisao_tecnica.criar": false,
  "revisao_tecnica.aprovar": false,
  "revisao_tecnica.liberar_parceiro": false,
  "compatibilidade.declarar": false,
  "pedido_formal.registrar": false,
  "producao.registrar": false,
  "compra.registrar": false,
  "recebimento.registrar": false,
  "alocacao.registrar": false,
  "producao_excedente.autorizar": true,
  "retrabalho.abrir": false,
  "qualidade.inspecionar": false,
  "qualidade.liberar": false,
  "nf.registrar": false,
  "titulo_pagar.operar": false,
  "titulo_receber.operar": false,
  "entrega.programar": false,
  "entrega.reprogramar": false,
  "entrega.expedir": false,
  "entrega.confirmar_aceite": false,
  "devolucao.registrar": false,
  "estoque.ver": false,
  "estoque.registrar_ocorrencia": false,
  "estoque.ajustar": true,
  "reserva_estrategica.criar": true,
  "reserva_estrategica.liberar": true,
  "reserva_firme.liberar": true,
  "reserva.transferir": true,
  "dados.exportar": true,
  "configuracao.gerenciar": true,
  "usuarios.gerenciar": true,
  "permissoes.gerenciar": true,
  "auditoria.ver": true,
} as const satisfies Record<string, boolean>;

export type Permissao = keyof typeof PERMISSOES;

/** Padrão do seed (spec §7.2). Admin fica de fora: tem tudo. */
export const MATRIZ_PADRAO: Record<Exclude<Perfil, "admin">, readonly Permissao[]> = {
  comercial: [
    "processo.ver", "processo.criar", "processo.editar", "processo.cancelar", "processo.fechar",
    "cliente.gerenciar", "revisao_comercial.criar", "proposta.gerar_pdf", "proposta.enviar",
    "proposta.registrar_aprovacao", "preco.ver", "pedido_formal.registrar", "entrega.programar",
    "entrega.reprogramar", "entrega.confirmar_aceite", "devolucao.registrar", "estoque.ver",
  ],
  compras_producao: [
    "processo.ver", "parceiro.gerenciar", "rfq.enviar", "cotacao_fornecedor.registrar", "custo.ver",
    "producao.registrar", "compra.registrar", "recebimento.registrar", "alocacao.registrar",
    "retrabalho.abrir", "entrega.expedir", "estoque.ver", "estoque.registrar_ocorrencia",
  ],
  // preco.ver só em AR e custo.ver só em AP: o recorte é do módulo sigilo.
  financeiro: [
    "processo.ver", "preco.ver", "custo.ver", "nf.registrar", "titulo_pagar.operar",
    "titulo_receber.operar", "estoque.ver",
  ],
  // retrabalho.abrir, qualidade.inspecionar e qualidade.liberar: dado da matriz, dono da qualidade pendente (spec §12).
  tecnico: [
    "processo.ver", "desenho.gerenciar", "revisao_tecnica.criar", "revisao_tecnica.aprovar",
    "revisao_tecnica.liberar_parceiro", "compatibilidade.declarar", "retrabalho.abrir",
    "qualidade.inspecionar", "qualidade.liberar", "estoque.ver", "estoque.registrar_ocorrencia",
  ],
};

/** `concedidas` vem de `perfil_permissoes` no servidor; sem ela, vale o padrão. */
export function pode(perfil: Perfil, permissao: Permissao, concedidas?: readonly Permissao[]): boolean {
  if (!Object.hasOwn(PERMISSOES, permissao)) return false;
  if (!PERFIS.includes(perfil)) return false;
  if (perfil === "admin") return true;
  if (PERMISSOES[permissao]) return false;
  return (concedidas ?? MATRIZ_PADRAO[perfil]).includes(permissao);
}

export function validarConcessao(perfil: Perfil, permissao: Permissao): Resultado<true> {
  if (!Object.hasOwn(PERMISSOES, permissao)) {
    return falha("Permissão não existe no catálogo.");
  }
  if (!PERFIS.includes(perfil)) {
    return falha("Perfil não existe.");
  }
  if (perfil !== "admin" && PERMISSOES[permissao]) {
    return falha("Esta permissão é exclusiva do Admin e não pode ser atribuída.");
  }
  return ok(true);
}
