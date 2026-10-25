import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () => timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
// Concorrência otimista: toda atualização filtra pela versão lida e incrementa.
const versao = () => integer("versao").notNull().default(1);

export const SITUACOES_COMERCIAIS = [
  "cotacao_aberta",
  "cotacao_enviada",
  "aprovado",
  "parcialmente_contratado",
  "contratado",
  "fechado",
  "reaberto",
  "perdido",
  "cancelado",
  "suspenso",
] as const;

export const ESTADOS_REVISAO = [
  "rascunho",
  "preco_pendente",
  "precificada",
  "enviada",
  "aprovada",
  "recusada",
  "substituida",
] as const;

// Só para CHECK constraints com constantes do próprio código; nunca com entrada de usuário.
const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));

// ── Núcleo ──────────────────────────────────────────────
export const perfis = pgTable("perfis", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
});

export const permissoes = pgTable("permissoes", {
  codigo: text("codigo").primaryKey(),
  travadaAdmin: boolean("travada_admin").notNull(),
});

export const perfilPermissoes = pgTable(
  "perfil_permissoes",
  {
    perfilId: text("perfil_id").notNull().references(() => perfis.id),
    permissao: text("permissao").notNull().references(() => permissoes.codigo),
  },
  (t) => [
    primaryKey({ columns: [t.perfilId, t.permissao] }),
    index("perfil_permissoes_permissao_idx").on(t.permissao),
  ],
);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    perfilId: text("perfil_id").notNull().references(() => perfis.id),
    ativo: boolean("ativo").notNull().default(true),
    ficticio: boolean("ficticio").notNull().default(false),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    // E-mail sempre minúsculo: o unique fica insensível a maiúsculas sem citext.
    check("usuarios_email_minusculo_check", sql`${t.email} = lower(${t.email})`),
    index("usuarios_perfil_id_idx").on(t.perfilId),
  ],
);

// Só recebe INSERT: a role da aplicação não tem UPDATE/DELETE aqui (Task 2, Step 7).
export const eventosAuditoria = pgTable(
  "eventos_auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    autorId: uuid("autor_id").references(() => usuarios.id),
    operacao: text("operacao").notNull(),
    entidade: text("entidade").notNull(),
    // text: chaves de configuracoes/perfis/permissoes são text; UUIDs entram como texto.
    entidadeId: text("entidade_id"),
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    justificativa: text("justificativa"),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("eventos_auditoria_autor_id_idx").on(t.autorId),
    index("eventos_auditoria_entidade_idx").on(t.entidade, t.entidadeId, t.criadoEm),
  ],
);

export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  versao: versao(),
  atualizadoEm: atualizadoEm(),
});

export const sequenciasNumeracao = pgTable(
  "sequencias_numeracao",
  {
    nome: text("nome").primaryKey(),
    proximo: integer("proximo").notNull(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [check("sequencias_proximo_check", sql`${t.proximo} > 0`)],
);

// ── Comercial e processos ───────────────────────────────
export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj").unique(),
  ficticio: boolean("ficticio").notNull().default(false),
  versao: versao(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const processos = pgTable(
  "processos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numero: integer("numero").notNull().unique(),
    clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
    situacaoComercial: text("situacao_comercial").notNull().default("cotacao_aberta"),
    derivadoDeProcessoId: uuid("derivado_de_processo_id").references((): AnyPgColumn => processos.id),
    titulo: text("titulo").notNull(),
    ficticio: boolean("ficticio").notNull().default(false),
    criadoPor: uuid("criado_por").notNull().references(() => usuarios.id),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    check("processos_situacao_check", sql`${t.situacaoComercial} in (${lista(SITUACOES_COMERCIAIS)})`),
    check("processos_numero_check", sql`${t.numero} > 0`),
    // Um processo não deriva de si mesmo.
    check("processos_derivado_check", sql`${t.derivadoDeProcessoId} is null or ${t.derivadoDeProcessoId} <> ${t.id}`),
    index("processos_cliente_id_idx").on(t.clienteId),
    index("processos_derivado_de_processo_id_idx").on(t.derivadoDeProcessoId),
    index("processos_criado_por_idx").on(t.criadoPor),
  ],
);

// Revisão vigente = a de maior `sequencia` do processo (ordem numérica; texto ordenaria "AA" antes de "B").
// `letra` é só rótulo de exibição; o número exibido é processos.numero + letra da revisão vigente (ex.: 357-A).
// processos não guarda letra: uma cópia exigiria sincronização e poderia divergir.
// processo_id não ganha índice próprio: é a primeira coluna dos uniques compostos.
export const revisoesComerciais = pgTable(
  "revisoes_comerciais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    processoId: uuid("processo_id").notNull().references(() => processos.id),
    letra: text("letra").notNull(),
    sequencia: integer("sequencia").notNull(),
    estado: text("estado").notNull().default("rascunho"),
    validadeDias: integer("validade_dias"),
    prazoEntrega: text("prazo_entrega"),
    condicoesPagamento: text("condicoes_pagamento"),
    observacoes: text("observacoes"),
    precificadaPor: uuid("precificada_por").references(() => usuarios.id),
    aprovadaPor: uuid("aprovada_por").references(() => usuarios.id),
    criadoPor: uuid("criado_por").notNull().references(() => usuarios.id),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("revisoes_processo_letra_uq").on(t.processoId, t.letra),
    unique("revisoes_processo_sequencia_uq").on(t.processoId, t.sequencia),
    check("revisoes_validade_check", sql`${t.validadeDias} is null or ${t.validadeDias} > 0`),
    check("revisoes_sequencia_check", sql`${t.sequencia} > 0`),
    check("revisoes_letra_check", sql`${t.letra} ~ '^[A-Z]{1,2}$'`),
    index("revisoes_comerciais_precificada_por_idx").on(t.precificadaPor),
    index("revisoes_comerciais_aprovada_por_idx").on(t.aprovadaPor),
    index("revisoes_comerciais_criado_por_idx").on(t.criadoPor),
    check("revisoes_estado_check", sql`${t.estado} in (${lista(ESTADOS_REVISAO)})`),
  ],
);

// revisao_id não ganha índice próprio: é a primeira coluna do unique composto.
export const itensRevisao = pgTable(
  "itens_revisao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisaoId: uuid("revisao_id").notNull().references(() => revisoesComerciais.id),
    ordem: integer("ordem").notNull(),
    descricao: text("descricao").notNull(),
    quantidade: integer("quantidade").notNull(),
    unidade: text("unidade").notNull().default("pç"),
    // null = preço pendente (só o Admin precifica).
    precoUnitarioCentavos: bigint("preco_unitario_centavos", { mode: "number" }),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("itens_revisao_ordem_uq").on(t.revisaoId, t.ordem),
    check("itens_quantidade_check", sql`${t.quantidade} > 0`),
    check("itens_preco_check", sql`${t.precoUnitarioCentavos} is null or ${t.precoUnitarioCentavos} >= 0`),
  ],
);
