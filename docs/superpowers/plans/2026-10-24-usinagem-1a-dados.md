# Usinagem 1A: dados locais, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postgres 16 local em Docker, Drizzle com schema de núcleo e processo, seed fictício idempotente, Vitest e CI do GitHub Actions para o `apps/usinagem`.

**Architecture:** Schema Drizzle único em `lib/servidor/db/schema.ts`. Conexão lazy em `lib/servidor/db/index.ts` (`server-only`), com guarda pura que só aceita host local. Seed é função exportada `semear(db)` com UUIDs fixos e `onConflictDoNothing`, chamada por script e testada por Vitest contra o banco local ou o serviço do CI.

**Tech Stack:** Postgres 16 (imagem `postgres:16-alpine`), drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, vitest 5.0.5, Node 22 (`process.loadEnvFile`, `--env-file`), pnpm 9.15.9.

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4.1, §4.2, §8, §9.1 item 1A)

## Global Constraints

- Migrations em `apps/usinagem/drizzle/` são geradas e aplicadas pelo HUMANO (`pnpm db:generate`, `pnpm db:migrate`). Agente nunca cria, edita nem aplica migration.
- Nenhuma conexão com banco remoto. Host aceito: `localhost` ou `127.0.0.1`.
- Nenhuma credencial no repositório. `.env.local` é criado à mão pelo humano (o app ignora `.env*`).
- Dinheiro em centavos `bigint({ mode: "number" })`. Quantidade `integer`.
- Dados do seed marcados: coluna `ficticio = true` e nomes com prefixo `[FICTÍCIO]`.
- Ler `node_modules/next/dist/docs/` antes de código que toca Next.
- Sem push.

---

### Task 1: Dependências, Docker Compose e Vitest

**Files:**
- Modify: `apps/usinagem/package.json`
- Create: `apps/usinagem/compose.yaml`
- Create: `apps/usinagem/vitest.config.ts`
- Create: `apps/usinagem/lib/servidor/db/url-local.ts`
- Test: `apps/usinagem/lib/servidor/db/url-local.test.ts`

**Interfaces:**
- Produces: `urlLocal(url: string | undefined): string` (lança `Error` se ausente ou host não local); scripts `db:up`, `db:down`, `db:generate`, `db:migrate`, `db:seed`, `test`.

- [ ] **Step 1: Instalar dependências**

```bash
pnpm --filter usinagem add drizzle-orm@0.45.4 pg@8.23.1 server-only@0.0.1
pnpm --filter usinagem add -D drizzle-kit@0.31.11 @types/pg@8.23.1 vitest@5.0.5 tsx@4.23.15
```

- [ ] **Step 2: Scripts no `package.json`**

`scripts` passa a ser:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "db:up": "docker compose --env-file .env.local up -d --wait",
    "db:down": "docker compose --env-file .env.local down",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "node --env-file=.env.local --import tsx scripts/seed.ts"
  },
```

- [ ] **Step 3: `compose.yaml`**

```yaml
# Postgres local de desenvolvimento do ERP Express. Nunca usar em produção.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: usinagem
      POSTGRES_USER: usinagem
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env.local}
    ports:
      - "127.0.0.1:54329:5432"
    volumes:
      - usinagem_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U usinagem -d usinagem"]
      interval: 2s
      timeout: 3s
      retries: 20
volumes:
  usinagem_pg:
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

// Carrega DATABASE_URL local para os testes de integração; ausente = testes de banco pulados.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Teste que falha para `urlLocal`**

`lib/servidor/db/url-local.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { urlLocal } from "./url-local";

describe("urlLocal", () => {
  it("aceita localhost e 127.0.0.1", () => {
    expect(urlLocal("postgres://u:p@localhost:54329/usinagem")).toContain("localhost");
    expect(urlLocal("postgres://u:p@127.0.0.1:5432/usinagem")).toContain("127.0.0.1");
  });
  it("recusa host remoto", () => {
    expect(() => urlLocal("postgres://u:p@db.exemplo.com:5432/x")).toThrow("Postgres local");
  });
  it("recusa ausente", () => {
    expect(() => urlLocal(undefined)).toThrow("DATABASE_URL");
  });
});
```

Run: `cd apps/usinagem && pnpm test`
Expected: FAIL, módulo `./url-local` não existe.

- [ ] **Step 6: Implementar**

`lib/servidor/db/url-local.ts`:

```ts
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

// Guarda contra conexão acidental com banco real: o ERP só fala com Postgres local nesta fase.
export function urlLocal(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL não definida.");
  if (!HOSTS_LOCAIS.has(new URL(url).hostname)) {
    throw new Error("DATABASE_URL precisa apontar para o Postgres local.");
  }
  return url;
}
```

Run: `pnpm test`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add apps/usinagem/package.json apps/usinagem/compose.yaml apps/usinagem/vitest.config.ts apps/usinagem/lib/servidor/db/url-local.ts apps/usinagem/lib/servidor/db/url-local.test.ts pnpm-lock.yaml
git commit -m "feat(usinagem): Postgres local em Docker, Vitest e guarda de host local"
```

### Task 2: Schema de núcleo e processo, config do drizzle-kit e conexão

**Files:**
- Create: `apps/usinagem/lib/dominio/permissoes/perfis.ts`
- Create: `apps/usinagem/lib/servidor/db/schema.ts`
- Create: `apps/usinagem/lib/servidor/db/index.ts`
- Create: `apps/usinagem/drizzle.config.ts`

**Interfaces:**
- Consumes: `urlLocal` (Task 1).
- Produces:
  - `PERFIS` (`readonly ["admin","comercial","compras_producao","financeiro","tecnico"]`), `type Perfil`, `NOME_PERFIL: Record<Perfil, string>`;
  - tabelas `perfis`, `permissoes`, `perfilPermissoes`, `usuarios`, `eventosAuditoria`, `configuracoes`, `clientes`, `processos`, `revisoesComerciais`, `itensRevisao`;
  - `ESTADOS_REVISAO`, `SITUACOES_COMERCIAIS`;
  - `db(): NodePgDatabase<typeof schema>` (lazy, `server-only`).

- [ ] **Step 1: Perfis**

`lib/dominio/permissoes/perfis.ts`:

```ts
export const PERFIS = ["admin", "comercial", "compras_producao", "financeiro", "tecnico"] as const;
export type Perfil = (typeof PERFIS)[number];

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: "Admin",
  comercial: "Comercial",
  compras_producao: "Compras/Produção",
  financeiro: "Financeiro",
  tecnico: "Desenhista/Técnico",
};
```

- [ ] **Step 2: Schema**

`lib/servidor/db/schema.ts`:

```ts
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

export const SITUACOES_COMERCIAIS = [
  "cotacao_aberta",
  "cotacao_enviada",
  "aprovado",
  "parcialmente_contratado",
  "contratado",
  "perdido",
  "cancelado",
  "suspenso",
  "fechado",
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
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

// Só recebe INSERT: a camada de serviço nunca atualiza nem apaga eventos.
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
  atualizadoEm: atualizadoEm(),
});

// ── Comercial e processos ───────────────────────────────
export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj").unique(),
  ficticio: boolean("ficticio").notNull().default(false),
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
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("itens_revisao_ordem_uq").on(t.revisaoId, t.ordem),
    check("itens_quantidade_check", sql`${t.quantidade} > 0`),
    check("itens_preco_check", sql`${t.precoUnitarioCentavos} is null or ${t.precoUnitarioCentavos} >= 0`),
  ],
);
```

- [ ] **Step 3: Conexão lazy**

`lib/servidor/db/index.ts`:

```ts
import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { urlLocal } from "./url-local";

let instancia: NodePgDatabase<typeof schema> | undefined;

// Lazy: `next build` importa o módulo sem DATABASE_URL; a conexão só nasce no primeiro uso.
export function db(): NodePgDatabase<typeof schema> {
  instancia ??= drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  return instancia;
}
```

- [ ] **Step 4: `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";
import { urlLocal } from "./lib/servidor/db/url-local";

try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/servidor/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: urlLocal(process.env.DATABASE_URL) },
});
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `cd apps/usinagem && pnpm typecheck && pnpm lint && pnpm build`
Expected: código 0 nos três.

- [ ] **Step 6: Commit**

```bash
git add apps/usinagem/lib/dominio/permissoes/perfis.ts apps/usinagem/lib/servidor/db/schema.ts apps/usinagem/lib/servidor/db/index.ts apps/usinagem/drizzle.config.ts
git commit -m "feat(usinagem): schema Drizzle de núcleo e processo"
```

- [ ] **Step 7: HUMANO gera e aplica a migration local**

O agente para e pede ao humano:

```bash
cd apps/usinagem
# .env.local criado à mão com POSTGRES_PASSWORD e
# DATABASE_URL=postgres://usinagem:<senha>@127.0.0.1:54329/usinagem
pnpm db:up
pnpm db:generate --name nucleo_processo
pnpm db:migrate
git add drizzle && git commit -m "feat(usinagem): migration inicial de núcleo e processo"
```

O agente continua só depois da confirmação.

### Task 3: Seed fictício idempotente

**Files:**
- Create: `apps/usinagem/scripts/seed.ts`
- Test: `apps/usinagem/scripts/seed.test.ts`

**Interfaces:**
- Consumes: schema (Task 2), `PERFIS`, `NOME_PERFIL`, `urlLocal`.
- Produces: `semear(banco: NodePgDatabase<typeof schema>): Promise<void>`; `USUARIOS_FICTICIOS: { id: string; perfil: Perfil; nome: string }[]` (um por perfil, ids fixos). Na 1B, o seletor de perfil de dev e o seed de permissões usam esses ids.

- [ ] **Step 1: Teste que falha**

`scripts/seed.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { semear } from "./seed";

const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("seed fictício", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  it("é idempotente e marca tudo como fictício", async () => {
    await semear(banco);
    await semear(banco);
    const [u] = await banco.select({ n: count() }).from(schema.usuarios);
    const [p] = await banco.select({ n: count() }).from(schema.perfis);
    expect(p.n).toBe(5);
    expect(u.n).toBe(5);
    const naoFicticios = (await banco.select().from(schema.usuarios)).filter((x) => !x.ficticio);
    expect(naoFicticios).toEqual([]);
  });
});
```

Run: `cd apps/usinagem && pnpm test scripts/seed.test.ts`
Expected: FAIL, módulo `./seed` não existe.

- [ ] **Step 2: Implementar**

`scripts/seed.ts`:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { NOME_PERFIL, PERFIS, type Perfil } from "../lib/dominio/permissoes/perfis";

// Todos os dados abaixo são FICTÍCIOS. Nenhum nome, CNPJ ou e-mail real.
export const USUARIOS_FICTICIOS: { id: string; perfil: Perfil; nome: string }[] = [
  { id: "00000000-0000-4000-8000-000000000001", perfil: "admin", nome: "[FICTÍCIO] Admin Teste" },
  { id: "00000000-0000-4000-8000-000000000002", perfil: "comercial", nome: "[FICTÍCIO] Comercial Teste" },
  { id: "00000000-0000-4000-8000-000000000003", perfil: "compras_producao", nome: "[FICTÍCIO] Compras Teste" },
  { id: "00000000-0000-4000-8000-000000000004", perfil: "financeiro", nome: "[FICTÍCIO] Financeiro Teste" },
  { id: "00000000-0000-4000-8000-000000000005", perfil: "tecnico", nome: "[FICTÍCIO] Técnico Teste" },
];

const CLIENTES = [
  { id: "00000000-0000-4000-8000-000000000101", razaoSocial: "[FICTÍCIO] Metalúrgica Alfa Ltda" },
  { id: "00000000-0000-4000-8000-000000000102", razaoSocial: "[FICTÍCIO] Indústria Beta S.A." },
];

const ADMIN = USUARIOS_FICTICIOS[0].id;
const COMERCIAL = USUARIOS_FICTICIOS[1].id;

const PROCESSOS = [
  { id: "00000000-0000-4000-8000-000000000201", numero: 9001, letra: "A", clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Polia dentada 40 dentes", situacaoComercial: "cotacao_aberta" },
  { id: "00000000-0000-4000-8000-000000000202", numero: 9002, letra: "B", clienteId: CLIENTES[1].id, titulo: "[FICTÍCIO] Eixo retificado", situacaoComercial: "cotacao_enviada" },
  { id: "00000000-0000-4000-8000-000000000203", numero: 9003, letra: "A", clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Flange usinado", situacaoComercial: "aprovado" },
];

const REVISOES = [
  { id: "00000000-0000-4000-8000-000000000301", processoId: PROCESSOS[0].id, letra: "A", estado: "preco_pendente", criadoPor: COMERCIAL },
  { id: "00000000-0000-4000-8000-000000000302", processoId: PROCESSOS[1].id, letra: "B", estado: "enviada", criadoPor: COMERCIAL, precificadaPor: ADMIN },
  { id: "00000000-0000-4000-8000-000000000303", processoId: PROCESSOS[2].id, letra: "A", estado: "aprovada", criadoPor: COMERCIAL, precificadaPor: ADMIN, aprovadaPor: COMERCIAL },
];

const ITENS = [
  { id: "00000000-0000-4000-8000-000000000401", revisaoId: REVISOES[0].id, ordem: 1, descricao: "[FICTÍCIO] Polia dentada aço 1045", quantidade: 20, precoUnitarioCentavos: null },
  { id: "00000000-0000-4000-8000-000000000402", revisaoId: REVISOES[1].id, ordem: 1, descricao: "[FICTÍCIO] Eixo Ø40 x 300", quantidade: 10, precoUnitarioCentavos: 18_500 },
  { id: "00000000-0000-4000-8000-000000000403", revisaoId: REVISOES[2].id, ordem: 1, descricao: "[FICTÍCIO] Flange DN100", quantidade: 40, precoUnitarioCentavos: 9_990 },
];

export async function semear(banco: NodePgDatabase<typeof schema>): Promise<void> {
  await banco.transaction(async (tx) => {
    await tx.insert(schema.perfis).values(PERFIS.map((id) => ({ id, nome: NOME_PERFIL[id] }))).onConflictDoNothing();
    await tx
      .insert(schema.usuarios)
      .values(USUARIOS_FICTICIOS.map((u) => ({ id: u.id, nome: u.nome, email: `${u.perfil}@ficticio.invalid`, perfilId: u.perfil, ficticio: true })))
      .onConflictDoNothing();
    await tx.insert(schema.clientes).values(CLIENTES.map((c) => ({ ...c, ficticio: true }))).onConflictDoNothing();
    await tx.insert(schema.processos).values(PROCESSOS.map((p) => ({ ...p, criadoPor: COMERCIAL, ficticio: true }))).onConflictDoNothing();
    await tx.insert(schema.revisoesComerciais).values(REVISOES).onConflictDoNothing();
    await tx.insert(schema.itensRevisao).values(ITENS).onConflictDoNothing();
    await tx
      .insert(schema.configuracoes)
      .values({ chave: "numeracao", valor: { proximoNumero: 9004, formato: "{numero}-{letra}" } })
      .onConflictDoNothing();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const banco = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  semear(banco)
    .then(() => console.log("Seed fictício aplicado."))
    .finally(() => banco.$client.end());
}
```

- [ ] **Step 3: Rodar contra o banco local**

Run: `cd apps/usinagem && pnpm test && pnpm db:seed`
Expected: testes PASS (o de seed roda porque `.env.local` tem `DATABASE_URL`); `Seed fictício aplicado.`

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/scripts/seed.ts apps/usinagem/scripts/seed.test.ts
git commit -m "feat(usinagem): seed fictício idempotente"
```

### Task 4: CI do GitHub Actions

**Files:**
- Create: `.github/workflows/usinagem.yml`

**Interfaces:**
- Consumes: scripts `typecheck`, `lint`, `test`, `db:migrate`; migration commitada pelo humano (Task 2, Step 7).

- [ ] **Step 1: Workflow**

```yaml
name: usinagem

on:
  pull_request:
    paths:
      - "apps/usinagem/**"
      - ".github/workflows/usinagem.yml"
      - "pnpm-lock.yaml"
  push:
    branches: [feat/usinagem-fundacao]
    paths:
      - "apps/usinagem/**"
      - ".github/workflows/usinagem.yml"

permissions:
  contents: read

jobs:
  verificar:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: usinagem
          POSTGRES_USER: usinagem
          # Senha descartável do container efêmero do CI, sem valor fora dele.
          POSTGRES_PASSWORD: ci_descartavel
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U usinagem -d usinagem"
          --health-interval 2s --health-timeout 3s --health-retries 20
    env:
      DATABASE_URL: postgres://usinagem:ci_descartavel@localhost:5432/usinagem
    defaults:
      run:
        working-directory: apps/usinagem
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile --filter usinagem...
        working-directory: .
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm db:migrate
      - run: pnpm test
```

`pnpm/action-setup@v4` lê a versão do campo `packageManager` da raiz (9.15.9).

- [ ] **Step 2: Validar sintaxe localmente**

Run: `node -e "require('fs').readFileSync('.github/workflows/usinagem.yml','utf8')" && pnpm dlx @action-validator/cli@0.6.0 .github/workflows/usinagem.yml`
Expected: sem erro. (Validação real só no primeiro push, que depende de confirmação do humano.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/usinagem.yml
git commit -m "ci(usinagem): typecheck, lint e Vitest com Postgres de serviço"
```
