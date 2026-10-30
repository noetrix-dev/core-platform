// Contratos das entidades do ERP (spec §4). Tipos só; regras ficam nos módulos de domínio.
// Estoque, entrega e demanda exportam seus tipos dos próprios módulos.
import type { Centavos, Id, QuantidadeDecimal } from "./comum";
import type { Perfil } from "./permissoes/perfis";

type Registro = { id: Id; criadoEm: string; criadoPor: Id };
type Versionado = { versao: number };

// Núcleo
export type Usuario = Versionado & { id: Id; nome: string; email: string; perfil: Perfil; ativo: boolean; ficticio: boolean };
export type EventoAuditoria = {
  // entidadeId é text no banco: chaves de configuracoes/perfis/permissoes são text; UUIDs entram como texto.
  id: Id; autorId: Id | null; operacao: string; entidade: string; entidadeId: string | null;
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; justificativa: string | null; criadoEm: string;
};

// Comercial e processos
export type Cliente = Versionado & { id: Id; razaoSocial: string; cnpj: string | null; ficticio: boolean };
export type ContatoCliente = { id: Id; clienteId: Id; nome: string; email: string | null; telefone: string | null };
export type SituacaoComercial =
  | "cotacao_aberta" | "cotacao_enviada" | "aprovado" | "parcialmente_contratado" | "contratado"
  | "fechado" | "reaberto" | "perdido" | "cancelado" | "suspenso";
export type Processo = Registro & Versionado & {
  // Sem letra: o número exibido é numero + letra da revisão comercial de maior `sequencia`.
  numero: number; clienteId: Id; titulo: string;
  situacaoComercial: SituacaoComercial; derivadoDeProcessoId: Id | null; ficticio: boolean;
};
export type EstadoRevisao =
  | "rascunho" | "preco_pendente" | "precificada" | "enviada" | "aprovada" | "recusada" | "substituida";
export type RevisaoComercial = Registro & Versionado & {
  // `sequencia` ordena (a maior é a vigente); `letra` é só rótulo de exibição (1 a 2 maiúsculas).
  processoId: Id; sequencia: number; letra: string; estado: EstadoRevisao; validadeDias: number | null;
  prazoEntrega: string | null; condicoesPagamento: string | null; observacoes: string | null;
  precificadaPor: Id | null; aprovadaPor: Id | null;
};
export type ItemRevisao = {
  id: Id; revisaoId: Id; ordem: number; descricao: string; quantidade: number; unidade: string;
  revisaoTecnicaId: Id | null; precoUnitarioCentavos: Centavos | null; custoEstimadoCentavos: Centavos | null;
};
export type Proposta = Registro & { revisaoId: Id; enviadaEm: string | null; destinatario: string | null };

// Engenharia
export type Desenho = Registro & { codigo: string; descricao: string; processoOrigemId: Id };
export type RevisaoTecnica = Registro & Versionado & {
  desenhoId: Id; rotulo: string; caminhoRede: string; metadados: Record<string, string>;
  aprovadaPor: Id | null; aprovadaEm: string | null;
  liberadaParceiroPor: Id | null; liberadaParceiroEm: string | null;
};
export type CompatibilidadeRevisao = Registro & { revisaoA: Id; revisaoB: Id; motivo: string };
export type Produto = Registro & { descricao: string; clienteId: Id | null; revisaoTecnicaVigenteId: Id };

// Parceiros, RFQ e compras
export type PapelParceiro = "fornecedor_mp" | "fabricante";
export type Parceiro = { id: Id; razaoSocial: string; papeis: PapelParceiro[]; ficticio: boolean };
export type StatusRfq = "rascunho" | "enviada" | "respondida" | "sem_resposta" | "cancelada";
export type Rfq = Registro & Versionado & {
  processoId: Id; itemRevisaoId: Id; parceiroId: Id; status: StatusRfq;
  enviadaEm: string | null; prazoResposta: string | null; respondidaEm: string | null;
};
export type CotacaoFornecedor = Registro & {
  rfqId: Id | null; processoId: Id; itemRevisaoId: Id; parceiroId: Id; precoCentavos: Centavos; prazoDias: number;
  validade: string | null; escolhida: boolean;
};
export type Compra = Registro & Versionado & { parceiroId: Id; processoId: Id; situacao: "aberta" | "recebida" | "cancelada" };
export type ItemCompra = { id: Id; compraId: Id; descricao: string; unidade: string; quantidade: QuantidadeDecimal; precoUnitarioCentavos: Centavos };
export type RecebimentoMp = Registro & { compraId: Id; chave: string; quantidade: QuantidadeDecimal };

// Pedido formal
export type PedidoCliente = Registro & Versionado & {
  processoId: Id; numeroExterno: string; data: string; situacao: "ativo" | "cancelado";
};
export type PedidoItem = {
  id: Id; pedidoId: Id; produtoId: Id; revisaoTecnicaId: Id; quantidadeContratada: number;
  precoUnitarioCentavos: Centavos; prazo: string | null;
};
export type AditivoPedido = Registro & { pedidoItemId: Id; novaQuantidade: number; motivo: string };

// Produção e qualidade
export type SituacaoProducao = "nao_iniciada" | "em_execucao" | "liberada" | "com_bloqueio";
export type OrdemProducao = Registro & Versionado & {
  processoId: Id; produtoId: Id; revisaoTecnicaId: Id; quantidade: number; situacao: SituacaoProducao;
};
export type EtapaFabricacao = Versionado & {
  id: Id; ordemId: Id; tipo: string; sequencia: number; parceiroId: Id | null; responsavelId: Id | null;
  situacao: "pendente" | "em_andamento" | "concluida";
  prazoPrometido: string | null; concluidaEm: string | null;
  avaliacaoParceiro: { nota: 1 | 2 | 3 | 4 | 5; comentario: string | null } | null;
  custoPrevistoCentavos: Centavos | null; custoRealCentavos: Centavos | null;
};
export type AlocacaoProducao = { id: Id; ordemId: Id; destino: "pedido" | "estoque"; pedidoItemId: Id | null; quantidade: number };
export type AutorizacaoExcedente = Registro & {
  ordemId: Id; quantidadeExcedente: number; motivo: string; custoEstimadoCentavos: Centavos; finalidade: string;
};
export type Inspecao = Registro & { loteId: Id; aprovada: number; rejeitada: number; observacao: string | null };
export type NaoConformidade = Registro & { inspecaoId: Id; causa: string; responsavel: string | null };
export type Retrabalho = Registro & { naoConformidadeId: Id; custoCentavos: Centavos | null; situacao: "aberto" | "concluido" };
export type CustoLote = { loteId: Id; custoTotalCentavos: Centavos; metodoCusteio: "pendente" };

// Entregas
export type ProgramacaoEntrega = Registro & { pedidoId: Id; versao: number; situacao: "vigente" | "substituida" };
export type ProgramacaoItem = { id: Id; programacaoId: Id; pedidoItemId: Id; data: string; quantidade: number; prioridade: number; destino: string | null };
export type Remessa = Registro & { pedidoId: Id; chave: string; expedidaEm: string; destinatario: string | null; transporte: string | null };
export type RemessaItem = { id: Id; remessaId: Id; pedidoItemId: Id; loteId: Id; quantidade: number };
export type OcorrenciaEntrega = Registro & {
  pedidoItemId: Id; tipo: "atraso" | "recusa" | "devolucao" | "divergencia"; descricao: string; quantidade: number | null;
};

// Fiscal e financeiro
export type DocumentoFiscal = Registro & { numero: string; serie: string; chaveAcesso: string | null; data: string; valorCentavos: Centavos };
export type DocumentoFiscalItem = { id: Id; documentoId: Id; remessaItemId: Id | null; pedidoItemId: Id; quantidade: number };
export type SituacaoTitulo = "aberto" | "parcial" | "quitado" | "cancelado";
export type TituloPagar = Versionado & { id: Id; parceiroId: Id; processoId: Id | null; valorCentavos: Centavos; vencimento: string; situacao: SituacaoTitulo };
export type TituloReceber = Versionado & { id: Id; clienteId: Id; processoId: Id | null; documentoFiscalId: Id | null; valorCentavos: Centavos; vencimento: string; situacao: SituacaoTitulo };
export type Baixa = Registro & { tituloId: Id; chave: string; valorCentavos: Centavos; estornoDe: Id | null };
