# Usinagem 1A: dados locais, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postgres 16 local em Docker com roles de migração e de aplicação, Drizzle com schema de núcleo e processo (com `versao`), numeração atômica, seed fictício idempotente, Vitest e CI do GitHub Actions para o `apps/usinagem`.

**Architecture:**
- Schema Drizzle único em `lib/servidor/db/schema.ts`.
- O `drizzle-kit` usa a role de migração (`DATABASE_URL_MIGRACAO`); o app, o seed e os testes usam a role da aplicação (`DATABASE_URL`).
- As duas URLs passam pela guarda pura `urlLocal`, que só aceita host local.
- A conexão do app é lazy em `lib/servidor/db/index.ts` (`server-only`).
- Numeração por `UPDATE ... RETURNING` atômico.
- O seed é a função `semear(db)`, com UUIDs fixos e `onConflictDoNothing`.

**Tech Stack:** Postgres 16 (`postgres:16-alpine`), drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, vitest 5.0.5, tsx 4.23.15, Node 22 (`process.loadEnvFile`, `--env-file`), pnpm 9.15.9.

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4 convenções, §4.1, §4.2, §6.7, §6.8, §8, §9.1 item 1A, §10 "Dados")

## Global Constraints

- Migrations em `apps/usinagem/drizzle/` são geradas e aplicadas pelo HUMANO (`pnpm db:generate`, `pnpm db:migrate`), sempre com a role de migração. Agente nunca cria, edita nem aplica migration.
- App, seed e testes usam só a role da aplicação.
- `usinagem_migracao` é dona de todas as tabelas (o `drizzle-kit migrate` roda com ela); `usinagem_app` não é dona de nenhuma e não tem `CREATE` no schema. Teste em `pg_tables.tableowner`.
- Tabelas append-only (`eventos_auditoria`, `movimentos_estoque`, `baixas`): `usinagem_app` sem `UPDATE`, `DELETE` e `TRUNCATE`. Correção de estoque ou de baixa é um novo registro de estorno, nunca `UPDATE`.
- Nenhuma conexão com banco remoto. Host aceito: `localhost` ou `127.0.0.1`.
- Nenhuma credencial no repositório, exceto as senhas descartáveis do CI. Elas têm valor claramente de teste (`ci_*_descartavel`) e devem ser diferentes das senhas locais.
- `.env.local` é criado à mão pelo humano (o app ignora `.env*`).
- Dinheiro em centavos `bigint({ mode: "number" })`. Quantidade de peça `integer`. Datas `timestamp({ withTimezone: true })`.
- Tabela editável tem `versao integer not null default 1`.
- Dados do seed marcados: `ficticio = true` e prefixo `[FICTÍCIO]`.
- Sem push.

---

### Task 1: Dependências, Docker com roles e Vitest

**Files:**
- Modify: `apps/usinagem/package.json`
- Create: `apps/usinagem/compose.yaml`
- Create: `apps/usinagem/db/init/01-roles.sh` (modo 755)
- Create: `apps/usinagem/vitest.config.mts` (criado como `.ts` e renomeado no fix round 2)
- Create: `apps/usinagem/lib/servidor/db/url-local.ts`
- Test: `apps/usinagem/lib/servidor/db/url-local.test.ts`
- Create (fix round 2): `apps/usinagem/lib/servidor/db/teste-banco.ts` e `teste-banco.test.ts`

Executado (commits `1b95873`, `7e1c61b`, `c55dbab`). Mudanças pedidas na revisão e incorporadas:
- healthcheck por TCP (`pg_isready -h 127.0.0.1`);
- `urlLocal` com mensagem genérica sem `cause` para URL malformada, allowlist de query (`sslmode`, `application_name`) e testes adversariais de host. O `pg` deixa `?host=` sobrescrever o host da URL, e é por isso que existe a allowlist;
- `bancoDisponivel()`: no CI, sem `DATABASE_URL`, falha; fora do CI, pula com aviso;
- `@types/node` 22.20.5 com pino exato.

**Interfaces:**
- Produces:
  - `urlLocal(url: string | undefined): string` (lança `Error` se ausente ou não local);
  - roles `usinagem_migracao` e `usinagem_app`;
  - scripts `db:up`, `db:down`, `db:generate`, `db:migrate`, `db:seed`, `test`.

- [ ] **Step 1: Instalar dependências**

```bash
pnpm --filter usinagem add drizzle-orm@0.45.4 pg@8.23.1 server-only@0.0.1
pnpm --filter usinagem add -D drizzle-kit@0.31.11 @types/pg@8.23.1 vitest@5.0.5 tsx@4.23.15
```

- [ ] **Step 2: Scripts no `package.json`**

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

- [ ] **Step 3: Script de roles**

`db/init/01-roles.sh`. Roda uma vez no primeiro `db:up` (entrypoint do Postgres) e no CI:

```bash
#!/usr/bin/env bash
# Cria as duas roles do ERP: migração (DDL) e aplicação (só DML). Sem senha no código.
set -euo pipefail
: "${MIGRACAO_DB_PASSWORD:?defina MIGRACAO_DB_PASSWORD}"
: "${APP_DB_PASSWORD:?defina APP_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" -v mig_pw="$MIGRACAO_DB_PASSWORD" -v app_pw="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE usinagem_migracao LOGIN PASSWORD :'mig_pw';
CREATE ROLE usinagem_app LOGIN PASSWORD :'app_pw';
GRANT CONNECT, CREATE ON DATABASE :"db" TO usinagem_migracao;
GRANT CONNECT ON DATABASE :"db" TO usinagem_app;
GRANT USAGE, CREATE ON SCHEMA public TO usinagem_migracao;
GRANT USAGE ON SCHEMA public TO usinagem_app;
-- Tudo que a role de migração criar fica acessível à aplicação só por DML.
-- Tabelas de log revogam UPDATE/DELETE na própria migration (ver Task 2, Step 7).
ALTER DEFAULT PRIVILEGES FOR ROLE usinagem_migracao IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO usinagem_app;
ALTER DEFAULT PRIVILEGES FOR ROLE usinagem_migracao IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO usinagem_app;
SQL
```

- [ ] **Step 4: `compose.yaml`**

```yaml
# Postgres local de desenvolvimento do ERP Express. Nunca usar em produção.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: usinagem
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env.local}
      MIGRACAO_DB_PASSWORD: ${MIGRACAO_DB_PASSWORD:?defina MIGRACAO_DB_PASSWORD no .env.local}
      APP_DB_PASSWORD: ${APP_DB_PASSWORD:?defina APP_DB_PASSWORD no .env.local}
    ports:
      - "127.0.0.1:54329:5432"
    volumes:
      - usinagem_pg:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d usinagem"]
      interval: 2s
      timeout: 3s
      retries: 20
volumes:
  usinagem_pg:
```

- [ ] **Step 5: `vitest.config.ts`**

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

- [ ] **Step 6: Teste que falha para `urlLocal`**

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
    expect(() => urlLocal(undefined)).toThrow("não definida");
  });
});
```

Run: `cd apps/usinagem && pnpm test`
Expected: FAIL, módulo `./url-local` não existe.

- [ ] **Step 7: Implementar**

`lib/servidor/db/url-local.ts`:

```ts
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

// Guarda contra conexão acidental com banco real: o ERP só fala com Postgres local nesta fase.
export function urlLocal(url: string | undefined): string {
  if (!url) throw new Error("URL do banco não definida.");
  if (!HOSTS_LOCAIS.has(new URL(url).hostname)) {
    throw new Error("A URL do banco precisa apontar para o Postgres local.");
  }
  return url;
}
```

Run: `pnpm test`
Expected: PASS (3 testes).

- [ ] **Step 8: Commit**

```bash
chmod 755 apps/usinagem/db/init/01-roles.sh
git add apps/usinagem/package.json apps/usinagem/compose.yaml apps/usinagem/db/init/01-roles.sh apps/usinagem/vitest.config.ts apps/usinagem/lib/servidor/db/url-local.ts apps/usinagem/lib/servidor/db/url-local.test.ts pnpm-lock.yaml
git commit -m "feat(usinagem): Postgres local com roles de migração e aplicação, Vitest e guarda de host"
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
  - `PERFIS`, `type Perfil`, `NOME_PERFIL`;
  - `SITUACOES_COMERCIAIS` (inclui `fechado` e `reaberto`), `ESTADOS_REVISAO`;
  - tabelas `perfis`, `permissoes`, `perfilPermissoes`, `usuarios`, `eventosAuditoria`, `configuracoes`, `sequenciasNumeracao`, `clientes`, `processos`, `revisoesComerciais`, `itensRevisao`;
  - `db(): NodePgDatabase<typeof schema>`.
- Nota para o PR 1D: as colunas de `usuarios` (`id uuid`, `nome`, `email unique`, `criado_em`, `atualizado_em`) são compatíveis com o mapeamento `fields` do Better Auth 1.6.33. O 1D só acrescenta `email_verificado` e `imagem`.

Executado (commits `a3e9488`, `18ba676`). O humano pediu ajustes antes da migration, e eles valem sobre o código abaixo. A fonte de verdade é o `schema.ts` commitado.
- `eventos_auditoria.entidade_id` é `text`: chaves de configuracoes, perfis e permissoes são text, e UUIDs entram como texto.
- `processos` não tem `letra`.
- `revisoes_comerciais` ganha:
  - `sequencia integer not null`, com `CHECK > 0` e unique `(processo_id, sequencia)`;
  - `CHECK letra ~ '^[A-Z]{1,2}$'`.
- A revisão vigente é a de maior `sequencia`. A letra é só rótulo. O número exibido é `processos.numero` + a letra da revisão vigente.
- Índices `<tabela>_<coluna>_idx` em toda FK que não é a primeira coluna de um unique composto, mais `eventos_auditoria_entidade_idx (entidade, entidade_id, criado_em)`.
- `db()` usa um `Pool` explícito do `pg`:
  - `max: 10` e `on("error")` registrando só código e mensagem;
  - instância em `globalThis` só em desenvolvimento.
- Fix round 2 (`f0cf6f0`), decisão do humano:
  - CHECKs `processos.numero > 0`, `derivado_de_processo_id <> id`, `validade_dias > 0` (quando não nulo) e `usuarios.email = lower(email)`;
  - `atualizado_em` em `itens_revisao`.
  - O Better Auth 1.6.33 põe o e-mail em minúsculas no `createUser`, no `findUserByEmail`, no cadastro e na troca de e-mail (`dist/db/internal-adapter.mjs`), então o CHECK é compatível.

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
```

- [ ] **Step 3: Conexão lazy (role da aplicação)**

`lib/servidor/db/index.ts`:

```ts
import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { urlLocal } from "./url-local";

let instancia: NodePgDatabase<typeof schema> | undefined;

// Lazy: `next build` importa o módulo sem DATABASE_URL; a conexão só nasce no primeiro uso.
// DATABASE_URL é sempre a role da aplicação (só DML).
export function db(): NodePgDatabase<typeof schema> {
  instancia ??= drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  return instancia;
}
```

- [ ] **Step 4: `drizzle.config.ts` (role de migração)**

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
  // Só o drizzle-kit usa a role de migração; app e seed usam DATABASE_URL.
  dbCredentials: { url: urlLocal(process.env.DATABASE_URL_MIGRACAO) },
});
```

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `cd apps/usinagem && pnpm typecheck && pnpm lint && pnpm build`
Expected: código 0 nos três.

- [ ] **Step 6: Commit**

```bash
git add apps/usinagem/lib/dominio/permissoes/perfis.ts apps/usinagem/lib/servidor/db/schema.ts apps/usinagem/lib/servidor/db/index.ts apps/usinagem/drizzle.config.ts
git commit -m "feat(usinagem): schema Drizzle de núcleo e processo com versao e sequência de numeração"
```

- [ ] **Step 7: HUMANO gera e aplica as migrations locais**

O agente para e pede ao humano. Primeiro, o `.env.local` criado à mão. As senhas são locais e diferentes das do CI.

```
POSTGRES_PASSWORD=<superusuário local>
MIGRACAO_DB_PASSWORD=<role de migração>
APP_DB_PASSWORD=<role da aplicação>
DATABASE_URL_MIGRACAO=postgres://usinagem_migracao:<senha>@127.0.0.1:54329/usinagem
DATABASE_URL=postgres://usinagem_app:<senha>@127.0.0.1:54329/usinagem
```

Depois:

```bash
cd apps/usinagem
pnpm db:up
pnpm db:generate --name nucleo_processo
pnpm db:generate --custom --name revogar_escrita_append_only
```

Ordem obrigatória: a migration `--custom` é gerada **depois** da `nucleo_processo`, então recebe número maior e roda depois da criação das tabelas. Se for gerada antes, o `REVOKE` falha porque a tabela ainda não existe.

No arquivo vazio gerado pelo `--custom`, o humano escreve:

```sql
-- Append-only: a aplicação só insere. Correção é um novo registro de estorno, nunca UPDATE.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "eventos_auditoria" FROM usinagem_app;
```

E por fim, com a role de migração (é ela que fica dona das tabelas):

```bash
pnpm db:migrate
git add drizzle && git commit -m "feat(usinagem): migrations de núcleo e processo e revogação de escrita append-only"
```

O agente continua só depois da confirmação.

**`movimentos_estoque` e `baixas` ainda não existem no 1A.** O schema de estoque só se estabiliza depois dos testes puros da 1B (spec §9), e `baixas` é do PR 3. Um `REVOKE` sobre tabela inexistente derruba a migration. Por isso:
- a lista das 3 tabelas fica em código (`TABELAS_APPEND_ONLY`, Task 4);
- o teste de permissão cobre as 3, falhando se qualquer uma existir com `UPDATE`, `DELETE` ou `TRUNCATE` para a aplicação;
- quando o PR 3 criar `baixas` e o PR 5 criar `movimentos_estoque`, o teste fica vermelho até a migration custom daquele PR trazer o `REVOKE` correspondente, sempre gerada depois da que cria a tabela.

### Task 3: Numeração atômica com número inicial configurável

**Files:**
- Create: `apps/usinagem/lib/dominio/processo/numeracao.ts`
- Test: `apps/usinagem/lib/dominio/processo/numeracao.test.ts`
- Create: `apps/usinagem/lib/servidor/numeracao.ts`
- Test: `apps/usinagem/lib/servidor/numeracao.test.ts`

**Interfaces:**
- Consumes: `sequenciasNumeracao`, `processos`, `urlLocal`, `Resultado` (definido aqui em linha; a 1B cria `comum.ts` e passa a importar de lá).
- Produces:
  - `validarNumeroInicial(inicio: number, maiorUsado: number | null): { ok: true } | { ok: false; erro: string }`;
  - `formatarNumeroProcesso(numero: number, letra: string): string`;
  - `reservarNumero(banco: NodePgDatabase<typeof schema>, nome: string): Promise<number>`;
  - `definirNumeroInicial(banco, nome: string, inicio: number): Promise<{ ok: true } | { ok: false; erro: string }>`.

- [ ] **Step 1: Testes que falham**

`lib/dominio/processo/numeracao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatarNumeroProcesso, validarNumeroInicial } from "./numeracao";

describe("numeração", () => {
  it("formata número e letra", () => {
    expect(formatarNumeroProcesso(357, "A")).toBe("357-A");
  });
  it("início precisa ser inteiro positivo", () => {
    expect(validarNumeroInicial(0, null).ok).toBe(false);
    expect(validarNumeroInicial(1.5, null).ok).toBe(false);
    expect(validarNumeroInicial(357, null).ok).toBe(true);
  });
  it("início precisa passar do maior já usado", () => {
    expect(validarNumeroInicial(300, 356).ok).toBe(false);
    expect(validarNumeroInicial(356, 356).ok).toBe(false);
    expect(validarNumeroInicial(357, 356).ok).toBe(true);
  });
});
```

`lib/servidor/numeracao.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { definirNumeroInicial, reservarNumero } from "./numeracao";

// No CI, ausência de DATABASE_URL falha em vez de pular (política em teste-banco.ts).
const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("numeração no banco", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  const nome = `teste_${randomUUID()}`;
  afterAll(async () => {
    await banco.delete(schema.sequenciasNumeracao).where(eq(schema.sequenciasNumeracao.nome, nome));
    await banco.$client.end();
  });

  it("20 gerações concorrentes: 20 números distintos e consecutivos", async () => {
    // Sequência de teste isolada: não passa pela regra de "maior que processos existentes".
    await banco.insert(schema.sequenciasNumeracao).values({ nome, proximo: 357 });
    const numeros = await Promise.all(Array.from({ length: 20 }, () => reservarNumero(banco, nome)));
    const ordenados = [...numeros].sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(20);
    expect(ordenados).toEqual(Array.from({ length: 20 }, (_, i) => 357 + i));
  });

  it("número inicial abaixo do maior já usado em processos é recusado", async () => {
    // O seed tem processos até 9003.
    expect((await definirNumeroInicial(banco, "processo", 9000)).ok).toBe(false);
  });
});
```

Run: `cd apps/usinagem && pnpm test lib/dominio/processo lib/servidor/numeracao.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 2: Implementar a regra pura**

`lib/dominio/processo/numeracao.ts`:

```ts
export function validarNumeroInicial(inicio: number, maiorUsado: number | null): { ok: true } | { ok: false; erro: string } {
  if (!Number.isInteger(inicio) || inicio < 1) return { ok: false, erro: "O número inicial precisa ser inteiro e positivo." };
  if (maiorUsado !== null && inicio <= maiorUsado) {
    return { ok: false, erro: "O número inicial precisa ser maior que o último número já usado." };
  }
  return { ok: true };
}

export const formatarNumeroProcesso = (numero: number, letra: string): string => `${numero}-${letra}`;
```

- [ ] **Step 3: Implementar a parte do banco**

`lib/servidor/numeracao.ts` (sem `server-only`, porque o seed e os testes também usam):

```ts
import { eq, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { validarNumeroInicial } from "../dominio/processo/numeracao";
import * as schema from "./db/schema";

const { sequenciasNumeracao: seq, processos } = schema;

/** Incremento atômico: o UPDATE trava a linha, então chamadas concorrentes nunca repetem número. */
export async function reservarNumero(banco: NodePgDatabase<typeof schema>, nome: string): Promise<number> {
  const [linha] = await banco
    .update(seq)
    .set({ proximo: sql`${seq.proximo} + 1`, atualizadoEm: sql`now()` })
    .where(eq(seq.nome, nome))
    .returning({ numero: sql<number>`${seq.proximo} - 1` });
  if (!linha) throw new Error("Sequência de numeração não configurada.");
  return Number(linha.numero);
}

/** Continua a sequência já usada pela empresa. Só aceita início maior que o maior número de processo. */
export async function definirNumeroInicial(banco: NodePgDatabase<typeof schema>, nome: string, inicio: number) {
  return banco.transaction(async (tx) => {
    const [{ maior }] = await tx.select({ maior: max(processos.numero) }).from(processos);
    const valido = validarNumeroInicial(inicio, maior ?? null);
    if (!valido.ok) return valido;
    await tx
      .insert(seq)
      .values({ nome, proximo: inicio })
      .onConflictDoUpdate({ target: seq.nome, set: { proximo: inicio, atualizadoEm: sql`now()` } });
    return valido;
  });
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm test lib/dominio/processo lib/servidor/numeracao.test.ts`
Expected: PASS. Os testes de banco rodam se o `.env.local` existir. O segundo teste de banco depende do seed (Task 4): na primeira execução, rodar de novo depois da Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/usinagem/lib/dominio/processo/numeracao.ts apps/usinagem/lib/dominio/processo/numeracao.test.ts apps/usinagem/lib/servidor/numeracao.ts apps/usinagem/lib/servidor/numeracao.test.ts
git commit -m "feat(usinagem): numeração atômica de processo com início configurável"
```

### Task 4: Seed fictício idempotente com a role da aplicação

**Files:**
- Create: `apps/usinagem/scripts/seed.ts`
- Create: `apps/usinagem/lib/servidor/db/append-only.ts`
- Test: `apps/usinagem/scripts/seed.test.ts`

**Interfaces:**
- Consumes: schema, `PERFIS`, `NOME_PERFIL`, `urlLocal`.
- Produces:
  - `semear(banco: NodePgDatabase<typeof schema>): Promise<void>`;
  - `USUARIOS_FICTICIOS: { id: string; perfil: Perfil; nome: string }[]` (um por perfil, ids fixos).

- [ ] **Step 1: Teste que falha**

`scripts/seed.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { and, count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { TABELAS_APPEND_ONLY } from "../lib/servidor/db/append-only";
import { bancoDisponivel } from "../lib/servidor/db/teste-banco";
import { semear, USUARIOS_FICTICIOS } from "./seed";

// No CI, ausência de DATABASE_URL falha em vez de pular (política em teste-banco.ts).
const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("seed fictício e role da aplicação", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  it("é idempotente e marca tudo como fictício", async () => {
    await semear(banco);
    const [antes] = await banco.select({ n: count() }).from(schema.usuarios);
    await semear(banco);
    const [depois] = await banco.select({ n: count() }).from(schema.usuarios);
    expect(depois.n).toBe(antes.n);
    const [p] = await banco.select({ n: count() }).from(schema.perfis);
    expect(p.n).toBe(5);
    // Outros testes criam usuários fictícios próprios; aqui só os do seed importam.
    const doSeed = (await banco.select().from(schema.usuarios)).filter((x) => USUARIOS_FICTICIOS.some((f) => f.id === x.id));
    expect(doSeed).toHaveLength(5);
    expect(doSeed.every((x) => x.ficticio)).toBe(true);
    const [s] = await banco.select().from(schema.sequenciasNumeracao).where(eq(schema.sequenciasNumeracao.nome, "processo"));
    expect(s.proximo).toBeGreaterThan(9003);
  });

  it("usinagem_migracao é dona de todas as tabelas; usinagem_app de nenhuma", async () => {
    const { rows } = await banco.$client.query<{ schemaname: string; tablename: string; tableowner: string }>(
      "select schemaname, tablename, tableowner from pg_tables where schemaname in ('public', 'drizzle')",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.tableowner !== "usinagem_migracao")).toEqual([]);
    const { rows: criar } = await banco.$client.query<{ pode: boolean }>(
      "select has_schema_privilege('usinagem_app', 'public', 'CREATE') as pode",
    );
    expect(criar[0].pode).toBe(false);
  });

  it("append-only: a aplicação não tem UPDATE, DELETE nem TRUNCATE nas 3 tabelas", async () => {
    const { rows } = await banco.$client.query<{ tabela: string; existe: boolean; update: boolean | null; del: boolean | null; trunc: boolean | null }>(
      `select t as tabela, to_regclass(t) is not null as existe,
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'UPDATE') end as update,
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'DELETE') end as del,
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'TRUNCATE') end as trunc
         from unnest($1::text[]) as t`,
      [TABELAS_APPEND_ONLY],
    );
    expect(rows.map((r) => r.tabela)).toEqual([...TABELAS_APPEND_ONLY]);
    // eventos_auditoria existe desde o 1A; as outras passam a ser checadas quando forem criadas (PR 3 e PR 5).
    expect(rows.find((r) => r.tabela === "eventos_auditoria")?.existe).toBe(true);
    const comEscrita = rows.filter((r) => r.existe && (r.update || r.del || r.trunc));
    expect(comEscrita).toEqual([]);
  });

  it("a role da aplicação insere na auditoria mas não altera nem apaga", async () => {
    const [ev] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_role", entidade: "teste" })
      .returning({ id: schema.eventosAuditoria.id });
    await expect(
      banco.update(schema.eventosAuditoria).set({ operacao: "x" }).where(eq(schema.eventosAuditoria.id, ev.id)),
    ).rejects.toThrow(/permission denied/);
    await expect(banco.delete(schema.eventosAuditoria).where(eq(schema.eventosAuditoria.id, ev.id))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("auditoria registra entidade com chave text (configuracoes) e com UUID como texto", async () => {
    const [cfg] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_chave_text", entidade: "configuracoes", entidadeId: "letra", depois: { regra: "pendente" } })
      .returning();
    expect(cfg.entidadeId).toBe("letra");
    const uuid = USUARIOS_FICTICIOS[0].id;
    const [usr] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_chave_text", entidade: "usuarios", entidadeId: uuid })
      .returning();
    expect(usr.entidadeId).toBe(uuid);
    const achados = await banco
      .select()
      .from(schema.eventosAuditoria)
      .where(and(eq(schema.eventosAuditoria.entidade, "configuracoes"), eq(schema.eventosAuditoria.entidadeId, "letra")));
    expect(achados.some((e) => e.id === cfg.id)).toBe(true);
  });

  it("revisão vigente é a de maior sequencia, não a de maior letra em texto", async () => {
    const revs = await banco
      .select()
      .from(schema.revisoesComerciais)
      .where(eq(schema.revisoesComerciais.processoId, "00000000-0000-4000-8000-000000000202"))
      .orderBy(desc(schema.revisoesComerciais.sequencia));
    expect(revs.map((r) => [r.sequencia, r.letra])).toEqual([[2, "B"], [1, "A"]]);
  });
});
```

Run: `cd apps/usinagem && pnpm test scripts/seed.test.ts`
Expected: FAIL, módulo `./seed` não existe.

- [ ] **Step 2: Implementar**

`lib/servidor/db/append-only.ts`:

```ts
/**
 * Tabelas em que a aplicação só insere (spec §6.8). Correção vira um novo registro de estorno.
 * Cada uma recebe REVOKE UPDATE, DELETE, TRUNCATE de usinagem_app numa migration custom gerada
 * depois da migration que cria a tabela. O seed.test.ts falha se alguma existir sem a revogação.
 */
export const TABELAS_APPEND_ONLY = ["eventos_auditoria", "movimentos_estoque", "baixas"] as const;
```

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
// processos não guarda letra: o número exibido usa a letra da revisão de maior `sequencia`.
const PROCESSOS = [
  { id: "00000000-0000-4000-8000-000000000201", numero: 9001, clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Polia dentada 40 dentes", situacaoComercial: "cotacao_aberta" },
  { id: "00000000-0000-4000-8000-000000000202", numero: 9002, clienteId: CLIENTES[1].id, titulo: "[FICTÍCIO] Eixo retificado", situacaoComercial: "cotacao_enviada" },
  { id: "00000000-0000-4000-8000-000000000203", numero: 9003, clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Flange usinado", situacaoComercial: "aprovado" },
];

// 9002 tem duas revisões: A (sequencia 1, substituída) e B (sequencia 2, vigente). Exibe 9002-B.
const REVISOES = [
  { id: "00000000-0000-4000-8000-000000000301", processoId: PROCESSOS[0].id, sequencia: 1, letra: "A", estado: "preco_pendente", criadoPor: COMERCIAL },
  { id: "00000000-0000-4000-8000-000000000304", processoId: PROCESSOS[1].id, sequencia: 1, letra: "A", estado: "substituida", criadoPor: COMERCIAL, precificadaPor: ADMIN },
  { id: "00000000-0000-4000-8000-000000000302", processoId: PROCESSOS[1].id, sequencia: 2, letra: "B", estado: "enviada", criadoPor: COMERCIAL, precificadaPor: ADMIN },
  { id: "00000000-0000-4000-8000-000000000303", processoId: PROCESSOS[2].id, sequencia: 1, letra: "A", estado: "aprovada", criadoPor: COMERCIAL, precificadaPor: ADMIN, aprovadaPor: COMERCIAL },
];

const ITENS = [
  { id: "00000000-0000-4000-8000-000000000401", revisaoId: REVISOES[0].id, ordem: 1, descricao: "[FICTÍCIO] Polia dentada aço 1045", quantidade: 20, precoUnitarioCentavos: null },
  { id: "00000000-0000-4000-8000-000000000404", revisaoId: REVISOES[1].id, ordem: 1, descricao: "[FICTÍCIO] Eixo Ø40 x 300", quantidade: 10, precoUnitarioCentavos: 19_900 },
  { id: "00000000-0000-4000-8000-000000000402", revisaoId: REVISOES[2].id, ordem: 1, descricao: "[FICTÍCIO] Eixo Ø40 x 300", quantidade: 10, precoUnitarioCentavos: 18_500 },
  { id: "00000000-0000-4000-8000-000000000403", revisaoId: REVISOES[3].id, ordem: 1, descricao: "[FICTÍCIO] Flange DN100", quantidade: 40, precoUnitarioCentavos: 9_990 },
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
    await tx.insert(schema.sequenciasNumeracao).values({ nome: "processo", proximo: 9004 }).onConflictDoNothing();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Role da aplicação (DATABASE_URL), nunca a de migração.
  const banco = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  semear(banco)
    .then(() => console.log("Seed fictício aplicado."))
    .finally(() => banco.$client.end());
}
```

- [ ] **Step 3: Rodar contra o banco local**

Run: `cd apps/usinagem && pnpm db:seed && pnpm test`
Expected: `Seed fictício aplicado.` e todos os testes PASS, inclusive os de banco (numeração, seed, dono das tabelas, append-only, role).

- [ ] **Step 4: Commit**

```bash
git add apps/usinagem/scripts/seed.ts apps/usinagem/scripts/seed.test.ts apps/usinagem/lib/servidor/db/append-only.ts
git commit -m "feat(usinagem): seed fictício idempotente e teste de permissão da role da aplicação"
```

### Task 5: CI do GitHub Actions

**Files:**
- Create: `.github/workflows/usinagem.yml`

**Interfaces:**
- Consumes: `db/init/01-roles.sh`, scripts `typecheck`, `lint`, `db:migrate`, `db:seed`, `test`; migrations commitadas pelo humano (Task 2, Step 7).

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
          POSTGRES_USER: postgres
          # Senhas descartáveis do container efêmero do CI. Valor de teste, diferente das senhas locais.
          POSTGRES_PASSWORD: ci_superusuario_descartavel
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d usinagem"
          --health-interval 2s --health-timeout 3s --health-retries 20
    env:
      DATABASE_URL_MIGRACAO: postgres://usinagem_migracao:ci_migracao_descartavel@localhost:5432/usinagem
      DATABASE_URL: postgres://usinagem_app:ci_app_descartavel@localhost:5432/usinagem
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
      - name: Criar roles
        run: bash db/init/01-roles.sh
        env:
          PGHOST: localhost
          PGPASSWORD: ci_superusuario_descartavel
          POSTGRES_USER: postgres
          POSTGRES_DB: usinagem
          MIGRACAO_DB_PASSWORD: ci_migracao_descartavel
          APP_DB_PASSWORD: ci_app_descartavel
      - run: pnpm db:migrate
      - run: node --import tsx scripts/seed.ts
      - run: pnpm test
```

`pnpm/action-setup@v4` lê a versão do `packageManager` da raiz (9.15.9). A guarda `urlLocal` continua valendo no CI (host `localhost`).

- [ ] **Step 2: Validar sintaxe localmente**

Run: `pnpm dlx @action-validator/cli@0.6.0 .github/workflows/usinagem.yml`
Expected: sem erro. A validação real só acontece no primeiro push, que depende da confirmação do humano.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/usinagem.yml
git commit -m "ci(usinagem): typecheck, lint e Vitest com Postgres de serviço e roles separadas"
```
