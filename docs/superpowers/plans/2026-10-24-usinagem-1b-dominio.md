# Usinagem 1B: domínio, RBAC, sigilo e cenários V2.3, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a camada de regras do ERP, provada pelos 4 cenários da V2.3 antes de qualquer schema de estoque:
- contratos TS do domínio inteiro;
- RBAC com sigilo por campo e bloqueio de vazamentos laterais;
- status macro;
- regras de processo;
- funções puras de demanda, entrega e estoque (com bloqueio e déficit);
- wrapper de permissão deny by default.

**Architecture:**
- Regras ficam em `apps/usinagem/lib/dominio/`, puras: sem I/O, sem Next, sem banco. Os testes Vitest ficam ao lado de cada módulo.
- O servidor ganha só três peças:
  - `lib/servidor/sessao.ts`: usuário atual e `requirePermissao`;
  - `lib/servidor/sessao-dev.ts`: carregado por import dinâmico atrás do gate de dev;
  - `lib/servidor/acao.ts`: o wrapper de permissão.
- Um script de cobertura recusa Server Action ou Route Handler fora do wrapper.
- Dentro de `lib/dominio`, imports são relativos, porque o Vitest não resolve o alias `@/`.

**Tech Stack:** TypeScript estrito, Vitest 5.0.5, Zod 4.6.7, Next 16.3.4 (`cookies()` assíncrono, `unstable_rethrow`, `server-only`).

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4 a §8, §10)

## Global Constraints

- Depende do 1A concluído (schema, seed, Vitest, migrations aplicadas pelo humano).
- Agente nunca cria nem edita migration. Esta entrega não muda `schema.ts`.
- Quantidade de peça sempre inteira > 0. Quantidade de MP/compras é string decimal (`NUMERIC(14,3)`), nunca float. Dinheiro em centavos inteiros.
- Datas exibidas em `America/Sao_Paulo`.
- Mensagens de erro em PT-BR, sem travessão, sem valor de campo oculto.
- Admin tem todas as permissões. Permissão travada nunca vale para outro perfil, nem se o banco disser o contrário.
- Seletor de dev só com `NODE_ENV=development` **e** `ENABLE_DEV_SWITCHER=1`. Qualquer outra combinação falha fechado.
- Sem push.

---

### Task 1: Base comum, contratos e formatação de data

**Files:**
- Create: `apps/usinagem/lib/dominio/comum.ts`
- Create: `apps/usinagem/lib/dominio/contratos.ts`
- Create: `apps/usinagem/lib/dominio/formato.ts`
- Test: `apps/usinagem/lib/dominio/comum.test.ts`
- Test: `apps/usinagem/lib/dominio/formato.test.ts`

**Interfaces:**
- Produces:
  - `type Id`, `type Centavos`, `type QuantidadeDecimal` (string);
  - `type Resultado<T>`, `ok(valor)`, `falha(erro)`;
  - `deduplicarPorChave<T extends { chave: string }>(itens: T[]): T[]`;
  - `ehQuantidadeValida(n: number): boolean`;
  - `formatarDataHora(iso: string | Date): string` (`America/Sao_Paulo`, pt-BR);
  - todos os tipos de entidade de `contratos.ts`.

- [ ] **Step 1: Testes que falham**

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

`lib/dominio/formato.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatarDataHora } from "./formato";

describe("formatarDataHora", () => {
  it("exibe em America/Sao_Paulo (UTC-3)", () => {
    const s = formatarDataHora("2026-10-24T15:00:00Z");
    expect(s).toContain("24/10/2026");
    expect(s).toContain("12:00");
  });
  it("vira o dia corretamente", () => {
    expect(formatarDataHora("2026-10-25T01:30:00Z")).toContain("24/10/2026");
  });
});
```

Run: `cd apps/usinagem && pnpm test lib/dominio/comum.test.ts lib/dominio/formato.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 2: Implementar `comum.ts`**

```ts
export type Id = string;
/** Valor monetário em centavos inteiros. Nunca float. */
export type Centavos = number;
/** Quantidade de MP/compras, NUMERIC(14,3) no banco, string decimal no TS (ex.: "12.500"). */
export type QuantidadeDecimal = string;

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

- [ ] **Step 3: Implementar `formato.ts`**

```ts
const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Banco guarda timestamptz (UTC); a tela sempre mostra o horário de Brasília. */
export const formatarDataHora = (iso: string | Date): string => FORMATO.format(new Date(iso));
```

- [ ] **Step 4: Contratos de todas as entidades da spec §4**

`lib/dominio/contratos.ts`:

```ts
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
```

- [ ] **Step 5: Rodar**

Run: `pnpm test lib/dominio/comum.test.ts lib/dominio/formato.test.ts && pnpm typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/usinagem/lib/dominio/comum.ts apps/usinagem/lib/dominio/comum.test.ts apps/usinagem/lib/dominio/contratos.ts apps/usinagem/lib/dominio/formato.ts apps/usinagem/lib/dominio/formato.test.ts
git commit -m "feat(usinagem): base comum, contratos do domínio e data em America/Sao_Paulo"
```

### Task 2: Catálogo de permissões, matriz padrão e `pode`

**Files:**
- Create: `apps/usinagem/lib/dominio/permissoes/catalogo.ts`
- Test: `apps/usinagem/lib/dominio/permissoes/catalogo.test.ts`

**Interfaces:**
- Consumes: `Perfil` (1A); `Resultado`, `ok`, `falha`.
- Produces:
  - `PERMISSOES: Record<Permissao, boolean>` (valor = travada no Admin);
  - `type Permissao`;
  - `MATRIZ_PADRAO: Record<Exclude<Perfil, "admin">, readonly Permissao[]>`;
  - `pode(perfil: Perfil, permissao: Permissao, concedidas?: readonly Permissao[]): boolean`;
  - `validarConcessao(perfil: Perfil, permissao: Permissao): Resultado<true>`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/permissoes/catalogo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MATRIZ_PADRAO, PERMISSOES, pode, validarConcessao, type Permissao } from "./catalogo";

const travadas = (Object.keys(PERMISSOES) as Permissao[]).filter((p) => PERMISSOES[p]);

describe("catálogo de permissões", () => {
  it("tem 54 permissões, 16 travadas no Admin", () => {
    expect(Object.keys(PERMISSOES)).toHaveLength(54);
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
    expect(pode("compras_producao", "rfq.enviar")).toBe(true);
    expect(pode("compras_producao", "preco.ver")).toBe(false);
    expect(pode("compras_producao", "entrega.expedir")).toBe(true);
    expect(pode("tecnico", "qualidade.liberar")).toBe(true);
    expect(pode("tecnico", "revisao_tecnica.aprovar")).toBe(true);
    expect(pode("tecnico", "revisao_tecnica.liberar_parceiro")).toBe(true);
    expect(pode("comercial", "revisao_tecnica.aprovar")).toBe(false);
    expect(pode("tecnico", "titulo_pagar.operar")).toBe(false);
    expect(pode("financeiro", "titulo_receber.operar")).toBe(true);
    for (const perfil of ["comercial", "compras_producao", "financeiro", "tecnico"] as const) {
      expect(pode(perfil, "estoque.ver")).toBe(true);
      expect(pode(perfil, "processo.ver")).toBe(true);
    }
  });

  it("retrabalho e qualidade são dado da matriz: o banco pode mudar quem tem", () => {
    expect(pode("compras_producao", "qualidade.liberar", ["qualidade.liberar"])).toBe(true);
    expect(pode("tecnico", "retrabalho.abrir", [])).toBe(false);
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
Expected: PASS (8 testes).

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/permissoes/catalogo.ts apps/usinagem/lib/dominio/permissoes/catalogo.test.ts
git commit -m "feat(usinagem): catálogo RBAC com 54 permissões, matriz padrão e travas do Admin"
```

### Task 3: Sigilo por campo, vazamentos laterais e invariantes de usuário

**Files:**
- Create: `apps/usinagem/lib/dominio/sigilo/campos.ts`
- Create: `apps/usinagem/lib/dominio/sigilo/serializar.ts`
- Create: `apps/usinagem/lib/dominio/usuarios/admin.ts`
- Test: `apps/usinagem/lib/dominio/sigilo/serializar.test.ts`
- Test: `apps/usinagem/lib/dominio/usuarios/admin.test.ts`

**Interfaces:**
- Consumes: `pode`, `Perfil`, `ItemRevisao`, `TituloPagar`, `TituloReceber`, `EventoAuditoria`, `Resultado`.
- Produces:
  - `type Contexto = "item_revisao" | "cotacao_fornecedor" | "titulo_pagar" | "titulo_receber"`;
  - `podeVerCampo(perfil, contexto, campo: string): boolean`;
  - `serializar<T extends object>(registro: T, perfil, contexto): Partial<T>`;
  - `serializarItemRevisao(item, perfil)`;
  - `serializarTituloPagar(t, perfil) | null` e `serializarTituloReceber(t, perfil) | null` (null = 403);
  - `serializarEventoAuditoria(ev, perfil): EventoAuditoria | null`;
  - `MENSAGEM_CONSULTA_NEGADA`;
  - `validarConsulta(perfil, contexto, { ordenarPor?, filtros?, busca? }): Resultado<true>`;
  - `validarAgregado(perfil, contexto, { campo, agruparPor? }): Resultado<true>`;
  - `exportarLinhas<T>(linhas: T[], perfil, contexto): Partial<T>[] | null`;
  - `validarAlteracaoUsuario(...)`, `REAUTENTICACAO_MAX_MS`, `reautenticacaoRecente(...)`.

- [ ] **Step 1: Testes que falham**

`lib/dominio/sigilo/serializar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventoAuditoria, ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import {
  MENSAGEM_CONSULTA_NEGADA, exportarLinhas, serializarEventoAuditoria, serializarItemRevisao,
  serializarTituloPagar, serializarTituloReceber, validarAgregado, validarConsulta,
} from "./serializar";

const item: ItemRevisao = {
  id: "i1", revisaoId: "r1", ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç",
  revisaoTecnicaId: null, precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000,
};
const ap: TituloPagar = { id: "p1", parceiroId: "f1", processoId: "proc1", valorCentavos: 6_000, vencimento: "2026-11-10", situacao: "aberto", versao: 1 };
const ar: TituloReceber = { id: "r1", clienteId: "c1", processoId: "proc1", documentoFiscalId: "nf1", valorCentavos: 10_000, vencimento: "2026-11-20", situacao: "aberto", versao: 1 };
const evento = (entidade: string): EventoAuditoria => ({
  id: "e1", autorId: "u1", operacao: "editar", entidade, entidadeId: "i1",
  antes: { descricao: "Polia", precoUnitarioCentavos: 9_000, custoEstimadoCentavos: 5_000 },
  depois: { descricao: "Polia", precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000 },
  justificativa: null, criadoEm: "2026-10-24T12:00:00Z",
});

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

describe("vazamentos laterais", () => {
  it("auditoria vista pelo Comercial sai sem custo em antes/depois", () => {
    const s = serializarEventoAuditoria(evento("itens_revisao"), "comercial")!;
    expect(s.operacao).toBe("editar");
    expect(s.antes).toEqual({ descricao: "Polia", precoUnitarioCentavos: 9_000 });
    expect(s.depois).toEqual({ descricao: "Polia", precoUnitarioCentavos: 10_000 });
  });
  it("auditoria vista por Compras sai sem preço", () => {
    const s = serializarEventoAuditoria(evento("itens_revisao"), "compras_producao")!;
    expect(s.depois).toEqual({ descricao: "Polia", custoEstimadoCentavos: 6_000 });
  });
  it("auditoria de entidade sem mapa de campos: fora do Admin, antes/depois somem (falha fechado)", () => {
    const s = serializarEventoAuditoria(evento("entidade_nova"), "comercial")!;
    expect(s.antes).toBeNull();
    expect(s.depois).toBeNull();
    expect(serializarEventoAuditoria(evento("entidade_nova"), "admin")!.antes).not.toBeNull();
  });
  it("ordenar, filtrar ou buscar por campo oculto é recusado", () => {
    expect(validarConsulta("comercial", "item_revisao", { ordenarPor: "custoEstimadoCentavos" }).ok).toBe(false);
    expect(validarConsulta("compras_producao", "item_revisao", { filtros: ["precoUnitarioCentavos"] }).ok).toBe(false);
    expect(validarConsulta("financeiro", "titulo_receber", { busca: ["processoId"] }).ok).toBe(false);
    expect(validarConsulta("comercial", "item_revisao", { ordenarPor: "precoUnitarioCentavos" }).ok).toBe(true);
  });
  it("mensagem de recusa é genérica: sem nome nem valor do campo", () => {
    const a = validarConsulta("comercial", "item_revisao", { ordenarPor: "custoEstimadoCentavos" });
    const b = validarAgregado("comercial", "item_revisao", { campo: "custoEstimadoCentavos" });
    for (const r of [a, b]) {
      expect(r).toEqual({ ok: false, erro: MENSAGEM_CONSULTA_NEGADA });
    }
    expect(MENSAGEM_CONSULTA_NEGADA).not.toMatch(/custo|preco|preço|\d/i);
  });
  it("agregado sobre campo oculto é recusado, inclusive com grupo de um item", () => {
    expect(validarAgregado("comercial", "item_revisao", { campo: "custoEstimadoCentavos", agruparPor: ["id"] }).ok).toBe(false);
    expect(validarAgregado("compras_producao", "item_revisao", { campo: "precoUnitarioCentavos" }).ok).toBe(false);
    expect(validarAgregado("comercial", "item_revisao", { campo: "precoUnitarioCentavos" }).ok).toBe(true);
  });
  it("Financeiro não agrupa títulos por processo", () => {
    expect(validarAgregado("financeiro", "titulo_pagar", { campo: "valorCentavos", agruparPor: ["processoId"] }).ok).toBe(false);
    expect(validarAgregado("financeiro", "titulo_pagar", { campo: "valorCentavos", agruparPor: ["parceiroId"] }).ok).toBe(true);
  });
  it("exportação passa pelo serializador e é negada fora do Admin", () => {
    expect(exportarLinhas([item], "comercial", "item_revisao")).toBeNull();
    expect(exportarLinhas([ap], "financeiro", "titulo_pagar")).toBeNull();
    expect(exportarLinhas([item], "admin", "item_revisao")).toEqual([item]);
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

- [ ] **Step 2: Mapa de campos sensíveis**

`lib/dominio/sigilo/campos.ts`:

```ts
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
```

- [ ] **Step 3: Serializadores e validadores**

`lib/dominio/sigilo/serializar.ts`:

```ts
import { falha, ok, type Resultado } from "../comum";
import type { EventoAuditoria, ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import { pode } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";
import { CONTEXTO_DA_ENTIDADE, podeVerCampo, type Contexto } from "./campos";

// O campo proibido não sai do servidor. Esconder na tela não basta (spec §7.3).

export function serializar<T extends object>(registro: T, perfil: Perfil, contexto: Contexto): Partial<T> {
  return Object.fromEntries(Object.entries(registro).filter(([campo]) => podeVerCampo(perfil, contexto, campo))) as Partial<T>;
}

export const serializarItemRevisao = (item: ItemRevisao, perfil: Perfil) => serializar(item, perfil, "item_revisao");

export const serializarTituloPagar = (t: TituloPagar, perfil: Perfil) =>
  pode(perfil, "titulo_pagar.operar") ? serializar(t, perfil, "titulo_pagar") : null;

export const serializarTituloReceber = (t: TituloReceber, perfil: Perfil) =>
  pode(perfil, "titulo_receber.operar") ? serializar(t, perfil, "titulo_receber") : null;

/** Histórico visível a outros perfis sem os valores que eles não podem ver. */
export function serializarEventoAuditoria(ev: EventoAuditoria, perfil: Perfil): EventoAuditoria | null {
  if (perfil === "admin") return ev;
  if (!pode(perfil, "processo.ver")) return null;
  const contexto = CONTEXTO_DA_ENTIDADE[ev.entidade];
  if (!contexto) return { ...ev, antes: null, depois: null };
  const filtrar = (v: Record<string, unknown> | null) => (v ? serializar(v, perfil, contexto) : null);
  return { ...ev, antes: filtrar(ev.antes), depois: filtrar(ev.depois) };
}

/** Uma mensagem só, sem campo nem valor: a recusa não pode revelar o que está oculto. */
export const MENSAGEM_CONSULTA_NEGADA = "Consulta não permitida para o seu perfil.";

export function validarConsulta(
  perfil: Perfil,
  contexto: Contexto,
  q: { ordenarPor?: string; filtros?: string[]; busca?: string[] },
): Resultado<true> {
  const campos = [q.ordenarPor, ...(q.filtros ?? []), ...(q.busca ?? [])].filter((c): c is string => Boolean(c));
  return campos.every((c) => podeVerCampo(perfil, contexto, c)) ? ok(true) : falha(MENSAGEM_CONSULTA_NEGADA);
}

/** Agregado sobre campo oculto é recusado em qualquer tamanho de grupo, inclusive grupo de um item. */
export function validarAgregado(
  perfil: Perfil,
  contexto: Contexto,
  a: { campo: string; agruparPor?: string[] },
): Resultado<true> {
  const campos = [a.campo, ...(a.agruparPor ?? [])];
  return campos.every((c) => podeVerCampo(perfil, contexto, c)) ? ok(true) : falha(MENSAGEM_CONSULTA_NEGADA);
}

/** Exportação usa o mesmo serializador. `dados.exportar` é travada no Admin. */
export function exportarLinhas<T extends object>(linhas: T[], perfil: Perfil, contexto: Contexto): Partial<T>[] | null {
  if (!pode(perfil, "dados.exportar")) return null;
  return linhas.map((l) => serializar(l, perfil, contexto));
}
```

- [ ] **Step 4: Implementar `usuarios/admin.ts`**

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

- [ ] **Step 5: Rodar**

Run: `pnpm test lib/dominio/sigilo lib/dominio/usuarios`
Expected: PASS (16 + 6 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/usinagem/lib/dominio/sigilo apps/usinagem/lib/dominio/usuarios
git commit -m "feat(usinagem): sigilo por campo com bloqueio de vazamentos laterais e trava da última conta Admin"
```

### Task 4: Regras de processo, proposta e processo derivado

**Files:**
- Create: `apps/usinagem/lib/dominio/processo/regras.ts`
- Test: `apps/usinagem/lib/dominio/processo/regras.test.ts`

**Interfaces:**
- Consumes: `pode`, `Perfil`, `EstadoRevisao`, `ItemRevisao`, `Resultado`.
- Produces:
  - `type VinculosOperacionais = { pedidosFormais: number; compras: number; ordensProducao: number }`;
  - `validarCancelamento(perfil, vinculos, motivo): Resultado<true>`;
  - `type Conciliacao = { saldoEntrega: number; aceitesPendentes: number; aceitoSemNf: number; devolucoesPendentes: number }`;
  - `conciliado(c): boolean`;
  - `validarFechamento(perfil, c, justificativa?): Resultado<true>`;
  - `validarReabertura(perfil, motivo): Resultado<true>`;
  - `validarProposta(perfil, acao: "proposta.gerar_pdf" | "proposta.enviar", estado): Resultado<true>`;
  - `validarPrecificacao(perfil, itens): Resultado<true>`;
  - `prepararRevisaoDerivada(itens: ItemRevisao[]): { estado: "preco_pendente"; itens: Omit<ItemRevisao, "id" | "revisaoId">[] }`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/processo/regras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ItemRevisao } from "../contratos";
import {
  conciliado, prepararRevisaoDerivada, validarCancelamento, validarFechamento,
  validarPrecificacao, validarProposta, validarReabertura,
} from "./regras";

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

describe("fechar e reabrir processo", () => {
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
  it("só Admin reabre, com motivo", () => {
    expect(validarReabertura("comercial", "x").ok).toBe(false);
    expect(validarReabertura("admin", " ").ok).toBe(false);
    expect(validarReabertura("admin", "NF cancelada no fiscal").ok).toBe(true);
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

describe("processo derivado", () => {
  it("nasce em preco_pendente, sem preço nem custo, mantendo descrição e revisão técnica", () => {
    const origem: ItemRevisao[] = [{
      id: "i1", revisaoId: "r1", ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç",
      revisaoTecnicaId: "rt1", precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000,
    }];
    const d = prepararRevisaoDerivada(origem);
    expect(d.estado).toBe("preco_pendente");
    expect(d.itens).toEqual([{
      ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç", revisaoTecnicaId: "rt1",
      precoUnitarioCentavos: null, custoEstimadoCentavos: null,
    }]);
  });
});
```

Run: `pnpm test lib/dominio/processo/regras.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar**

`lib/dominio/processo/regras.ts`:

```ts
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
    itens: itens.map(({ id: _id, revisaoId: _rev, ...resto }) => ({
      ...resto,
      precoUnitarioCentavos: null,
      custoEstimadoCentavos: null,
    })),
  };
}
```

- [ ] **Step 3: Rodar**

Run: `pnpm test lib/dominio/processo`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/processo/regras.ts apps/usinagem/lib/dominio/processo/regras.test.ts
git commit -m "feat(usinagem): regras de cancelar, fechar, reabrir, proposta e processo derivado"
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
  - `posicaoDemanda(demanda, vinculos): { demanda; formalizado; naoFormalizado; acimaDaDemanda }`;
  - `type EventoEntrega`, `type SituacaoEntrega`, `type PosicaoEntrega`;
  - `posicaoEntrega(contratado, programado, eventos): PosicaoEntrega`;
  - `validarAceite(p, quantidade): Resultado<true>`.

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

### Task 6: Estoque, reservas e bloqueio com déficit

**Files:**
- Create: `apps/usinagem/lib/dominio/estoque/estoque.ts`
- Test: `apps/usinagem/lib/dominio/estoque/estoque.test.ts`

**Interfaces:**
- Consumes: `deduplicarPorChave`, `ehQuantidadeValida`, `Resultado`, `ok`, `falha`.
- Produces (todas puras; devolvem estado novo, nunca mutam):
  - tipos `SituacaoQualidade`, `Lote`, `MovimentoEstoque`, `Reserva` (status `ativa | comprometida_bloqueio | consumida | liberada`), `EstadoEstoque`, `PosicaoEstoque` (inclui `deficitBloqueio`);
  - `posicaoEstoque(e, produtoId, revisaoTecnicaId, compatibilidades?): PosicaoEstoque`;
  - `entradaProducao(e, { chave, lote, quantidade })`;
  - `liberarLote(e, loteId, alocacoes)`;
  - `bloquearLote(e, loteId, situacao: "quarentena" | "rejeitado")`;
  - `reliberarLote(e, loteId)`;
  - `reservar(e, nova)`;
  - `converterEmFirme(e, { reservaId, novaReservaId, pedidoItemId, quantidade })`;
  - `expedir(e, { chave, reservaId, quantidade })`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/estoque/estoque.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Resultado } from "../comum";
import {
  bloquearLote, converterEmFirme, entradaProducao, expedir, liberarLote, posicaoEstoque, reliberarLote, reservar,
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
    expect(pos(vazio)).toMatchObject({ fisicoTotal: 0, fisicoElegivel: 0, livre: 0, deficitBloqueio: 0 });
  });
});

describe("bloqueio de lote com reservas ativas", () => {
  const base = () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    return valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 5 }));
  };

  it("reservas viram comprometidas, déficit aparece, nada volta ao livre", () => {
    const e = valor(bloquearLote(base(), "L1", "quarentena"));
    expect(pos(e)).toEqual({
      fisicoTotal: 40, fisicoElegivel: 0, reservasFirmes: 0, reservasEstrategicas: 0, livre: 0, deficitBloqueio: 25,
    });
    expect(e.reservas.map((r) => r.status)).toEqual(["comprometida_bloqueio", "comprometida_bloqueio"]);
  });

  it("lote bloqueado não aceita reserva nem expedição", () => {
    const e = valor(bloquearLote(base(), "L1", "quarentena"));
    expect(reservar(e, { id: "X", loteId: "L1", tipo: "estrategica", clienteId: "C3", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
    expect(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 1 }).ok).toBe(false);
  });

  it("reliberação devolve as reservas a ativa", () => {
    const e = valor(reliberarLote(valor(bloquearLote(base(), "L1", "quarentena")), "L1"));
    expect(pos(e)).toMatchObject({ reservasFirmes: 20, reservasEstrategicas: 5, livre: 15, deficitBloqueio: 0 });
  });

  it("lote rejeitado não é reliberado: o déficit fica para o Admin decidir", () => {
    const e = valor(bloquearLote(base(), "L1", "rejeitado"));
    expect(reliberarLote(e, "L1").ok).toBe(false);
    expect(pos(e).deficitBloqueio).toBe(25);
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

const marcarReservasDoLote = (e: EstadoEstoque, loteId: string, de: StatusReserva, para: StatusReserva) =>
  e.reservas.map((r) => (r.loteId === loteId && r.status === de ? { ...r, status: para } : r));

/** Bloqueio pela qualidade: reservas ativas ficam comprometidas, nunca liberadas em silêncio. */
export function bloquearLote(
  e: EstadoEstoque,
  loteId: string,
  situacao: "quarentena" | "rejeitado",
): Resultado<EstadoEstoque> {
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
  const lote = e.lotes.find((l) => l.id === loteId);
  if (!lote || lote.situacao !== "quarentena") return falha("Só lote em quarentena pode ser reliberado.");
  return ok({
    ...e,
    lotes: e.lotes.map((l) => (l.id === loteId ? { ...l, situacao: "liberado" } : l)),
    reservas: marcarReservasDoLote(e, loteId, "comprometida_bloqueio", "ativa"),
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
Expected: PASS (15 testes).

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/estoque
git commit -m "feat(usinagem): estoque por lote, reservas, bloqueio com déficit e expedição idempotente"
```

### Task 7: Status macro do processo

**Files:**
- Create: `apps/usinagem/lib/dominio/processo/status-macro.ts`
- Test: `apps/usinagem/lib/dominio/processo/status-macro.test.ts`

**Interfaces:**
- Consumes: `SituacaoComercial`, `EstadoRevisao`.
- Produces:
  - `type StatusMacro = "cancelado" | "perdido" | "suspenso" | "fechado" | "nf_emitida" | "pronto_para_entrega" | "em_fabricacao" | "cotacao_enviada" | "cotacao_aberta"`;
  - `type EntradaStatusMacro = { situacaoComercial; estadoRevisaoVigente: EstadoRevisao | null; pedidosAtivos: number; itens: { saldoEntrega: number; reservaFirmeAtiva: number; aceitoSemNf: number }[] }`;
  - `statusMacro(e: EntradaStatusMacro): StatusMacro`.

- [ ] **Step 1: Teste que falha**

`lib/dominio/processo/status-macro.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statusMacro, type EntradaStatusMacro } from "./status-macro";

const base: EntradaStatusMacro = { situacaoComercial: "cotacao_aberta", estadoRevisaoVigente: "rascunho", pedidosAtivos: 0, itens: [] };
const item = (saldoEntrega: number, reservaFirmeAtiva: number, aceitoSemNf: number) => ({ saldoEntrega, reservaFirmeAtiva, aceitoSemNf });

describe("status macro (spec §5.2)", () => {
  it.each(["cancelado", "perdido", "suspenso"] as const)("%s fica fora das colunas", (s) => {
    expect(statusMacro({ ...base, situacaoComercial: s, pedidosAtivos: 1 })).toBe(s);
  });
  it("fechado", () => {
    expect(statusMacro({ ...base, situacaoComercial: "fechado" })).toBe("fechado");
  });
  it("NF emitida: saldo zero e toda quantidade aceita com NF", () => {
    expect(statusMacro({ ...base, situacaoComercial: "contratado", pedidosAtivos: 1, itens: [item(0, 0, 0)] })).toBe("nf_emitida");
  });
  it("saldo zero mas aceite sem NF não é NF emitida", () => {
    expect(statusMacro({ ...base, situacaoComercial: "contratado", pedidosAtivos: 1, itens: [item(0, 0, 5)] })).toBe("em_fabricacao");
  });
  it("pronto para entrega: reserva firme cobre o saldo de todos os itens com saldo", () => {
    expect(statusMacro({ ...base, situacaoComercial: "contratado", pedidosAtivos: 1, itens: [item(10, 10, 0), item(0, 0, 0)] })).toBe("pronto_para_entrega");
  });
  it("reserva parcial ainda é em fabricação", () => {
    expect(statusMacro({ ...base, situacaoComercial: "contratado", pedidosAtivos: 1, itens: [item(10, 4, 0)] })).toBe("em_fabricacao");
  });
  it("cotação enviada", () => {
    expect(statusMacro({ ...base, situacaoComercial: "cotacao_enviada", estadoRevisaoVigente: "enviada" })).toBe("cotacao_enviada");
  });
  it.each(["rascunho", "preco_pendente", "precificada"] as const)("cotação aberta com revisão %s", (estado) => {
    expect(statusMacro({ ...base, estadoRevisaoVigente: estado })).toBe("cotacao_aberta");
  });
  it("processo reaberto volta ao status calculado pelos documentos", () => {
    expect(statusMacro({ ...base, situacaoComercial: "reaberto", pedidosAtivos: 1, itens: [item(3, 0, 0)] })).toBe("em_fabricacao");
    expect(statusMacro({ ...base, situacaoComercial: "reaberto", pedidosAtivos: 1, itens: [item(0, 0, 0)] })).toBe("nf_emitida");
  });
});
```

Run: `pnpm test lib/dominio/processo/status-macro.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar**

`lib/dominio/processo/status-macro.ts`:

```ts
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

/** Calculado, nunca gravado. A primeira regra que casar vence (spec §5.2). */
export function statusMacro(e: EntradaStatusMacro): StatusMacro {
  const s = e.situacaoComercial;
  if (s === "cancelado" || s === "perdido" || s === "suspenso") return s;
  if (s === "fechado") return "fechado";
  if (e.pedidosAtivos > 0 && e.itens.length > 0) {
    if (e.itens.every((i) => i.saldoEntrega === 0 && i.aceitoSemNf === 0)) return "nf_emitida";
    const comSaldo = e.itens.filter((i) => i.saldoEntrega > 0);
    if (comSaldo.length > 0 && comSaldo.every((i) => i.reservaFirmeAtiva >= i.saldoEntrega)) return "pronto_para_entrega";
  }
  if (e.pedidosAtivos > 0) return "em_fabricacao";
  if (e.estadoRevisaoVigente === "enviada") return "cotacao_enviada";
  return "cotacao_aberta";
}
```

- [ ] **Step 3: Rodar**

Run: `pnpm test lib/dominio/processo`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/lib/dominio/processo/status-macro.ts apps/usinagem/lib/dominio/processo/status-macro.test.ts
git commit -m "feat(usinagem): status macro do processo derivado dos três eixos"
```

### Task 8: Os 4 cenários da V2.3 de ponta a ponta

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
      fisicoTotal: 35, fisicoElegivel: 35, reservasFirmes: 0, reservasEstrategicas: 15, livre: 20, deficitBloqueio: 0,
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

### Task 9: Gate de dev, wrapper de permissão, cobertura de ações e seed de permissões

**Files:**
- Create: `apps/usinagem/lib/dominio/permissoes/acesso.ts`
- Test: `apps/usinagem/lib/dominio/permissoes/acesso.test.ts`
- Create: `apps/usinagem/lib/dominio/seguranca/dev.ts`
- Test: `apps/usinagem/lib/dominio/seguranca/dev.test.ts`
- Create: `apps/usinagem/lib/servidor/sessao-dev.ts`
- Create: `apps/usinagem/lib/servidor/sessao.ts`
- Create: `apps/usinagem/lib/servidor/acao.ts`
- Create: `apps/usinagem/scripts/cobertura-acoes.ts`
- Test: `apps/usinagem/scripts/cobertura-acoes.test.ts`
- Modify: `apps/usinagem/scripts/seed.ts` (função `semear`)
- Modify: `apps/usinagem/scripts/seed.test.ts`

**Interfaces:**
- Consumes: `pode`, `PERMISSOES`, `MATRIZ_PADRAO`, `db()` (1A).
- Produces:
  - `type UsuarioSessao = { id: string; nome: string; perfil: Perfil }`;
  - `decidirAcesso(usuario, permissao, concedidas): "permitido" | "nao_autenticado" | "negado"`;
  - `seletorDevAtivo(env: { NODE_ENV?: string; ENABLE_DEV_SWITCHER?: string }): boolean`;
  - `COOKIE_USUARIO_DEV` (só em `sessao-dev.ts`) e `usuarioDev(): Promise<UsuarioSessao | null>`;
  - `class ErroPermissao extends Error { status: 401 | 403 }`;
  - `usuarioAtual(): Promise<UsuarioSessao | null>`;
  - `requirePermissao(p: Permissao): Promise<UsuarioSessao>`;
  - `type RespostaAcao<T>`;
  - `acao(permissao, esquema, fn)`, `acaoPublica(esquema, fn)` e `rota(permissao, handler)`;
  - `violacoes(caminho: string, codigo: string): string[]`;
  - `ROTAS_ISENTAS: readonly string[]` (o 1D acrescenta a rota do Better Auth).

- [ ] **Step 1: Testes puros que falham**

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

`lib/dominio/seguranca/dev.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seletorDevAtivo } from "./dev";

describe("gate do seletor de dev", () => {
  it("só abre com development + ENABLE_DEV_SWITCHER=1", () => {
    expect(seletorDevAtivo({ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "1" })).toBe(true);
  });
  it.each([
    [{ NODE_ENV: "production", ENABLE_DEV_SWITCHER: "1" }],
    [{ NODE_ENV: "test", ENABLE_DEV_SWITCHER: "1" }],
    [{ NODE_ENV: "development" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "true" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "0" }],
    [{ ENABLE_DEV_SWITCHER: "1" }],
    [{}],
  ])("falha fechado em %j", (env) => {
    expect(seletorDevAtivo(env)).toBe(false);
  });
});
```

`scripts/cobertura-acoes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { arquivosVerificados, violacoes } from "./cobertura-acoes";

describe("cobertura do wrapper de permissão", () => {
  it("aceita ações via acao/acaoPublica e tipos", () => {
    const codigo = `"use server";\nimport { acao } from "@/lib/servidor/acao";\nexport type X = number;\nexport const salvar = acao("processo.editar", esquema, async () => 1);\nexport const entrar = acaoPublica(esquema, async () => 1);`;
    expect(violacoes("app/x/actions.ts", codigo)).toEqual([]);
  });
  it("recusa função exportada direto num arquivo use server", () => {
    expect(violacoes("app/x/actions.ts", `"use server";\nexport async function salvar() {}`)).toHaveLength(1);
    expect(violacoes("app/x/actions.ts", `'use server'\nexport const salvar = async () => {}`)).toHaveLength(1);
    expect(violacoes("app/x/actions.ts", `"use server";\nexport default async function x() {}`)).toHaveLength(1);
  });
  it("recusa use server inline (ação dentro de componente)", () => {
    expect(violacoes("app/x/page.tsx", `export default function P() { async function f() { "use server"; } }`)).toHaveLength(1);
  });
  it("route.ts precisa exportar métodos via rota()", () => {
    expect(violacoes("app/api/x/route.ts", `export const GET = rota("processo.ver", async () => new Response())`)).toEqual([]);
    expect(violacoes("app/api/x/route.ts", `export async function GET() {}`)).toHaveLength(1);
  });
  it("o código real do app não tem violação", () => {
    const todas = arquivosVerificados().flatMap(({ caminho, codigo }) => violacoes(caminho, codigo));
    expect(todas).toEqual([]);
  });
});
```

Run: `cd apps/usinagem && pnpm test lib/dominio/permissoes/acesso.test.ts lib/dominio/seguranca scripts/cobertura-acoes.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 2: Implementar as partes puras**

`lib/dominio/permissoes/acesso.ts`:

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

`lib/dominio/seguranca/dev.ts`:

```ts
/** Seletor de perfil de dev: as duas condições juntas, em valor exato. Qualquer outra combinação fecha. */
export const seletorDevAtivo = (env: { NODE_ENV?: string; ENABLE_DEV_SWITCHER?: string }): boolean =>
  env.NODE_ENV === "development" && env.ENABLE_DEV_SWITCHER === "1";
```

`scripts/cobertura-acoes.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Rotas que não passam pelo wrapper, com motivo. O 1D acrescenta a do Better Auth. */
export const ROTAS_ISENTAS: readonly string[] = [];

const DIRETIVA_NO_TOPO = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use server["']/;
const ACAO_OK = /^export const \w+ = (?:acao|acaoPublica)\(/;
const ROTA_OK = /^export const (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) = rota\(/;
// Configuração de segmento não é handler.
const CONFIG_ROTA = /^export const (?:dynamic|revalidate|runtime|preferredRegion|maxDuration) = /;

export function violacoes(caminho: string, codigo: string): string[] {
  const erros: string[] = [];
  const exports = codigo.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("export ") && !l.startsWith("export type "));
  const topo = DIRETIVA_NO_TOPO.test(codigo);
  if (topo) {
    for (const l of exports) if (!ACAO_OK.test(l)) erros.push(`${caminho}: export fora de acao(): ${l}`);
  }
  const ocorrencias = codigo.match(/["']use server["']/g)?.length ?? 0;
  if (ocorrencias > (topo ? 1 : 0)) erros.push(`${caminho}: "use server" inline não é permitido; use um arquivo de ações com acao().`);
  if (/(^|\/)route\.tsx?$/.test(caminho) && !ROTAS_ISENTAS.includes(caminho)) {
    for (const l of exports) if (!ROTA_OK.test(l) && !CONFIG_ROTA.test(l)) erros.push(`${caminho}: handler fora de rota(): ${l}`);
  }
  return erros;
}

const DIRETORIOS = ["app", "lib", "components"];
const EXTENSAO = /\.tsx?$/;

export function arquivosVerificados(raiz = process.cwd()): { caminho: string; codigo: string }[] {
  return DIRETORIOS.flatMap((d) => {
    let nomes: string[];
    try {
      nomes = readdirSync(join(raiz, d), { recursive: true }) as string[];
    } catch {
      return [];
    }
    return nomes
      .filter((n) => EXTENSAO.test(n) && !n.endsWith(".test.ts"))
      .map((n) => {
        const abs = join(raiz, d, n);
        return { caminho: relative(raiz, abs), codigo: readFileSync(abs, "utf8") };
      });
  });
}
```

Run: `pnpm test lib/dominio/permissoes/acesso.test.ts lib/dominio/seguranca scripts/cobertura-acoes.test.ts`
Expected: PASS. A cobertura real passa porque ainda não existe nenhuma ação.

- [ ] **Step 3: Ler a doc do Next antes do código de servidor**

Ler em `apps/usinagem/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`: `cookies.md` (assíncrono no Next 16) e `unstable_rethrow.md` (não engolir `redirect`/`notFound` no `catch`).

- [ ] **Step 4: Instalar Zod**

```bash
pnpm --filter usinagem add zod@4.6.7
```

- [ ] **Step 5: Sessão de dev isolada**

`lib/servidor/sessao-dev.ts`. Só é carregado por `import()` atrás do gate. No build de produção o ramo é eliminado, e o nome do cookie não entra no bundle (o PR 1D testa isso):

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Perfil } from "../dominio/permissoes/perfis";
import { db } from "./db";
import { usuarios } from "./db/schema";

export const COOKIE_USUARIO_DEV = "usinagem_dev_usuario";

/** Só usuários fictícios e ativos. Usuário real nunca entra pelo seletor de dev. */
export async function usuarioDev(): Promise<UsuarioSessao | null> {
  const id = (await cookies()).get(COOKIE_USUARIO_DEV)?.value;
  if (!id) return null;
  const [u] = await db()
    .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.ativo, true), eq(usuarios.ficticio, true)));
  return u ? { ...u, perfil: u.perfil as Perfil } : null;
}
```

- [ ] **Step 6: Sessão e `requirePermissao`**

`lib/servidor/sessao.ts`:

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { decidirAcesso, type UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { seletorDevAtivo } from "../dominio/seguranca/dev";
import { db } from "./db";
import { perfilPermissoes } from "./db/schema";

export class ErroPermissao extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Sessão ausente." : "Sem permissão para esta ação.");
  }
}

// Até o PR 1D (Better Auth) só existe a sessão de dev; fora do gate, ninguém entra.
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  // `process.env.NODE_ENV` literal: o Next substitui no build e elimina o ramo em produção.
  if (process.env.NODE_ENV === "development" && seletorDevAtivo(process.env)) {
    const { usuarioDev } = await import("./sessao-dev");
    return usuarioDev();
  }
  return null;
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

- [ ] **Step 7: Wrapper deny by default**

`lib/servidor/acao.ts`:

```ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import type { UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { ErroPermissao, requirePermissao } from "./sessao";

export type RespostaAcao<T> = { ok: true; dados: T } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível concluir a operação.";

async function executar<E, S>(esquema: ZodType<E>, entrada: unknown, fn: (e: E) => Promise<S>): Promise<RespostaAcao<S>> {
  const valida = esquema.safeParse(entrada);
  if (!valida.success) return { ok: false, erro: "Dados inválidos." };
  try {
    return { ok: true, dados: await fn(valida.data) };
  } catch (erro) {
    unstable_rethrow(erro);
    // Detalhe só no log do servidor; o cliente recebe mensagem genérica.
    console.error(erro);
    return { ok: false, erro: ERRO_GENERICO };
  }
}

/** Server Action com permissão obrigatória. Sem permissão declarada não existe ação (deny by default). */
export function acao<E, S>(permissao: Permissao, esquema: ZodType<E>, fn: (entrada: E, usuario: UsuarioSessao) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => {
    let usuario: UsuarioSessao;
    try {
      usuario = await requirePermissao(permissao);
    } catch (erro) {
      if (erro instanceof ErroPermissao) return { ok: false, erro: erro.message };
      throw erro;
    }
    return executar(esquema, entrada, (e) => fn(e, usuario));
  };
}

/** Só para ações sem sessão por natureza (login). Cada uso é revisado; o teste de cobertura lista onde aparece. */
export function acaoPublica<E, S>(esquema: ZodType<E>, fn: (entrada: E) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => executar(esquema, entrada, fn);
}

/** Route Handler com permissão obrigatória. */
export function rota(permissao: Permissao, handler: (req: Request, usuario: UsuarioSessao) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      const usuario = await requirePermissao(permissao);
      return await handler(req, usuario);
    } catch (erro) {
      unstable_rethrow(erro);
      if (erro instanceof ErroPermissao) return Response.json({ erro: erro.message }, { status: erro.status });
      console.error(erro);
      return Response.json({ erro: ERRO_GENERICO }, { status: 500 });
    }
  };
}
```

- [ ] **Step 8: Seed de permissões**

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

Em `scripts/seed.test.ts`, no fim do primeiro `it`:

```ts
    const [perm] = await banco.select({ n: count() }).from(schema.permissoes);
    expect(perm.n).toBe(54);
    const travadasConcedidas = await banco
      .select()
      .from(schema.perfilPermissoes)
      .innerJoin(schema.permissoes, eq(schema.perfilPermissoes.permissao, schema.permissoes.codigo))
      .where(eq(schema.permissoes.travadaAdmin, true));
    expect(travadasConcedidas).toEqual([]);
```

- [ ] **Step 9: Rodar tudo**

Run: `cd apps/usinagem && pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm db:seed`
Expected: todos os testes PASS (inclusive os de banco), typecheck, lint e build limpos, `Seed fictício aplicado.`

- [ ] **Step 10: Commit**

```bash
git add apps/usinagem/package.json pnpm-lock.yaml apps/usinagem/lib/dominio/permissoes/acesso.ts apps/usinagem/lib/dominio/permissoes/acesso.test.ts apps/usinagem/lib/dominio/seguranca apps/usinagem/lib/servidor/sessao.ts apps/usinagem/lib/servidor/sessao-dev.ts apps/usinagem/lib/servidor/acao.ts apps/usinagem/scripts/cobertura-acoes.ts apps/usinagem/scripts/cobertura-acoes.test.ts apps/usinagem/scripts/seed.ts apps/usinagem/scripts/seed.test.ts
git commit -m "feat(usinagem): wrapper de permissão deny by default, gate de dev e seed da matriz RBAC"
```
