# Usinagem 1B: domínio, RBAC e cenários V2.3, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contratos TS do domínio inteiro, RBAC com sigilo por campo, regras de processo e funções puras de demanda, entrega e estoque, provadas pelos 4 cenários da V2.3 antes de qualquer schema de estoque.

**Architecture:** Tudo em `apps/usinagem/lib/dominio/`, puro (sem I/O, sem Next, sem banco), com testes Vitest ao lado. O servidor ganha só `lib/servidor/sessao.ts`, que lê o usuário de dev e chama a decisão pura. Imports relativos dentro de `lib/dominio` (o Vitest não resolve o alias `@/`).

**Tech Stack:** TypeScript estrito, Vitest 5.0.5, Next 16.3.4 (`cookies()` assíncrono, `server-only`).

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4 a §7, §10)

## Global Constraints

- Depende do 1A concluído (schema, seed, Vitest, migration aplicada pelo humano).
- Agente nunca cria nem edita migration. Esta fatia não muda `schema.ts`.
- Quantidade sempre inteira > 0 nas operações; dinheiro em centavos inteiros.
- Mensagens de erro em PT-BR, sem travessão.
- Admin tem todas as permissões. Permissão travada nunca vale para outro perfil, nem se o banco disser o contrário.
- Sem push.

---

### Task 1: Base comum e contratos do domínio

**Files:**
- Create: `apps/usinagem/lib/dominio/comum.ts`
- Create: `apps/usinagem/lib/dominio/contratos.ts`
- Test: `apps/usinagem/lib/dominio/comum.test.ts`

**Interfaces:**
- Produces: `type Id`, `type Centavos`, `type Resultado<T>`, `ok(valor)`, `falha(erro)`, `deduplicarPorChave<T extends { chave: string }>(itens: T[]): T[]`, `ehQuantidadeValida(n: number): boolean`, e os tipos de entidade de `contratos.ts`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/comum.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deduplicarPorChave, ehQuantidadeValida, falha, ok } from "./comum";

describe("comum", () => {
  it("deduplica pela chave, primeiro vence", () => {
    const r = deduplicarPorChave([
      { chave: "a", v: 1 },
      { chave: "b", v: 2 },
      { chave: "a", v: 3 },
    ]);
    expect(r).toEqual([{ chave: "a", v: 1 }, { chave: "b", v: 2 }]);
  });
  it("quantidade válida é inteira e positiva", () => {
    expect(ehQuantidadeValida(5)).toBe(true);
    expect(ehQuantidadeValida(0)).toBe(false);
    expect(ehQuantidadeValida(-1)).toBe(false);
    expect(ehQuantidadeValida(1.5)).toBe(false);
  });
  it("Resultado", () => {
    expect(ok(1)).toEqual({ ok: true, valor: 1 });
    expect(falha("x")).toEqual({ ok: false, erro: "x" });
  });
});
```

Run: `cd apps/usinagem && pnpm test lib/dominio/comum.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar `comum.ts`**

```ts
export type Id = string;
/** Valor monetário em centavos inteiros. Nunca float. */
export type Centavos = number;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
export const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

/** Idempotência: o mesmo evento (mesma chave) conta uma vez só. */
export function deduplicarPorChave<T extends { chave: string }>(itens: T[]): T[] {
  const vistas = new Set<string>();
  return itens.filter((i) => (vistas.has(i.chave) ? false : (vistas.add(i.chave), true)));
}

export const ehQuantidadeValida = (n: number): boolean => Number.isInteger(n) && n > 0;
```

- [ ] **Step 3: Contratos de todas as entidades da spec §4**

`lib/dominio/contratos.ts`:

```ts
// Contratos das entidades do ERP (spec §4). Tipos só; regras ficam nos módulos de domínio.
// Entidades de estoque, entrega e demanda que têm regra própria são exportadas pelos módulos
// estoque/, entrega/ e demanda/.
import type { Centavos, Id } from "./comum";
import type { Perfil } from "./permissoes/perfis";

type Registro = { id: Id; criadoEm: string; criadoPor: Id };

// Núcleo
export type Usuario = { id: Id; nome: string; email: string; perfil: Perfil; ativo: boolean; ficticio: boolean };
export type EventoAuditoria = {
  id: Id; autorId: Id | null; operacao: string; entidade: string; entidadeId: Id | null;
  antes: unknown; depois: unknown; justificativa: string | null; criadoEm: string;
};

// Comercial e processos
export type Cliente = { id: Id; razaoSocial: string; cnpj: string | null; ficticio: boolean };
export type ContatoCliente = { id: Id; clienteId: Id; nome: string; email: string | null; telefone: string | null };
export type SituacaoComercial =
  | "cotacao_aberta" | "cotacao_enviada" | "aprovado" | "parcialmente_contratado"
  | "contratado" | "perdido" | "cancelado" | "suspenso" | "fechado";
export type Processo = Registro & {
  numero: number; letra: string; clienteId: Id; titulo: string;
  situacaoComercial: SituacaoComercial; derivadoDeProcessoId: Id | null; ficticio: boolean;
};
export type EstadoRevisao =
  | "rascunho" | "preco_pendente" | "precificada" | "enviada" | "aprovada" | "recusada" | "substituida";
export type RevisaoComercial = Registro & {
  processoId: Id; letra: string; estado: EstadoRevisao; validadeDias: number | null;
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
export type RevisaoTecnica = Registro & {
  desenhoId: Id; rotulo: string; caminhoRede: string; metadados: Record<string, string>;
  aprovadoPor: Id | null; liberadoParaParceiroEm: string | null;
};
export type CompatibilidadeRevisao = Registro & { revisaoA: Id; revisaoB: Id; motivo: string };
export type Produto = Registro & { descricao: string; clienteId: Id | null; revisaoTecnicaVigenteId: Id };

// Parceiros e compras
export type PapelParceiro = "fornecedor_mp" | "fabricante";
export type Parceiro = { id: Id; razaoSocial: string; papeis: PapelParceiro[]; ficticio: boolean };
export type CotacaoFornecedor = Registro & {
  processoId: Id; itemRevisaoId: Id; parceiroId: Id; precoCentavos: Centavos; prazoDias: number;
  validade: string | null; escolhida: boolean;
};
export type Compra = Registro & { parceiroId: Id; processoId: Id; situacao: "aberta" | "recebida" | "cancelada" };
export type ItemCompra = { id: Id; compraId: Id; descricao: string; quantidade: number; precoCentavos: Centavos };
export type RecebimentoMp = Registro & { compraId: Id; chave: string; quantidade: number };

// Pedido formal
export type PedidoCliente = Registro & {
  processoId: Id; numeroExterno: string; data: string; situacao: "ativo" | "cancelado";
};
export type PedidoItem = {
  id: Id; pedidoId: Id; produtoId: Id; revisaoTecnicaId: Id; quantidadeContratada: number;
  precoUnitarioCentavos: Centavos; prazo: string | null;
};
export type AditivoPedido = Registro & { pedidoItemId: Id; novaQuantidade: number; motivo: string };

// Produção e qualidade
export type SituacaoProducao = "nao_iniciada" | "em_execucao" | "liberada" | "com_bloqueio";
export type OrdemProducao = Registro & {
  processoId: Id; produtoId: Id; revisaoTecnicaId: Id; quantidade: number; situacao: SituacaoProducao;
};
export type EtapaFabricacao = {
  id: Id; ordemId: Id; tipo: string; sequencia: number; parceiroId: Id | null; prazo: string | null;
  responsavelId: Id | null; situacao: "pendente" | "em_andamento" | "concluida";
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
export type TituloPagar = { id: Id; parceiroId: Id; processoId: Id | null; valorCentavos: Centavos; vencimento: string; situacao: SituacaoTitulo };
export type TituloReceber = { id: Id; clienteId: Id; processoId: Id | null; documentoFiscalId: Id | null; valorCentavos: Centavos; vencimento: string; situacao: SituacaoTitulo };
export type Baixa = Registro & { tituloId: Id; chave: string; valorCentavos: Centavos; estornoDe: Id | null };
```

Os tipos de `estoque/`, `entrega/` e `demanda/` saem nas Tasks 4 a 6.

- [ ] **Step 4: Rodar**

Run: `pnpm test lib/dominio/comum.test.ts && pnpm typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/usinagem/lib/dominio/comum.ts apps/usinagem/lib/dominio/comum.test.ts apps/usinagem/lib/dominio/contratos.ts
git commit -m "feat(usinagem): base comum e contratos do domínio"
```

### Task 2: Catálogo de permissões, matriz padrão e `pode`

**Files:**
- Create: `apps/usinagem/lib/dominio/permissoes/catalogo.ts`
- Test: `apps/usinagem/lib/dominio/permissoes/catalogo.test.ts`

**Interfaces:**
- Consumes: `Perfil`, `PERFIS` (1A, `perfis.ts`); `Resultado`, `ok`, `falha`.
- Produces: `PERMISSOES: Record<Permissao, boolean>` (valor = travada no Admin), `type Permissao`, `MATRIZ_PADRAO: Record<Exclude<Perfil, "admin">, readonly Permissao[]>`, `pode(perfil: Perfil, permissao: Permissao, concedidas?: readonly Permissao[]): boolean`, `validarConcessao(perfil: Perfil, permissao: Permissao): Resultado<true>`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/permissoes/catalogo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MATRIZ_PADRAO, PERMISSOES, pode, validarConcessao, type Permissao } from "./catalogo";

const travadas = (Object.keys(PERMISSOES) as Permissao[]).filter((p) => PERMISSOES[p]);

describe("catálogo de permissões", () => {
  it("tem 51 permissões, 16 travadas no Admin", () => {
    expect(Object.keys(PERMISSOES)).toHaveLength(51);
    expect(travadas).toHaveLength(16);
  });

  it("Admin pode tudo", () => {
    for (const p of Object.keys(PERMISSOES) as Permissao[]) expect(pode("admin", p)).toBe(true);
  });

  it("nenhum perfil não Admin recebe permissão travada no padrão", () => {
    for (const lista of Object.values(MATRIZ_PADRAO)) for (const p of lista) expect(PERMISSOES[p]).toBe(false);
  });

  it("permissão travada é negada mesmo se o banco a conceder", () => {
    expect(pode("financeiro", "margem.ver", ["margem.ver"])).toBe(false);
  });

  it("Financeiro: 403 em margem, custo de lote e valorização", () => {
    expect(pode("financeiro", "margem.ver")).toBe(false);
    expect(pode("financeiro", "custo_lote.ver")).toBe(false);
    expect(pode("financeiro", "estoque.valorizacao.ver")).toBe(false);
  });

  it("matriz da spec §7.2, amostra por perfil", () => {
    expect(pode("comercial", "processo.criar")).toBe(true);
    expect(pode("comercial", "custo.ver")).toBe(false);
    expect(pode("comercial", "preco.definir")).toBe(false);
    expect(pode("compras_producao", "custo.ver")).toBe(true);
    expect(pode("compras_producao", "preco.ver")).toBe(false);
    expect(pode("compras_producao", "entrega.expedir")).toBe(true);
    expect(pode("tecnico", "qualidade.liberar")).toBe(true);
    expect(pode("tecnico", "titulo_pagar.operar")).toBe(false);
    expect(pode("financeiro", "titulo_receber.operar")).toBe(true);
    for (const perfil of ["comercial", "compras_producao", "financeiro", "tecnico"] as const) {
      expect(pode(perfil, "estoque.ver")).toBe(true);
      expect(pode(perfil, "processo.ver")).toBe(true);
    }
  });

  it("concessão de travada a outro perfil é recusada", () => {
    expect(validarConcessao("comercial", "reserva_firme.liberar").ok).toBe(false);
    expect(validarConcessao("comercial", "entrega.expedir").ok).toBe(true);
  });
});
```

Run: `pnpm test lib/dominio/permissoes`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar**

`lib/dominio/permissoes/catalogo.ts`:

```ts
import { falha, ok, type Resultado } from "../comum";
import type { Perfil } from "./perfis";

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
  "cotacao_fornecedor.registrar": false,
  "custo.ver": false,
  "margem.ver": true,
  "custo_lote.ver": true,
  "estoque.valorizacao.ver": true,
  "desenho.gerenciar": false,
  "revisao_tecnica.criar": false,
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
    "processo.ver", "parceiro.gerenciar", "cotacao_fornecedor.registrar", "custo.ver",
    "producao.registrar", "compra.registrar", "recebimento.registrar", "alocacao.registrar",
    "retrabalho.abrir", "entrega.expedir", "estoque.ver", "estoque.registrar_ocorrencia",
  ],
  // preco.ver só em AR e custo.ver só em AP: o recorte é do módulo sigilo.
  financeiro: [
    "processo.ver", "preco.ver", "custo.ver", "nf.registrar", "titulo_pagar.operar",
    "titulo_receber.operar", "estoque.ver",
  ],
  tecnico: [
    "processo.ver", "desenho.gerenciar", "revisao_tecnica.criar", "compatibilidade.declarar",
    "retrabalho.abrir", "qualidade.inspecionar", "qualidade.liberar", "estoque.ver",
    "estoque.registrar_ocorrencia",
  ],
};

/** `concedidas` vem de `perfil_permissoes` no servidor; sem ela, vale o padrão. */
export function pode(perfil: Perfil, permissao: Permissao, concedidas?: readonly Permissao[]): boolean {
  if (perfil === "admin") return true;
  if (PERMISSOES[permissao]) return false;
  return (concedidas ?? MATRIZ_PADRAO[perfil]).includes(permissao);
}

export function validarConcessao(perfil: Perfil, permissao: Permissao): Resultado<true> {
  if (perfil !== "admin" && PERMISSOES[permissao]) {
    return falha("Esta permissão é exclusiva do Admin e não pode ser atribuída.");
  }
  return ok(true);
}
```

- [ ] **Step 3: Rodar**

Run: `pnpm test lib/dominio/permissoes`
Expected: PASS (7 testes).

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/permissoes/catalogo.ts apps/usinagem/lib/dominio/permissoes/catalogo.test.ts
git commit -m "feat(usinagem): catálogo RBAC, matriz padrão e travas do Admin"
```

### Task 3: Sigilo por campo e invariantes de usuário

**Files:**
- Create: `apps/usinagem/lib/dominio/sigilo/serializar.ts`
- Create: `apps/usinagem/lib/dominio/usuarios/admin.ts`
- Test: `apps/usinagem/lib/dominio/sigilo/serializar.test.ts`
- Test: `apps/usinagem/lib/dominio/usuarios/admin.test.ts`

**Interfaces:**
- Consumes: `pode`, `Perfil`, `ItemRevisao`, `TituloPagar`, `TituloReceber`, `Resultado`.
- Produces:
  - `serializarItemRevisao(item: ItemRevisao, perfil: Perfil): Partial<ItemRevisao>`;
  - `serializarTituloPagar(t: TituloPagar, perfil: Perfil): Partial<TituloPagar> | null` (null = 403);
  - `serializarTituloReceber(t: TituloReceber, perfil: Perfil): Partial<TituloReceber> | null`;
  - `validarAlteracaoUsuario(usuarios: { id: string; perfil: Perfil; ativo: boolean }[], alvoId: string, mudanca: { perfil?: Perfil; ativo?: boolean }): Resultado<true>`;
  - `REAUTENTICACAO_MAX_MS = 600_000`;
  - `reautenticacaoRecente(ultima: Date, agora: Date): boolean`.

- [ ] **Step 1: Testes que falham**

`lib/dominio/sigilo/serializar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import { serializarItemRevisao, serializarTituloPagar, serializarTituloReceber } from "./serializar";

const item: ItemRevisao = {
  id: "i1", revisaoId: "r1", ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç",
  revisaoTecnicaId: null, precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000,
};
const ap: TituloPagar = { id: "p1", parceiroId: "f1", processoId: "proc1", valorCentavos: 6_000, vencimento: "2026-11-10", situacao: "aberto" };
const ar: TituloReceber = { id: "r1", clienteId: "c1", processoId: "proc1", documentoFiscalId: "nf1", valorCentavos: 10_000, vencimento: "2026-11-20", situacao: "aberto" };

describe("sigilo por campo", () => {
  it("Admin vê preço e custo lado a lado", () => {
    const s = serializarItemRevisao(item, "admin");
    expect(s.precoUnitarioCentavos).toBe(10_000);
    expect(s.custoEstimadoCentavos).toBe(6_000);
  });
  it("Comercial vê preço, nunca custo", () => {
    const s = serializarItemRevisao(item, "comercial");
    expect(s.precoUnitarioCentavos).toBe(10_000);
    expect("custoEstimadoCentavos" in s).toBe(false);
  });
  it("Compras vê custo, nunca preço", () => {
    const s = serializarItemRevisao(item, "compras_producao");
    expect(s.custoEstimadoCentavos).toBe(6_000);
    expect("precoUnitarioCentavos" in s).toBe(false);
  });
  it("Financeiro não vê preço nem custo no item da revisão", () => {
    const s = serializarItemRevisao(item, "financeiro");
    expect("precoUnitarioCentavos" in s).toBe(false);
    expect("custoEstimadoCentavos" in s).toBe(false);
  });
  it("Financeiro opera AP e AR sem vínculo de processo", () => {
    const p = serializarTituloPagar(ap, "financeiro")!;
    const r = serializarTituloReceber(ar, "financeiro")!;
    expect(p.valorCentavos).toBe(6_000);
    expect(r.valorCentavos).toBe(10_000);
    expect("processoId" in p).toBe(false);
    expect("processoId" in r).toBe(false);
  });
  it("Admin vê processo nos títulos", () => {
    expect(serializarTituloPagar(ap, "admin")!.processoId).toBe("proc1");
  });
  it("perfil sem permissão de título recebe null (403)", () => {
    expect(serializarTituloPagar(ap, "comercial")).toBeNull();
    expect(serializarTituloReceber(ar, "tecnico")).toBeNull();
  });
});
```

`lib/dominio/usuarios/admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reautenticacaoRecente, validarAlteracaoUsuario } from "./admin";

const um = [
  { id: "a", perfil: "admin" as const, ativo: true },
  { id: "c", perfil: "comercial" as const, ativo: true },
];

describe("invariantes de usuário", () => {
  it("última conta Admin não pode ser desativada", () => {
    expect(validarAlteracaoUsuario(um, "a", { ativo: false }).ok).toBe(false);
  });
  it("última conta Admin não pode perder o perfil", () => {
    expect(validarAlteracaoUsuario(um, "a", { perfil: "financeiro" }).ok).toBe(false);
  });
  it("com outro Admin ativo, pode", () => {
    const dois = [...um, { id: "b", perfil: "admin" as const, ativo: true }];
    expect(validarAlteracaoUsuario(dois, "a", { ativo: false }).ok).toBe(true);
  });
  it("Admin inativo não conta como outro Admin", () => {
    const comInativo = [...um, { id: "b", perfil: "admin" as const, ativo: false }];
    expect(validarAlteracaoUsuario(comInativo, "a", { ativo: false }).ok).toBe(false);
  });
  it("alterar não Admin é livre", () => {
    expect(validarAlteracaoUsuario(um, "c", { ativo: false }).ok).toBe(true);
  });
  it("reautenticação vale 10 minutos", () => {
    const t0 = new Date("2026-10-24T10:00:00Z");
    expect(reautenticacaoRecente(t0, new Date("2026-10-24T10:09:59Z"))).toBe(true);
    expect(reautenticacaoRecente(t0, new Date("2026-10-24T10:10:01Z"))).toBe(false);
  });
});
```

Run: `pnpm test lib/dominio/sigilo lib/dominio/usuarios`
Expected: FAIL, módulos não existem.

- [ ] **Step 2: Implementar `sigilo/serializar.ts`**

```ts
import type { ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import { pode } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";

// O campo proibido não sai do servidor. Esconder na tela não basta (spec §7.3).

export function serializarItemRevisao(item: ItemRevisao, perfil: Perfil): Partial<ItemRevisao> {
  const { precoUnitarioCentavos, custoEstimadoCentavos, ...base } = item;
  // Financeiro tem preco.ver só em AR e custo.ver só em AP: nunca no item da revisão.
  const contextoComercial = perfil !== "financeiro";
  return {
    ...base,
    ...(contextoComercial && pode(perfil, "preco.ver") ? { precoUnitarioCentavos } : {}),
    ...(contextoComercial && pode(perfil, "custo.ver") ? { custoEstimadoCentavos } : {}),
  };
}

export function serializarTituloPagar(t: TituloPagar, perfil: Perfil): Partial<TituloPagar> | null {
  if (!pode(perfil, "titulo_pagar.operar")) return null;
  const { processoId, valorCentavos, ...base } = t;
  return {
    ...base,
    ...(pode(perfil, "custo.ver") ? { valorCentavos } : {}),
    // Pendente com o dono: Financeiro sem vínculo de processo impede cruzar AP com AR.
    ...(perfil === "admin" ? { processoId } : {}),
  };
}

export function serializarTituloReceber(t: TituloReceber, perfil: Perfil): Partial<TituloReceber> | null {
  if (!pode(perfil, "titulo_receber.operar")) return null;
  const { processoId, valorCentavos, ...base } = t;
  return {
    ...base,
    ...(pode(perfil, "preco.ver") ? { valorCentavos } : {}),
    ...(perfil === "admin" ? { processoId } : {}),
  };
}
```

- [ ] **Step 3: Implementar `usuarios/admin.ts`**

```ts
import { falha, ok, type Resultado } from "../comum";
import type { Perfil } from "../permissoes/perfis";

type UsuarioResumo = { id: string; perfil: Perfil; ativo: boolean };

export function validarAlteracaoUsuario(
  usuarios: UsuarioResumo[],
  alvoId: string,
  mudanca: { perfil?: Perfil; ativo?: boolean },
): Resultado<true> {
  const alvo = usuarios.find((u) => u.id === alvoId);
  if (!alvo) return falha("Usuário não encontrado.");
  const eraAdminAtivo = alvo.perfil === "admin" && alvo.ativo;
  const continuaAdminAtivo = (mudanca.perfil ?? alvo.perfil) === "admin" && (mudanca.ativo ?? alvo.ativo);
  if (!eraAdminAtivo || continuaAdminAtivo) return ok(true);
  const outrosAdmins = usuarios.filter((u) => u.id !== alvoId && u.perfil === "admin" && u.ativo);
  return outrosAdmins.length > 0
    ? ok(true)
    : falha("A última conta Admin ativa não pode ser desativada nem perder o perfil.");
}

export const REAUTENTICACAO_MAX_MS = 10 * 60 * 1000;

export const reautenticacaoRecente = (ultima: Date, agora: Date): boolean =>
  agora.getTime() - ultima.getTime() <= REAUTENTICACAO_MAX_MS;
```

- [ ] **Step 4: Rodar**

Run: `pnpm test lib/dominio/sigilo lib/dominio/usuarios`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/usinagem/lib/dominio/sigilo apps/usinagem/lib/dominio/usuarios
git commit -m "feat(usinagem): sigilo por campo e trava da última conta Admin"
```

### Task 4: Regras de processo e proposta

**Files:**
- Create: `apps/usinagem/lib/dominio/processo/regras.ts`
- Test: `apps/usinagem/lib/dominio/processo/regras.test.ts`

**Interfaces:**
- Consumes: `pode`, `Perfil`, `EstadoRevisao`, `Resultado`.
- Produces:
  - `validarCancelamento(perfil: Perfil, vinculos: VinculosOperacionais, motivo: string): Resultado<true>`;
  - `type VinculosOperacionais = { pedidosFormais: number; compras: number; ordensProducao: number }`;
  - `type Conciliacao = { saldoEntrega: number; aceitesPendentes: number; aceitoSemNf: number; devolucoesPendentes: number }`;
  - `conciliado(c: Conciliacao): boolean`;
  - `validarFechamento(perfil: Perfil, c: Conciliacao, justificativa?: string): Resultado<true>`;
  - `validarProposta(perfil: Perfil, acao: "proposta.gerar_pdf" | "proposta.enviar", estado: EstadoRevisao): Resultado<true>`;
  - `validarPrecificacao(perfil: Perfil, itens: { precoUnitarioCentavos: number | null }[]): Resultado<true>`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/processo/regras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { conciliado, validarCancelamento, validarFechamento, validarPrecificacao, validarProposta } from "./regras";

const semVinculo = { pedidosFormais: 0, compras: 0, ordensProducao: 0 };
const comPedido = { ...semVinculo, pedidosFormais: 1 };
const fechado = { saldoEntrega: 0, aceitesPendentes: 0, aceitoSemNf: 0, devolucoesPendentes: 0 };

describe("cancelar processo", () => {
  it("Comercial cancela sem pedido, compra ou OP", () => {
    expect(validarCancelamento("comercial", semVinculo, "Cliente desistiu").ok).toBe(true);
  });
  it("Comercial não cancela com pedido, compra ou OP", () => {
    expect(validarCancelamento("comercial", comPedido, "x").ok).toBe(false);
    expect(validarCancelamento("comercial", { ...semVinculo, compras: 1 }, "x").ok).toBe(false);
    expect(validarCancelamento("comercial", { ...semVinculo, ordensProducao: 2 }, "x").ok).toBe(false);
  });
  it("Admin cancela com pedido", () => {
    expect(validarCancelamento("admin", comPedido, "Acordo com cliente").ok).toBe(true);
  });
  it("motivo é obrigatório", () => {
    expect(validarCancelamento("admin", semVinculo, "  ").ok).toBe(false);
  });
  it("Técnico sem permissão", () => {
    expect(validarCancelamento("tecnico", semVinculo, "x").ok).toBe(false);
  });
});

describe("fechar processo", () => {
  it("Comercial fecha conciliado", () => {
    expect(conciliado(fechado)).toBe(true);
    expect(validarFechamento("comercial", fechado).ok).toBe(true);
  });
  it.each([
    ["saldo de entrega", { saldoEntrega: 3 }],
    ["aceite pendente", { aceitesPendentes: 1 }],
    ["NF faltando", { aceitoSemNf: 5 }],
    ["devolução pendente", { devolucoesPendentes: 1 }],
  ])("Comercial não fecha com %s", (_, parcial) => {
    expect(validarFechamento("comercial", { ...fechado, ...parcial }).ok).toBe(false);
  });
  it("Admin fecha não conciliado só com justificativa", () => {
    const aberto = { ...fechado, saldoEntrega: 2 };
    expect(validarFechamento("admin", aberto).ok).toBe(false);
    expect(validarFechamento("admin", aberto, "Cliente dispensou o saldo").ok).toBe(true);
  });
});

describe("proposta", () => {
  it.each(["rascunho", "preco_pendente"] as const)("sem PDF nem envio em %s", (estado) => {
    expect(validarProposta("comercial", "proposta.gerar_pdf", estado).ok).toBe(false);
    expect(validarProposta("comercial", "proposta.enviar", estado).ok).toBe(false);
  });
  it("PDF e envio a partir de precificada", () => {
    expect(validarProposta("comercial", "proposta.gerar_pdf", "precificada").ok).toBe(true);
    expect(validarProposta("comercial", "proposta.enviar", "precificada").ok).toBe(true);
  });
  it("Financeiro não gera PDF", () => {
    expect(validarProposta("financeiro", "proposta.gerar_pdf", "precificada").ok).toBe(false);
  });
  it("só Admin precifica, e todos os itens precisam de preço inteiro", () => {
    expect(validarPrecificacao("comercial", [{ precoUnitarioCentavos: 100 }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: null }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 10.5 }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 100 }]).ok).toBe(true);
  });
});
```

Run: `pnpm test lib/dominio/processo`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar**

`lib/dominio/processo/regras.ts`:

```ts
import { falha, ok, type Resultado } from "../comum";
import type { EstadoRevisao } from "../contratos";
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
  const invalido = itens.some((i) => i.precoUnitarioCentavos === null || !Number.isInteger(i.precoUnitarioCentavos) || i.precoUnitarioCentavos < 0);
  if (itens.length === 0 || invalido) return falha("Todos os itens precisam de preço em centavos inteiros.");
  return ok(true);
}
```

- [ ] **Step 3: Rodar**

Run: `pnpm test lib/dominio/processo`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/processo
git commit -m "feat(usinagem): regras de cancelar e fechar processo e de proposta"
```

### Task 5: Demanda e saldo de entrega

**Files:**
- Create: `apps/usinagem/lib/dominio/demanda/demanda.ts`
- Create: `apps/usinagem/lib/dominio/entrega/saldo.ts`
- Test: `apps/usinagem/lib/dominio/demanda/demanda.test.ts`
- Test: `apps/usinagem/lib/dominio/entrega/saldo.test.ts`

**Interfaces:**
- Consumes: `deduplicarPorChave`, `ehQuantidadeValida`, `Resultado`.
- Produces:
  - `type VinculoDemanda = { pedidoItemId: string; quantidade: number }`;
  - `posicaoDemanda(demanda: number, vinculos: VinculoDemanda[]): { demanda: number; formalizado: number; naoFormalizado: number; acimaDaDemanda: number }`;
  - `type EventoEntrega = { chave: string; tipo: "expedido" | "aceito" | "recusado" | "devolvido"; quantidade: number }`;
  - `type SituacaoEntrega = "nao_programada" | "programada" | "parcialmente_entregue" | "entregue"`;
  - `posicaoEntrega(contratado: number, programado: number, eventos: EventoEntrega[]): PosicaoEntrega`;
  - `validarAceite(p: PosicaoEntrega, quantidade: number): Resultado<true>`.

- [ ] **Step 1: Testes que falham**

`lib/dominio/demanda/demanda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { posicaoDemanda } from "./demanda";

describe("demanda e pedido formal", () => {
  it("demanda 20, pedido 5: 15 não formalizadas", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 5 }])).toEqual({
      demanda: 20, formalizado: 5, naoFormalizado: 15, acimaDaDemanda: 0,
    });
  });
  it("novos pedidos 5 + 10 sobre a mesma demanda: contratado 20, previsão 0", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p2", quantidade: 5 },
      { pedidoItemId: "p3", quantidade: 10 },
    ]);
    expect(r.formalizado).toBe(20);
    expect(r.naoFormalizado).toBe(0);
  });
  it("registrar o mesmo item de pedido de novo não duplica (último valor vale, como aditivo)", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p1", quantidade: 5 },
    ]);
    expect(r.formalizado).toBe(5);
  });
  it("pedido acima da demanda fica visível", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 25 }]).acimaDaDemanda).toBe(5);
  });
});
```

`lib/dominio/entrega/saldo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { posicaoEntrega, validarAceite, type EventoEntrega } from "./saldo";

const ev = (chave: string, tipo: EventoEntrega["tipo"], quantidade: number): EventoEntrega => ({ chave, tipo, quantidade });

describe("saldo de entrega", () => {
  it("sem nada: não programada, saldo = contratado", () => {
    const p = posicaoEntrega(20, 0, []);
    expect(p.saldo).toBe(20);
    expect(p.situacao).toBe("nao_programada");
  });
  it("programação não muda saldo", () => {
    const p = posicaoEntrega(20, 20, []);
    expect(p.saldo).toBe(20);
    expect(p.situacao).toBe("programada");
  });
  it("expedido sem aceite não conta como entregue", () => {
    const p = posicaoEntrega(20, 20, [ev("r1", "expedido", 5)]);
    expect(p.expedido).toBe(5);
    expect(p.aceitoLiquido).toBe(0);
    expect(p.saldo).toBe(20);
  });
  it("devolução reabre saldo", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 4), ev("d1", "devolvido", 1)]);
    expect(p.aceitoLiquido).toBe(3);
    expect(p.saldo).toBe(7);
  });
  it("mesmo evento duas vezes conta uma", () => {
    const p = posicaoEntrega(20, 20, [ev("a1", "aceito", 5), ev("a1", "aceito", 5)]);
    expect(p.aceitoLiquido).toBe(5);
  });
  it("aceite acima do saldo exige aditivo", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 8)]);
    expect(validarAceite(p, 3).ok).toBe(false);
    expect(validarAceite(p, 2).ok).toBe(true);
    expect(validarAceite(p, 0).ok).toBe(false);
  });
  it("pedido com 2 peças diferentes: saldos independentes", () => {
    const a = posicaoEntrega(10, 10, [ev("a1", "aceito", 2)]);
    const b = posicaoEntrega(6, 6, [ev("b1", "aceito", 6)]);
    expect([a.saldo, a.situacao]).toEqual([8, "parcialmente_entregue"]);
    expect([b.saldo, b.situacao]).toEqual([0, "entregue"]);
  });
});
```

Run: `pnpm test lib/dominio/demanda lib/dominio/entrega`
Expected: FAIL, módulos não existem.

- [ ] **Step 2: Implementar `demanda/demanda.ts`**

```ts
export type VinculoDemanda = { pedidoItemId: string; quantidade: number };

/** Vínculo demanda-pedido: cada item de pedido conta uma vez; o último registro (aditivo) vale. */
export function posicaoDemanda(demanda: number, vinculos: VinculoDemanda[]) {
  const porItem = new Map<string, number>();
  for (const v of vinculos) porItem.set(v.pedidoItemId, v.quantidade);
  const formalizado = [...porItem.values()].reduce((s, q) => s + q, 0);
  return {
    demanda,
    formalizado,
    naoFormalizado: Math.max(0, demanda - formalizado),
    acimaDaDemanda: Math.max(0, formalizado - demanda),
  };
}
```

- [ ] **Step 3: Implementar `entrega/saldo.ts`**

```ts
import { deduplicarPorChave, ehQuantidadeValida, falha, ok, type Resultado } from "../comum";

export type EventoEntrega = { chave: string; tipo: "expedido" | "aceito" | "recusado" | "devolvido"; quantidade: number };
export type SituacaoEntrega = "nao_programada" | "programada" | "parcialmente_entregue" | "entregue";
export type PosicaoEntrega = {
  contratado: number; programado: number; expedido: number; aceitoLiquido: number;
  recusado: number; devolvido: number; saldo: number; situacao: SituacaoEntrega;
};

export function posicaoEntrega(contratado: number, programado: number, eventos: EventoEntrega[]): PosicaoEntrega {
  const soma = { expedido: 0, aceito: 0, recusado: 0, devolvido: 0 };
  for (const e of deduplicarPorChave(eventos)) soma[e.tipo] += e.quantidade;
  const aceitoLiquido = soma.aceito - soma.devolvido;
  const situacao: SituacaoEntrega =
    contratado > 0 && aceitoLiquido >= contratado ? "entregue"
    : aceitoLiquido > 0 ? "parcialmente_entregue"
    : programado > 0 ? "programada"
    : "nao_programada";
  return {
    contratado, programado, expedido: soma.expedido, aceitoLiquido,
    recusado: soma.recusado, devolvido: soma.devolvido, saldo: contratado - aceitoLiquido, situacao,
  };
}

export function validarAceite(p: PosicaoEntrega, quantidade: number): Resultado<true> {
  if (!ehQuantidadeValida(quantidade)) return falha("Quantidade aceita precisa ser inteira e positiva.");
  if (quantidade > p.saldo) return falha("Aceite acima do saldo contratado exige aditivo formal.");
  return ok(true);
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm test lib/dominio/demanda lib/dominio/entrega`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/usinagem/lib/dominio/demanda apps/usinagem/lib/dominio/entrega
git commit -m "feat(usinagem): posição de demanda e saldo de entrega"
```

### Task 6: Estoque e reservas

**Files:**
- Create: `apps/usinagem/lib/dominio/estoque/estoque.ts`
- Test: `apps/usinagem/lib/dominio/estoque/estoque.test.ts`

**Interfaces:**
- Consumes: `deduplicarPorChave`, `ehQuantidadeValida`, `Resultado`, `ok`, `falha`.
- Produces (todas puras, devolvem estado novo, nunca mutam):
  - tipos `SituacaoQualidade`, `Lote`, `MovimentoEstoque`, `Reserva`, `EstadoEstoque`, `PosicaoEstoque`;
  - `posicaoEstoque(e: EstadoEstoque, produtoId: string, revisaoTecnicaId: string, compatibilidades?: readonly (readonly [string, string])[]): PosicaoEstoque`;
  - `entradaProducao(e, { chave, lote, quantidade }): Resultado<EstadoEstoque>`;
  - `liberarLote(e, loteId, alocacoes: { reservaId: string; clienteId: string; pedidoItemId: string; quantidade: number }[]): Resultado<EstadoEstoque>`;
  - `reservar(e, nova: Omit<Reserva, "status">): Resultado<EstadoEstoque>`;
  - `converterEmFirme(e, { reservaId, novaReservaId, pedidoItemId, quantidade }): Resultado<EstadoEstoque>`;
  - `expedir(e, { chave, reservaId, quantidade }): Resultado<EstadoEstoque>`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/estoque/estoque.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Resultado } from "../comum";
import {
  converterEmFirme, entradaProducao, expedir, liberarLote, posicaoEstoque, reservar,
  type EstadoEstoque, type Lote,
} from "./estoque";

const vazio: EstadoEstoque = { lotes: [], movimentos: [], reservas: [] };
const lote = (id: string, rev = "revA"): Lote => ({ id, produtoId: "polia", revisaoTecnicaId: rev, situacao: "aguardando_inspecao" });
const valor = <T>(r: Resultado<T>): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
};
const pos = (e: EstadoEstoque, rev = "revA", compat: [string, string][] = []) => posicaoEstoque(e, "polia", rev, compat);

describe("estoque", () => {
  it("lote aguardando inspeção é físico mas não elegível", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    expect(pos(e)).toMatchObject({ fisicoTotal: 40, fisicoElegivel: 0, livre: 0 });
  });

  it("liberação cria reserva firme a partir da alocação", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "R1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    expect(pos(e)).toMatchObject({ fisicoTotal: 40, fisicoElegivel: 40, reservasFirmes: 20, reservasEstrategicas: 0, livre: 20 });
  });

  it("alocação acima do lote é recusada na liberação", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    expect(liberarLote(e, "L1", [{ reservaId: "R1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 11 }]).ok).toBe(false);
  });

  it("reserva acima do livre é recusada; duas reservas nunca passam do livre", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    e = valor(liberarLote(e, "L1", []));
    expect(reservar(e, { id: "X", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 11 }).ok).toBe(false);
    e = valor(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 6 }));
    expect(reservar(e, { id: "R2", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 5 }).ok).toBe(false);
    expect(reservar(e, { id: "R2", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 4 }).ok).toBe(true);
  });

  it("reserva em lote não liberado é recusada", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
  });

  it("firme exige item de pedido; estratégica não aceita item de pedido", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    e = valor(liberarLote(e, "L1", []));
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "firme", clienteId: "C1", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: "PI1", quantidade: 1 }).ok).toBe(false);
  });

  it("converter estratégica em firme não cria peça", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 35 }));
    e = valor(liberarLote(e, "L1", []));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    e = valor(converterEmFirme(e, { reservaId: "E1", novaReservaId: "F1", pedidoItemId: "PI2", quantidade: 5 }));
    expect(pos(e)).toMatchObject({ fisicoTotal: 35, reservasEstrategicas: 10, reservasFirmes: 5, livre: 20 });
  });

  it("expedição baixa o físico e consome a firme; repetir a chave não muda nada", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    e = valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    const depois = valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    expect(pos(depois)).toMatchObject({ fisicoTotal: 15, reservasFirmes: 15, livre: 0 });
    expect(depois).toBe(e);
  });

  it("entrada repetida (mesma chave) não duplica físico", () => {
    const e1 = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    const e2 = valor(entradaProducao(e1, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    expect(pos(e2).fisicoTotal).toBe(20);
  });

  it("revisões incompatíveis não somam; compatibilidade declarada soma", () => {
    let e = valor(entradaProducao(vazio, { chave: "a", lote: lote("LA", "revA"), quantidade: 10 }));
    e = valor(entradaProducao(e, { chave: "b", lote: lote("LB", "revB"), quantidade: 7 }));
    e = valor(liberarLote(e, "LA", []));
    e = valor(liberarLote(e, "LB", []));
    expect(pos(e, "revA").livre).toBe(10);
    expect(pos(e, "revA", [["revB", "revA"]]).livre).toBe(17);
  });

  it("20 peças em processo no parceiro: estoque de acabados 0", () => {
    // Peça no parceiro não tem lote: só vira lote quando volta à Express (spec §3, decisão 6).
    expect(pos(vazio)).toMatchObject({ fisicoTotal: 0, fisicoElegivel: 0, livre: 0 });
  });
});
```

Run: `pnpm test lib/dominio/estoque`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar**

`lib/dominio/estoque/estoque.ts`:

```ts
import { deduplicarPorChave, ehQuantidadeValida, falha, ok, type Resultado } from "../comum";

export type SituacaoQualidade = "aguardando_inspecao" | "liberado" | "rejeitado" | "quarentena";
export type Lote = { id: string; produtoId: string; revisaoTecnicaId: string; situacao: SituacaoQualidade };
export type TipoMovimento = "entrada_producao" | "retorno" | "saida_expedicao" | "ajuste";
/** Quantidade com sinal: saída negativa. `chave` única garante idempotência. */
export type MovimentoEstoque = { chave: string; loteId: string; tipo: TipoMovimento; quantidade: number };
export type Reserva = {
  id: string; loteId: string; tipo: "firme" | "estrategica"; clienteId: string;
  pedidoItemId: string | null; quantidade: number; status: "ativa" | "consumida" | "liberada";
};
export type EstadoEstoque = { lotes: Lote[]; movimentos: MovimentoEstoque[]; reservas: Reserva[] };
export type PosicaoEstoque = {
  fisicoTotal: number; fisicoElegivel: number; reservasFirmes: number; reservasEstrategicas: number; livre: number;
};

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
  const revisoes = revisoesQueSomam(revisaoTecnicaId, compatibilidades);
  const lotes = e.lotes.filter((l) => l.produtoId === produtoId && revisoes.has(l.revisaoTecnicaId));
  const ids = new Set(lotes.map((l) => l.id));
  const ativas = e.reservas.filter((r) => ids.has(r.loteId) && r.status === "ativa");
  const soma = (tipo: Reserva["tipo"]) => ativas.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.quantidade, 0);
  const fisicoTotal = lotes.reduce((s, l) => s + fisicoDoLote(e, l.id), 0);
  const fisicoElegivel = lotes.reduce((s, l) => s + elegivelDoLote(e, l), 0);
  const reservasFirmes = soma("firme");
  const reservasEstrategicas = soma("estrategica");
  // Bloqueios já estão fora do elegível: não subtrair de novo (spec §6.3).
  return { fisicoTotal, fisicoElegivel, reservasFirmes, reservasEstrategicas, livre: fisicoElegivel - reservasFirmes - reservasEstrategicas };
}

const jaAplicado = (e: EstadoEstoque, chave: string) => e.movimentos.some((m) => m.chave === chave);

export function entradaProducao(
  e: EstadoEstoque,
  { chave, lote, quantidade }: { chave: string; lote: Lote; quantidade: number },
): Resultado<EstadoEstoque> {
  if (jaAplicado(e, chave)) return ok(e);
  if (!ehQuantidadeValida(quantidade)) return falha("Quantidade de entrada inválida.");
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
  const lote = e.lotes.find((l) => l.id === loteId);
  if (!lote) return falha("Lote não encontrado.");
  if (lote.situacao !== "aguardando_inspecao") return falha("Lote não está aguardando inspeção.");
  if (alocacoes.some((a) => !ehQuantidadeValida(a.quantidade))) return falha("Quantidade de alocação inválida.");
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

export function reservar(e: EstadoEstoque, nova: Omit<Reserva, "status">): Resultado<EstadoEstoque> {
  if (!ehQuantidadeValida(nova.quantidade)) return falha("Quantidade de reserva inválida.");
  if (nova.tipo === "firme" && !nova.pedidoItemId) return falha("Reserva firme exige item de pedido formal.");
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
  const r = e.reservas.find((x) => x.id === reservaId);
  if (!r || r.tipo !== "estrategica" || r.status !== "ativa") return falha("Reserva estratégica ativa não encontrada.");
  if (!ehQuantidadeValida(quantidade) || quantidade > r.quantidade) return falha("Quantidade maior que a reserva estratégica.");
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
  if (jaAplicado(e, chave)) return ok(e);
  const r = e.reservas.find((x) => x.id === reservaId);
  if (!r || r.tipo !== "firme" || r.status !== "ativa") return falha("Reserva firme ativa não encontrada.");
  if (!ehQuantidadeValida(quantidade) || quantidade > r.quantidade) return falha("Quantidade maior que a reserva firme.");
  return ok({
    ...e,
    movimentos: [...e.movimentos, { chave, loteId: r.loteId, tipo: "saida_expedicao", quantidade: -quantidade }],
    reservas: e.reservas.map((x) => (x.id === reservaId ? reduzirReserva(x, quantidade) : x)),
  });
}
```

- [ ] **Step 3: Rodar**

Run: `pnpm test lib/dominio/estoque`
Expected: PASS (11 testes).

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/estoque
git commit -m "feat(usinagem): estoque por lote, reservas firme e estratégica, expedição idempotente"
```

### Task 7: Os 4 cenários da V2.3 de ponta a ponta

**Files:**
- Test: `apps/usinagem/lib/dominio/cenarios.test.ts`

**Interfaces:**
- Consumes: `posicaoDemanda`, `posicaoEntrega`, `entradaProducao`, `liberarLote`, `reservar`, `expedir`, `posicaoEstoque`.

- [ ] **Step 1: Escrever os cenários**

`lib/dominio/cenarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Resultado } from "./comum";
import { posicaoDemanda } from "./demanda/demanda";
import { posicaoEntrega, type EventoEntrega } from "./entrega/saldo";
import { entradaProducao, expedir, liberarLote, posicaoEstoque, reservar, type EstadoEstoque } from "./estoque/estoque";

const valor = <T>(r: Resultado<T>): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
};
const vazio: EstadoEstoque = { lotes: [], movimentos: [], reservas: [] };
const lote = { id: "L1", produtoId: "polia", revisaoTecnicaId: "revA", situacao: "aguardando_inspecao" as const };
const aceite = (chave: string, quantidade: number): EventoEntrega => ({ chave, tipo: "aceito", quantidade });
const expedicao = (chave: string, quantidade: number): EventoEntrega => ({ chave, tipo: "expedido", quantidade });

describe("Cenário 1: pedido 20, entregas 5 + 5 + 10", () => {
  it("saldo só cai com aceite; entregue após 20 aceitas", () => {
    const ev: EventoEntrega[] = [expedicao("r1", 5)];
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(20);
    ev.push(aceite("a1", 5));
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 15, situacao: "parcialmente_entregue" });
    ev.push(expedicao("r2", 5), aceite("a2", 5), expedicao("r3", 10));
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(10);
    ev.push(aceite("a3", 10));
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 0, aceitoLiquido: 20, situacao: "entregue" });
  });
});

describe("Cenário 2: pedido 20, entrega única de 20", () => {
  it("20 aceitas, saldo 0", () => {
    expect(posicaoEntrega(20, 20, [expedicao("r1", 20), aceite("a1", 20)])).toMatchObject({ saldo: 0, situacao: "entregue" });
  });
});

describe("Cenário 3: demanda 20, pedido formal 5", () => {
  it("5 contratadas, 15 só previstas; pedidos 5 + 10 zeram a previsão sem duplicar", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 5 }])).toMatchObject({ formalizado: 5, naoFormalizado: 15 });
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p2", quantidade: 5 },
      { pedidoItemId: "p3", quantidade: 10 },
      { pedidoItemId: "p2", quantidade: 5 },
    ]);
    expect(r).toMatchObject({ formalizado: 20, naoFormalizado: 0 });
  });
});

describe("Cenário 4: produção acima do pedido", () => {
  const produzir40 = (alocadoAoPedido: number) => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote, quantidade: 40 }));
    return valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: alocadoAoPedido }]));
  };

  it("pedido 20, produz 40, entrega 20: físico 20, sem receita extra; Admin escolhe livre ou reservado", () => {
    const e = valor(expedir(produzir40(20), { chave: "rem1", reservaId: "F1", quantidade: 20 }));
    expect(posicaoEstoque(e, "polia", "revA")).toMatchObject({ fisicoTotal: 20, reservasFirmes: 0, livre: 20 });
    const reservado = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 20 }));
    expect(posicaoEstoque(reservado, "polia", "revA")).toMatchObject({ reservasEstrategicas: 20, livre: 0 });
    expect(posicaoDemanda(20, [{ pedidoItemId: "PI1", quantidade: 20 }]).formalizado).toBe(20);
  });

  it("combinado: demanda 20, pedido 5, produz 40, entrega 5, reserva 15, livre 20", () => {
    let e = valor(expedir(produzir40(5), { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    expect(posicaoEstoque(e, "polia", "revA")).toEqual({
      fisicoTotal: 35, fisicoElegivel: 35, reservasFirmes: 0, reservasEstrategicas: 15, livre: 20,
    });
    expect(posicaoDemanda(20, [{ pedidoItemId: "PI1", quantidade: 5 }])).toMatchObject({ formalizado: 5, naoFormalizado: 15 });
    expect(posicaoEntrega(5, 5, [aceite("a1", 5)]).situacao).toBe("entregue");
  });

  it("variações: reservar as 35 dá livre 0; nenhuma reserva dá livre 35", () => {
    const e = valor(expedir(produzir40(5), { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    expect(posicaoEstoque(e, "polia", "revA").livre).toBe(35);
    const tudo = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 35 }));
    expect(posicaoEstoque(tudo, "polia", "revA").livre).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `pnpm test lib/dominio/cenarios.test.ts`
Expected: PASS. Se algum falhar, a falha é de regra nas Tasks 5 e 6: corrigir lá, nunca afrouxar o cenário.

- [ ] **Step 3: Commit**

```bash
git add apps/usinagem/lib/dominio/cenarios.test.ts
git commit -m "test(usinagem): os 4 cenários da V2.3 de ponta a ponta"
```

### Task 8: `requirePermissao` no servidor e seed de permissões

**Files:**
- Create: `apps/usinagem/lib/dominio/permissoes/acesso.ts`
- Test: `apps/usinagem/lib/dominio/permissoes/acesso.test.ts`
- Create: `apps/usinagem/lib/servidor/sessao.ts`
- Modify: `apps/usinagem/scripts/seed.ts` (função `semear`)
- Modify: `apps/usinagem/scripts/seed.test.ts`

**Interfaces:**
- Consumes: `pode`, `PERMISSOES`, `MATRIZ_PADRAO`, `db()` (1A), `USUARIOS_FICTICIOS` (1A).
- Produces:
  - `type UsuarioSessao = { id: string; nome: string; perfil: Perfil }`;
  - `decidirAcesso(usuario: UsuarioSessao | null, permissao: Permissao, concedidas: readonly Permissao[]): "permitido" | "nao_autenticado" | "negado"`;
  - `class ErroPermissao extends Error { status: 401 | 403 }`;
  - `COOKIE_USUARIO_DEV = "usinagem_dev_usuario"`;
  - `usuarioAtual(): Promise<UsuarioSessao | null>`;
  - `requirePermissao(p: Permissao): Promise<UsuarioSessao>`.
- O seletor de perfil na UI é da 1C: grava `COOKIE_USUARIO_DEV` com um id de `USUARIOS_FICTICIOS`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/permissoes/acesso.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decidirAcesso } from "./acesso";

const fin = { id: "u4", nome: "Fin", perfil: "financeiro" as const };

describe("decidirAcesso", () => {
  it("sem usuário: não autenticado", () => {
    expect(decidirAcesso(null, "processo.ver", [])).toBe("nao_autenticado");
  });
  it("usa as permissões concedidas no banco", () => {
    expect(decidirAcesso(fin, "nf.registrar", ["nf.registrar"])).toBe("permitido");
    expect(decidirAcesso(fin, "nf.registrar", [])).toBe("negado");
  });
  it("travada é negada mesmo concedida", () => {
    expect(decidirAcesso(fin, "margem.ver", ["margem.ver"])).toBe("negado");
  });
});
```

Run: `pnpm test lib/dominio/permissoes/acesso.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar `acesso.ts`**

```ts
import { pode, type Permissao } from "./catalogo";
import type { Perfil } from "./perfis";

export type UsuarioSessao = { id: string; nome: string; perfil: Perfil };

export function decidirAcesso(
  usuario: UsuarioSessao | null,
  permissao: Permissao,
  concedidas: readonly Permissao[],
): "permitido" | "nao_autenticado" | "negado" {
  if (!usuario) return "nao_autenticado";
  return pode(usuario.perfil, permissao, concedidas) ? "permitido" : "negado";
}
```

Run: `pnpm test lib/dominio/permissoes/acesso.test.ts`
Expected: PASS.

- [ ] **Step 3: Ler a doc do Next antes de usar `cookies()`**

Run: `grep -rl "cookies" apps/usinagem/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/ | head`
Ler `cookies.md`: `cookies()` é assíncrono no Next 16.

- [ ] **Step 4: Implementar `lib/servidor/sessao.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { decidirAcesso, type UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import type { Perfil } from "../dominio/permissoes/perfis";
import { db } from "./db";
import { perfilPermissoes, usuarios } from "./db/schema";

export const COOKIE_USUARIO_DEV = "usinagem_dev_usuario";

export class ErroPermissao extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Sessão ausente." : "Sem permissão para esta ação.");
  }
}

// ponytail: sem login real até a etapa de identidade (Better Auth). Fora de dev, ninguém entra.
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const id = (await cookies()).get(COOKIE_USUARIO_DEV)?.value;
  if (!id) return null;
  const [u] = await db()
    .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.ativo, true), eq(usuarios.ficticio, true)));
  return u ? { ...u, perfil: u.perfil as Perfil } : null;
}

export async function requirePermissao(permissao: Permissao): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  const concedidas = usuario
    ? (await db().select({ p: perfilPermissoes.permissao }).from(perfilPermissoes).where(eq(perfilPermissoes.perfilId, usuario.perfil))).map((r) => r.p as Permissao)
    : [];
  const decisao = decidirAcesso(usuario, permissao, concedidas);
  if (decisao === "nao_autenticado") throw new ErroPermissao(401);
  if (decisao === "negado") throw new ErroPermissao(403);
  return usuario!;
}
```

- [ ] **Step 5: Seed de permissões**

Em `scripts/seed.ts`, adicionar o import:

```ts
import { MATRIZ_PADRAO, PERMISSOES, type Permissao } from "../lib/dominio/permissoes/catalogo";
```

Dentro de `semear`, logo depois do insert de `perfis`:

```ts
    await tx
      .insert(schema.permissoes)
      .values((Object.keys(PERMISSOES) as Permissao[]).map((codigo) => ({ codigo, travadaAdmin: PERMISSOES[codigo] })))
      .onConflictDoNothing();
    await tx
      .insert(schema.perfilPermissoes)
      .values(Object.entries(MATRIZ_PADRAO).flatMap(([perfilId, lista]) => lista.map((permissao) => ({ perfilId, permissao }))))
      .onConflictDoNothing();
```

Em `scripts/seed.test.ts`, dentro do `it`, antes do fim:

```ts
    const [perm] = await banco.select({ n: count() }).from(schema.permissoes);
    expect(perm.n).toBe(51);
    const travadasConcedidas = await banco
      .select()
      .from(schema.perfilPermissoes)
      .innerJoin(schema.permissoes, eq(schema.perfilPermissoes.permissao, schema.permissoes.codigo))
      .where(eq(schema.permissoes.travadaAdmin, true));
    expect(travadasConcedidas).toEqual([]);
```

e trocar o import de `drizzle-orm` para `import { count, eq } from "drizzle-orm";`.

- [ ] **Step 6: Rodar tudo**

Run: `cd apps/usinagem && pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm db:seed`
Expected: todos os testes PASS (incluindo seed contra o banco local), typecheck, lint e build limpos, `Seed fictício aplicado.`

- [ ] **Step 7: Commit**

```bash
git add apps/usinagem/lib/dominio/permissoes/acesso.ts apps/usinagem/lib/dominio/permissoes/acesso.test.ts apps/usinagem/lib/servidor/sessao.ts apps/usinagem/scripts/seed.ts apps/usinagem/scripts/seed.test.ts
git commit -m "feat(usinagem): requirePermissao com usuário de dev e seed da matriz RBAC"
```
