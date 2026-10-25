import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
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
  (t) => [primaryKey({ columns: [t.perfilId, t.permissao] })],
);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  perfilId: text("perfil_id").notNull().references(() => perfis.id),
  ativo: boolean("ativo").notNull().default(true),
  ficticio: boolean("ficticio").notNull().default(false),
  versao: versao(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

// Só recebe INSERT: a role da aplicação não tem UPDATE/DELETE aqui (Task 2, Step 7).
export const eventosAuditoria = pgTable("eventos_auditoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  autorId: uuid("autor_id").references(() => usuarios.id),
  operacao: text("operacao").notNull(),
  entidade: text("entidade").notNull(),
  entidadeId: uuid("entidade_id"),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  justificativa: text("justificativa"),
  criadoEm: criadoEm(),
});

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
    letra: text("letra").notNull().default("A"),
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
    check("processos_letra_check", sql`${t.letra} ~ '^[A-Z]{1,2}$'`),
  ],
);

export const revisoesComerciais = pgTable(
  "revisoes_comerciais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    processoId: uuid("processo_id").notNull().references(() => processos.id),
    letra: text("letra").notNull(),
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
    check("revisoes_estado_check", sql`${t.estado} in (${lista(ESTADOS_REVISAO)})`),
  ],
);

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
  },
  (t) => [
    unique("itens_revisao_ordem_uq").on(t.revisaoId, t.ordem),
    check("itens_quantidade_check", sql`${t.quantidade} > 0`),
    check("itens_preco_check", sql`${t.precoUnitarioCentavos} is null or ${t.precoUnitarioCentavos} >= 0`),
  ],
);
