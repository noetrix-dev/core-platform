# Usinagem 1A, migration 0002: colunas de registro, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a divergência apontada pela revisão final (Important 1). A spec §4 manda `criado_em`, `atualizado_em` e `criado_por` nas tabelas, e o schema do 1A não seguia isso. Esta rodada traz o schema para a convenção, com as exceções documentadas, e prova a regra de FK das tabelas append-only.

**Architecture:**
- O agente altera `schema.ts`, o seed e os testes.
- O humano gera e aplica a migration `0002` com a role de migração, só no Postgres local.
- Os testes de estrutura leem `information_schema` e `pg_constraint` com a role da aplicação.
- Também entram os ajustes pequenos pedidos na mesma rodada: `server-only` em `numeracao.ts`, o alias do `server-only` no Vitest e o comentário do `vitest.config.mts`.

**Tech Stack:** drizzle-orm 0.45.4, drizzle-kit 0.31.11 (só o humano), Postgres 16 local, Vitest 5.0.5.

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4 convenções e exceções, §6.8)

## Global Constraints

- Agente nunca roda `docker`, `db:up`, `db:down`, `db:generate`, `db:migrate`, `drizzle-kit` nem `psql`, e nunca edita `apps/usinagem/drizzle/`.
- `criado_em` e `atualizado_em`: `timestamp with time zone NOT NULL DEFAULT now()`.
- `criado_por`: `uuid` com FK para `usuarios(id)`, **nullable** nas colunas novas, ação `NO ACTION` (o padrão; nunca CASCADE, SET NULL nem SET DEFAULT). As colunas `criado_por NOT NULL` que já existem (`processos`, `revisoes_comerciais`) continuam NOT NULL.
- Exceções (spec §4):
  - `eventos_auditoria` é append-only: só `criado_em`, sem `atualizado_em`, e `autor_id` no lugar de `criado_por`;
  - `perfil_permissoes` tem só `criado_em`;
  - `perfis`, `permissoes` e `perfil_permissoes` não têm `criado_por`.
- Tabela append-only não pode ter FK com `ON DELETE` ou `ON UPDATE` em CASCADE, SET NULL ou SET DEFAULT.
- Toda FK nova ganha índice `<tabela>_<coluna>_idx`.
- Dados do seed continuam fictícios. Sem push.

---

### Task 1: `server-only` em `numeracao.ts` e alias no Vitest

**Files:**
- Modify: `apps/usinagem/lib/servidor/numeracao.ts` (primeira linha)
- Modify: `apps/usinagem/vitest.config.mts`

**Interfaces:**
- Produces: em teste, o `server-only` resolve para o módulo vazio do próprio pacote; módulos de `lib/servidor/` podem declarar `import "server-only"` sem quebrar o Vitest.

- [ ] **Step 1: Confirmar quem importa `numeracao.ts`**

Run: `cd apps/usinagem && grep -rnE 'servidor/numeracao|from "\./numeracao"' --include=*.ts --include=*.tsx lib scripts app`
Expected:
- `lib/servidor/numeracao.test.ts`, que importa `./numeracao` deste diretório;
- `lib/dominio/processo/numeracao.test.ts`, que importa o módulo puro de mesmo nome e não é afetado.

Se `scripts/*.ts` ou outro script do Node importar `lib/servidor/numeracao`, PARAR e reportar, porque o `server-only` quebraria esse script fora do Next. O arquivo vazio do pacote é `node_modules/server-only/empty.js` (conferido).

- [ ] **Step 2: Acrescentar `import "server-only";` como primeira linha de `lib/servidor/numeracao.ts`**

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm exec vitest run lib/servidor/numeracao.test.ts`
Expected: FAIL, com o erro do `server-only` ("This module cannot be imported from a Client Component module" ou equivalente).

- [ ] **Step 4: Alias e comentário em `vitest.config.mts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Carrega DATABASE_URL local para os testes de banco. Sem ela: fora do CI os testes de banco
// são pulados com aviso; no CI eles falham (política em lib/servidor/db/teste-banco.ts).
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  resolve: {
    // Em teste não há Next: o `server-only` aponta para o módulo vazio do próprio pacote.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

Conferir antes que `node_modules/server-only/empty.js` existe (`ls apps/usinagem/node_modules/server-only/`). Se o arquivo vazio tiver outro nome, usar o nome real e registrar no relatório.

- [ ] **Step 5: Rodar**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`
Expected: a suíte toda verde (35 testes), typecheck, lint e build limpos.

- [ ] **Step 6: Commit**

```bash
git add apps/usinagem/lib/servidor/numeracao.ts apps/usinagem/vitest.config.mts
git commit -m "fix(usinagem): server-only em numeracao.ts, alias no Vitest e comentário atualizado"
```

### Task 2: Colunas de registro no schema, seed e testes de estrutura

**Files:**
- Modify: `apps/usinagem/lib/servidor/db/schema.ts`
- Modify: `apps/usinagem/scripts/seed.ts`
- Create: `apps/usinagem/lib/servidor/db/estrutura.test.ts`

**Interfaces:**
- Consumes: `TABELAS_APPEND_ONLY` (`lib/servidor/db/append-only.ts`), `bancoDisponivel()`, `urlLocal`.
- Produces: colunas novas (tabela abaixo) e o teste de estrutura que a 0002 precisa deixar verde.

| Tabela | Acrescenta |
|---|---|
| `usuarios` | `criado_por` (FK nullable para `usuarios`, autorreferência) |
| `clientes` | `criado_por` |
| `itens_revisao` | `criado_por` |
| `configuracoes` | `criado_em`, `criado_por` |
| `sequencias_numeracao` | `criado_em`, `criado_por` |
| `perfis` | `criado_em`, `atualizado_em` |
| `permissoes` | `criado_em`, `atualizado_em` |
| `perfil_permissoes` | `criado_em` |

`processos`, `revisoes_comerciais` e `eventos_auditoria` não mudam.

- [ ] **Step 1: Teste de estrutura que falha**

`lib/servidor/db/estrutura.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { TABELAS_APPEND_ONLY } from "./append-only";
import { bancoDisponivel } from "./teste-banco";
import { urlLocal } from "./url-local";

// Convenção da spec §4 e exceções documentadas. Lê o catálogo do Postgres com a role da aplicação.
const COM_CRIADO_E_ATUALIZADO = [
  "usuarios", "clientes", "processos", "revisoes_comerciais", "itens_revisao",
  "configuracoes", "sequencias_numeracao", "perfis", "permissoes",
];
const SO_CRIADO_EM = ["perfil_permissoes", "eventos_auditoria"];
const COM_CRIADO_POR = [
  "usuarios", "clientes", "processos", "revisoes_comerciais", "itens_revisao",
  "configuracoes", "sequencias_numeracao",
];
const SEM_CRIADO_POR = ["perfis", "permissoes", "perfil_permissoes", "eventos_auditoria"];
const CRIADO_POR_OBRIGATORIO = ["processos", "revisoes_comerciais"];

const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("estrutura das tabelas (spec §4 e §6.8)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  const colunas = async (tabelas: string[], nomes: string[]) =>
    (
      await banco.$client.query<{ tabela: string; coluna: string; nulo: string; padrao: string | null; tipo: string }>(
        `select table_name as tabela, column_name as coluna, is_nullable as nulo, column_default as padrao, data_type as tipo
           from information_schema.columns
          where table_schema = 'public' and table_name = any($1) and column_name = any($2)`,
        [tabelas, nomes],
      )
    ).rows;

  it("criado_em e atualizado_em: timestamptz NOT NULL DEFAULT now()", async () => {
    const rows = await colunas(COM_CRIADO_E_ATUALIZADO, ["criado_em", "atualizado_em"]);
    for (const t of COM_CRIADO_E_ATUALIZADO) {
      for (const c of ["criado_em", "atualizado_em"]) {
        const col = rows.find((r) => r.tabela === t && r.coluna === c);
        expect(col, `${t}.${c}`).toBeDefined();
        expect(col!.nulo, `${t}.${c} nulo`).toBe("NO");
        expect(col!.tipo, `${t}.${c} tipo`).toBe("timestamp with time zone");
        expect(col!.padrao, `${t}.${c} default`).toMatch(/^now\(\)/);
      }
    }
  });

  it("exceções: perfil_permissoes e eventos_auditoria só com criado_em", async () => {
    const rows = await colunas(SO_CRIADO_EM, ["criado_em", "atualizado_em"]);
    for (const t of SO_CRIADO_EM) {
      expect(rows.some((r) => r.tabela === t && r.coluna === "criado_em"), `${t}.criado_em`).toBe(true);
      expect(rows.some((r) => r.tabela === t && r.coluna === "atualizado_em"), `${t}.atualizado_em`).toBe(false);
    }
  });

  it("criado_por: FK para usuarios, nullable nas novas, NOT NULL onde já era", async () => {
    const rows = await colunas([...COM_CRIADO_POR, ...SEM_CRIADO_POR], ["criado_por"]);
    for (const t of COM_CRIADO_POR) {
      const col = rows.find((r) => r.tabela === t);
      expect(col, `${t}.criado_por`).toBeDefined();
      expect(col!.nulo, `${t}.criado_por nulo`).toBe(CRIADO_POR_OBRIGATORIO.includes(t) ? "NO" : "YES");
    }
    for (const t of SEM_CRIADO_POR) expect(rows.some((r) => r.tabela === t), `${t} sem criado_por`).toBe(false);

    const { rows: fks } = await banco.$client.query<{ tabela: string; alvo: string; del: string; upd: string }>(
      `select c.conrelid::regclass::text as tabela, c.confrelid::regclass::text as alvo,
              c.confdeltype as del, c.confupdtype as upd
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f' and a.attname = 'criado_por'`,
    );
    for (const t of COM_CRIADO_POR) {
      const fk = fks.find((f) => f.tabela === t);
      expect(fk?.alvo, `${t}.criado_por referencia`).toBe("usuarios");
      expect([fk?.del, fk?.upd], `${t}.criado_por ações`).toEqual(["a", "a"]);
    }
  });

  it("tabela append-only não tem FK com CASCADE, SET NULL ou SET DEFAULT", async () => {
    const { rows } = await banco.$client.query<{ tabela: string; restricao: string }>(
      `select c.conrelid::regclass::text as tabela, c.conname as restricao
         from pg_constraint c
        where c.contype = 'f'
          and c.conrelid::regclass::text = any($1)
          and (c.confdeltype in ('c', 'n', 'd') or c.confupdtype in ('c', 'n', 'd'))`,
      [[...TABELAS_APPEND_ONLY]],
    );
    expect(rows).toEqual([]);
  });
});
```

Run: `cd apps/usinagem && pnpm exec vitest run lib/servidor/db/estrutura.test.ts`
Expected: os testes 1, 2 e 3 ficam vermelhos antes da migração, porque as colunas novas ainda não existem no banco. O 2 depende de `perfil_permissoes.criado_em`, que só chega com a 0002. O 4 passa: hoje a única tabela append-only é `eventos_auditoria`, e a FK `autor_id` dela é NO ACTION. O relatório registra quais passam e quais falham. (Execução real: 1, 2 e 3 falharam e o 4 passou; depois da 0002, os 4 passaram.)

- [ ] **Step 2: Schema**

Em `lib/servidor/db/schema.ts`, usando os helpers `criadoEm()` e `atualizadoEm()` que já existem:

- `perfis`: `criadoEm: criadoEm()`, `atualizadoEm: atualizadoEm()`.
- `permissoes`: `criadoEm: criadoEm()`, `atualizadoEm: atualizadoEm()`.
- `perfilPermissoes`: `criadoEm: criadoEm()`.
- `usuarios`:
  - `criadoPor: uuid("criado_por").references((): AnyPgColumn => usuarios.id)`, nullable, com o comentário `// Nullable: o primeiro Admin não tem quem o crie.`;
  - `index("usuarios_criado_por_idx").on(t.criadoPor)`.
- `configuracoes`:
  - `criadoEm: criadoEm()` e `criadoPor: uuid("criado_por").references(() => usuarios.id)`;
  - callback `(t) => [index("configuracoes_criado_por_idx").on(t.criadoPor)]`.
- `sequenciasNumeracao`:
  - `criadoEm: criadoEm()` e `criadoPor: uuid("criado_por").references(() => usuarios.id)`;
  - `index("sequencias_numeracao_criado_por_idx").on(t.criadoPor)` no callback que já existe.
- `clientes`:
  - `criadoPor: uuid("criado_por").references(() => usuarios.id)`;
  - callback com `index("clientes_criado_por_idx").on(t.criadoPor)`.
- `itensRevisao`:
  - `criadoPor: uuid("criado_por").references(() => usuarios.id)`;
  - `index("itens_revisao_criado_por_idx").on(t.criadoPor)` no callback que já existe.

Nenhuma FK nova declara `onDelete` ou `onUpdate`, porque o padrão é NO ACTION. Comentário único acima de `eventosAuditoria`: `// Append-only: FK daqui nunca usa CASCADE, SET NULL nem SET DEFAULT (a ação rodaria como dona e furaria o REVOKE).`

- [ ] **Step 3: Seed**

Em `scripts/seed.ts`:
- `CLIENTES` e `ITENS`: `criadoPor: COMERCIAL`;
- `sequenciasNumeracao`: `criadoPor: ADMIN`.
- `USUARIOS_FICTICIOS` continua sem `criadoPor` (null, porque é o bootstrap).

O `onConflictDoNothing` não preenche linhas que já existem. As linhas do banco local criadas antes da 0002 ficam com `criado_por` nulo, o que é permitido, e nenhum teste depende disso.

- [ ] **Step 4: Verificar sem o banco novo**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: limpos. NÃO rodar `pnpm db:seed` nem os testes de banco antes da migration: o seed falharia por coluna inexistente.

- [ ] **Step 5: Commit**

```bash
git add apps/usinagem/lib/servidor/db/schema.ts apps/usinagem/scripts/seed.ts apps/usinagem/lib/servidor/db/estrutura.test.ts
git commit -m "feat(usinagem): colunas de registro nas tabelas e teste de estrutura (migration 0002 pendente)"
```

- [ ] **Step 6: HUMANO gera e aplica a 0002**

O agente para e pede:

```bash
cd apps/usinagem
pnpm db:generate --name colunas_de_registro
# conferir o SQL: ADD COLUMN ... DEFAULT now() NOT NULL, ADD COLUMN criado_por uuid, FKs NO ACTION, CREATE INDEX
pnpm db:migrate
git add drizzle && git commit -m "feat(usinagem): migration 0002 com colunas de registro"
```

### Task 3: Verificação depois da 0002

**Files:** nenhum (só verificação; correções voltam para a Task 2).

- [ ] **Step 1: Seed e suíte completa**

Run: `cd apps/usinagem && pnpm db:seed && pnpm exec vitest run --reporter=verbose`
Expected:
- `Seed fictício aplicado.`;
- 6 arquivos, todos verdes, sem skipped. Os 4 de `estrutura.test.ts`, os 6 de `seed.test.ts` e os 2 de `numeracao.test.ts` estão entre eles.

- [ ] **Step 2: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm build` (de dentro de `apps/usinagem`, mostrando o final da saída).

- [ ] **Step 3: Revisão só do diff desta rodada**

O controller roda a revisão final (Opus) sobre o intervalo entre o commit anterior a esta rodada e o HEAD.
