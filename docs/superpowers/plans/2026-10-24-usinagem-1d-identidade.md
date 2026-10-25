# Usinagem 1D: identidade com Better Auth, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a identidade do ERP:
- login real com e-mail e senha (Better Auth 1.6.33), sem cadastro público;
- login auditado, com sucesso e falha;
- usuário inativo bloqueado e reautenticação recente nas ações sensíveis;
- gate no `proxy.ts`;
- seletor de perfil de dev fora do build de produção (404 e cookie ausente do bundle, verificados por script);
- script local para criar o Admin real.

**Architecture:**
- **Fábrica pura de auth** (`criarAuth({ banco, plugins })` em `lib/servidor/auth-config.ts`, sem `server-only`). Testável no Vitest contra o Postgres local.
- **Instância do app** (`lib/servidor/auth.ts`, `server-only`, lazy, com `nextCookies()`).
- **Handler** em `app/api/auth/[...all]/route.ts`, para o rate limit do Better Auth valer. É a única rota isenta do wrapper, registrada em `ROTAS_ISENTAS`.
- **Sessão no servidor**: `usuarioAtual()` tenta a sessão Better Auth e só cai no seletor de dev atrás do gate da 1B.
- **Seletor de dev**: vive em arquivos `*.dev.ts(x)`, que só viram rota quando `pageExtensions` inclui `dev.tsx`. Isso só acontece com o gate ligado.

**Tech Stack:** better-auth 1.6.33 (peer: drizzle-orm ^0.45.2, next ^16, react ^19), Next 16.3.4 (`proxy.ts`, `pageExtensions`), Drizzle 0.45.4, Zod 4.6.7, Vitest 5.0.5.

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md` (§4.1, §7.4, §8 "Autenticação" e "Seletor de perfil de dev", §10 "Identidade")

## Decisões validadas no Context7 (Better Auth, 2026-10-24)

- `advanced.database.generateId: "uuid"`. Com Postgres, o Better Auth deixa o banco gerar o UUID (`defaultRandom()`).
- Nomes de tabela e coluna são mapeados por `user.modelName` + `user.fields` (e o mesmo para `session`, `account`, `verification`). No adapter Drizzle, `modelName` aponta para a chave do objeto `schema` e `fields` aponta para o nome da propriedade TS. A tipagem continua com os nomes originais.
- `emailAndPassword.disableSignUp: true` faz o `/sign-up/email` responder `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- `session.freshAge` (segundos) controla o `freshSessionMiddleware`.
- O `hooks.after` com `createAuthMiddleware` roda também em erro: `ctx.path === "/sign-in/email"`, `ctx.context.newSession` no sucesso e `isAPIError(ctx.context.returned)` na falha.
- Usuário com senha criado no servidor: `ctx.internalAdapter.createUser`, depois `ctx.password.hash`, depois `ctx.internalAdapter.linkAccount({ providerId: "credential" })`. É o padrão do plugin admin.
- `nextCookies()` precisa ser o último plugin. `auth.api.getSession({ headers: await headers() })` no servidor.
- `advanced.validateSchema` vem ligado fora de produção e acusa divergência entre schema e mapeamento no primeiro request.
- **Versão fixada: 1.6.33** (decisão do responsável humano em 2026-10-24: a 1.6.x mais nova com mais de 14 dias de publicação):
  - `npm view better-auth time dist-tags` mostrou `latest` 1.7.12, publicada em 2026-10-20 (4 dias). Antes dela: 1.7.11 (10-19), 1.7.10 (10-15), 1.7.9 (10-15) e 1.7.8 (10-14). Todas com menos de 14 dias, então a linha 1.7 fica de fora.
  - Linha 1.6 (tag `release-1.6`): 1.6.33 e 1.6.32 em 2026-09-14 (39 dias), 1.6.31 em 2026-09-10 (43 dias). A 1.6.33 é a mais nova e passa da regra.
  - O Context7 indexa a 1.6.23. A 1.6.33 é da mesma linha de manutenção (patches sobre a 1.6), então a API consultada vale; qualquer divergência se resolve pelo `.d.ts` instalado.
  - Peers da 1.6.33: drizzle-orm ^0.45.2, drizzle-kit >=0.31.4, next ^14 || ^15 || ^16, react ^18 || ^19.
- **Aviso de peer do Vitest aceito**: o peer opcional `vitest` da 1.6.33 vai até ^4 e usamos a 5.0.5. O pnpm emite aviso, sem erro, e o Better Auth não usa o Vitest em runtime. Não silenciar com override global (`pnpm.overrides` nem `peerDependencyRules` no `package.json` da raiz): o aviso fica visível e é registrado no relatório da Task 1.
- Na Task 1, repetir `npm view better-auth time dist-tags` e registrar o resultado no relatório da task. Se o `tsc` acusar divergência de API em relação a este plano, a referência é o `.d.ts` instalado, nunca a memória.

## Pendências conhecidas deste plano (revisão final do 1A, 2026-10-25)

Corrigir ao executar o 1D, antes da task correspondente:
1. **Task 1, Step 3**: o `index` já é importado de `drizzle-orm/pg-core` em `schema.ts` desde o 1A. Não acrescentar de novo, porque duplicaria o identificador.
2. **CI**: nenhuma task edita `.github/workflows/usinagem.yml`. Sem `BETTER_AUTH_SECRET`, a guarda do `auth.test.ts` falha no CI (falha fechada, correta). Acrescentar ao `env` do job um valor descartável de teste, por exemplo `BETTER_AUTH_SECRET: ci_better_auth_descartavel_0123456789abcdef`, e `BETTER_AUTH_URL: http://localhost:3000`. Junto, o passo `bash scripts/verificar-build-producao.sh` da Task 4. Mudança de workflow passa por revisão do humano, como na Task 5 do 1A.
3. **Schema**: `usuarios` ganhou `criado_por` (FK nullable, autorreferência) no plano 0002. O `criarUsuarioComSenha` pode preenchê-lo com o Admin que cria, e o mapeamento do Better Auth não o expõe (`input: false`, se for declarado em `additionalFields`).

## Global Constraints

- Depende de 1A e 1B concluídos.
- Versão fixa: `better-auth@1.6.33` (pino exato, sem `^`). Aviso de peer do `vitest` aceito, sem override global.
- Agente nunca cria, edita nem aplica migration. O humano gera e aplica (Task 1, Step 4).
- Segredos (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) só no `.env.local`, editado à mão. O CI usa valor descartável de teste.
- Nenhuma tela de cadastro, de recuperação de senha nem de convite.
- A tela `/entrar` desta entrega é funcional e sem estilo próprio. O visual sai do `/impeccable shape` da 1C, que inclui `/entrar` como superfície.
- Sem push.

---

### Task 1: Dependência e schema das tabelas de identidade

**Files:**
- Modify: `apps/usinagem/package.json`
- Modify: `apps/usinagem/lib/servidor/db/schema.ts`

**Interfaces:**
- Produces: em `usuarios`, as colunas `emailVerificado` e `imagem`; tabelas `sessoes`, `contas`, `verificacoes`.

- [ ] **Step 1: Instalar**

```bash
pnpm --filter usinagem add better-auth@1.6.33
```

Conferir em `apps/usinagem/package.json`: `"better-auth": "1.6.33"`, pino exato, sem `^` nem `~`. Se vier com caret, editar para fixar.

O `pnpm add` deve mostrar o aviso de peer do `vitest` (`^4` esperado, `5.0.5` encontrado). Copiar o aviso para o relatório da task como aceito. Não acrescentar override nem regra de peer para escondê-lo.

Run: `npm view better-auth time dist-tags --json`
Registrar no relatório da task as datas de `latest` e da 1.6.33. Se surgir motivo para outra versão, parar e perguntar ao humano antes de trocar.

- [ ] **Step 2: Colunas novas em `usuarios`**

Em `lib/servidor/db/schema.ts`, dentro de `usuarios`, depois de `email`:

```ts
  emailVerificado: boolean("email_verificado").notNull().default(false),
  imagem: text("imagem"),
```

- [ ] **Step 3: Tabelas do Better Auth**

Ao fim de `lib/servidor/db/schema.ts`, adicionar `index` ao import de `drizzle-orm/pg-core` e:

```ts
// ── Identidade (Better Auth 1.6.33, nomes mapeados em auth-config.ts) ──
export const sessoes = pgTable(
  "sessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip"),
    userAgent: text("user_agent"),
    userId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessoes_usuario_idx").on(t.userId)],
);

export const contas = pgTable(
  "contas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("conta_id").notNull(),
    providerId: text("provedor_id").notNull(),
    userId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expira_em", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expira_em", { withTimezone: true }),
    scope: text("escopo"),
    // Hash da senha (nunca a senha). Só a role da aplicação lê; nunca sai em serialização.
    password: text("senha_hash"),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contas_usuario_idx").on(t.userId)],
);

export const verificacoes = pgTable(
  "verificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identificador").notNull(),
    value: text("valor").notNull(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verificacoes_identificador_idx").on(t.identifier)],
);
```

Run: `cd apps/usinagem && pnpm typecheck && pnpm lint`
Expected: limpo.

```bash
git add apps/usinagem/package.json pnpm-lock.yaml apps/usinagem/lib/servidor/db/schema.ts
git commit -m "feat(usinagem): schema de identidade para Better Auth 1.6.33"
```

- [ ] **Step 4: HUMANO gera e aplica a migration**

O agente para e pede ao humano:

```bash
cd apps/usinagem
pnpm db:generate --name identidade
pnpm db:migrate
git add drizzle && git commit -m "feat(usinagem): migration de identidade"
```

E acrescentar ao `.env.local`, à mão:

```
BETTER_AUTH_SECRET=<saída de: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

### Task 2: Fábrica de auth, auditoria de login e bloqueio de inativo

**Files:**
- Create: `apps/usinagem/lib/dominio/seguranca/login.ts`
- Test: `apps/usinagem/lib/dominio/seguranca/login.test.ts`
- Create: `apps/usinagem/lib/servidor/auth-config.ts`
- Create: `apps/usinagem/lib/servidor/auth.ts`
- Create: `apps/usinagem/lib/servidor/usuarios-auth.ts`
- Test: `apps/usinagem/lib/servidor/auth.test.ts`

**Interfaces:**
- Consumes: `schema` (1A + Task 1), `urlLocal`, `reautenticacaoRecente`, `REAUTENTICACAO_MAX_MS` (1B).
- Produces:
  - `registroLogin(d: { email: string; sucesso: boolean; ip: string | null; userAgent: string | null; usuarioId: string | null })` (linha de `eventos_auditoria`, sem senha);
  - `exigeReautenticacao(sessaoCriadaEm: Date | null, agora: Date): boolean`;
  - `criarAuth({ banco, plugins? })`;
  - `type Auth`;
  - `auth(): Auth` (instância do app, lazy);
  - `criarUsuarioComSenha(a: Auth, banco, d: { nome; email; senha; perfil: Perfil; ficticio: boolean }): Promise<string>`.

- [ ] **Step 1: Testes puros que falham**

`lib/dominio/seguranca/login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exigeReautenticacao, registroLogin } from "./login";

describe("auditoria de login", () => {
  it("sucesso e falha viram eventos distintos, sem senha", () => {
    const ok = registroLogin({ email: "A@X.invalid", sucesso: true, ip: "127.0.0.1", userAgent: "ua", usuarioId: "u1" });
    const ko = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: null, usuarioId: null });
    expect(ok.operacao).toBe("login_sucesso");
    expect(ko.operacao).toBe("login_falha");
    expect(ok.depois).toEqual({ email: "a@x.invalid", ip: "127.0.0.1", userAgent: "ua" });
    expect(JSON.stringify([ok, ko])).not.toMatch(/senha|password/i);
  });
});

describe("reautenticação recente", () => {
  const agora = new Date("2026-10-24T10:20:00Z");
  it("sessão de 5 minutos não exige", () => {
    expect(exigeReautenticacao(new Date("2026-10-24T10:15:00Z"), agora)).toBe(false);
  });
  it("sessão de 11 minutos exige", () => {
    expect(exigeReautenticacao(new Date("2026-10-24T10:09:00Z"), agora)).toBe(true);
  });
  it("sem sessão real (seletor de dev) exige sempre: falha fechado", () => {
    expect(exigeReautenticacao(null, agora)).toBe(true);
  });
});
```

Run: `pnpm test lib/dominio/seguranca/login.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 2: Implementar `login.ts`**

```ts
import { reautenticacaoRecente } from "../usuarios/admin";

export function registroLogin(d: {
  email: string; sucesso: boolean; ip: string | null; userAgent: string | null; usuarioId: string | null;
}) {
  return {
    autorId: d.usuarioId,
    operacao: d.sucesso ? "login_sucesso" : "login_falha",
    entidade: "usuarios",
    entidadeId: d.usuarioId,
    antes: null,
    depois: { email: d.email.trim().toLowerCase(), ip: d.ip, userAgent: d.userAgent },
    justificativa: null,
  };
}

/** Sem sessão Better Auth (null) conta como velha: o seletor de dev nunca faz ação sensível. */
export const exigeReautenticacao = (sessaoCriadaEm: Date | null, agora: Date): boolean =>
  !sessaoCriadaEm || !reautenticacaoRecente(sessaoCriadaEm, agora);
```

Run: `pnpm test lib/dominio/seguranca/login.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste de integração que falha**

`lib/servidor/auth.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { criarAuth } from "./auth-config";
import { criarUsuarioComSenha } from "./usuarios-auth";

// Mesma política do 1A: no CI, banco ou segredo ausente falha em vez de pular.
if (process.env.CI && !process.env.BETTER_AUTH_SECRET) throw new Error("Testes de auth exigem BETTER_AUTH_SECRET no CI.");
const pronto = bancoDisponivel() && Boolean(process.env.BETTER_AUTH_SECRET);

describe.skipIf(!pronto)("Better Auth contra o Postgres local", () => {
  const banco = pronto ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  const a = pronto ? criarAuth({ banco }) : undefined!;
  const email = `teste-${randomUUID()}@ficticio.invalid`;
  const senha = "senha-ficticia-de-teste-123";
  afterAll(async () => {
    await banco.$client.end();
  });

  const eventos = (operacao: string) =>
    banco.select().from(schema.eventosAuditoria).where(and(eq(schema.eventosAuditoria.operacao, operacao)));

  it("cadastro público é recusado", async () => {
    await expect(a.api.signUpEmail({ body: { email: `x-${email}`, password: senha, name: "x" } })).rejects.toThrow();
  });

  it("login com sucesso cria sessão e audita, sem senha", async () => {
    const id = await criarUsuarioComSenha(a, banco, { nome: "[FICTÍCIO] Teste Login", email, senha, perfil: "comercial", ficticio: true });
    const r = await a.api.signInEmail({ body: { email, password: senha } });
    expect(r.user.id).toBe(id);
    const ev = (await eventos("login_sucesso")).filter((e) => e.entidadeId === id);
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(ev)).not.toContain(senha);
  });

  it("login com senha errada é recusado e auditado", async () => {
    await expect(a.api.signInEmail({ body: { email, password: "errada-errada-123" } })).rejects.toThrow();
    const ev = (await eventos("login_falha")).filter((e) => (e.depois as { email?: string })?.email === email);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(ev)).not.toContain("errada-errada-123");
  });

  it("usuário inativo não obtém sessão", async () => {
    await banco.update(schema.usuarios).set({ ativo: false }).where(eq(schema.usuarios.email, email));
    await expect(a.api.signInEmail({ body: { email, password: senha } })).rejects.toThrow();
  });
});
```

Run: `pnpm test lib/servidor/auth.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 4: Fábrica de auth**

`lib/servidor/auth-config.ts` (sem `server-only`; o teste importa):

```ts
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { registroLogin } from "../dominio/seguranca/login";
import { REAUTENTICACAO_MAX_MS } from "../dominio/usuarios/admin";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;

export function criarAuth({ banco, plugins = [] }: { banco: Banco; plugins?: BetterAuthPlugin[] }) {
  return betterAuth({
    database: drizzleAdapter(banco, { provider: "pg", schema }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    session: {
      modelName: "sessoes",
      freshAge: REAUTENTICACAO_MAX_MS / 1000,
    },
    account: { modelName: "contas" },
    verification: { modelName: "verificacoes" },
    user: {
      modelName: "usuarios",
      fields: {
        name: "nome",
        emailVerified: "emailVerificado",
        image: "imagem",
        createdAt: "criadoEm",
        updatedAt: "atualizadoEm",
      },
      additionalFields: {
        perfilId: { type: "string", required: true, input: false },
        ativo: { type: "boolean", required: false, defaultValue: true, input: false },
        ficticio: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    // ponytail: limite em memória, uma instância só; storage "database" quando houver mais de uma.
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    databaseHooks: {
      session: {
        create: {
          // Usuário inativo nunca recebe sessão.
          before: async (sessao) => {
            const [u] = await banco.select({ ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.id, sessao.userId));
            return u?.ativo ? { data: sessao } : false;
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const sucesso = !isAPIError(ctx.context.returned) && Boolean(ctx.context.newSession);
        await banco.insert(schema.eventosAuditoria).values(
          registroLogin({
            email: String((ctx.body as { email?: unknown } | undefined)?.email ?? ""),
            sucesso,
            ip: ctx.request?.headers.get("x-forwarded-for") ?? null,
            userAgent: ctx.request?.headers.get("user-agent") ?? null,
            usuarioId: ctx.context.newSession?.user.id ?? null,
          }),
        );
      }),
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof criarAuth>;
```

- [ ] **Step 5: Instância do app**

`lib/servidor/auth.ts`:

```ts
import "server-only";
import { nextCookies } from "better-auth/next-js";
import { criarAuth, type Auth } from "./auth-config";
import { db } from "./db";

let instancia: Auth | undefined;

// Lazy pelo mesmo motivo do db(): `next build` importa sem segredo nem banco.
// nextCookies() precisa ser o último plugin.
export function auth(): Auth {
  instancia ??= criarAuth({ banco: db(), plugins: [nextCookies()] });
  return instancia;
}
```

- [ ] **Step 6: Criação de usuário com senha (servidor)**

`lib/servidor/usuarios-auth.ts`:

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Perfil } from "../dominio/permissoes/perfis";
import type { Auth } from "./auth-config";
import * as schema from "./db/schema";

/** Padrão do plugin admin do Better Auth: cria usuário, guarda o hash e vincula a conta "credential". */
export async function criarUsuarioComSenha(
  a: Auth,
  banco: NodePgDatabase<typeof schema>,
  d: { nome: string; email: string; senha: string; perfil: Perfil; ficticio: boolean },
): Promise<string> {
  if (d.senha.length < 12) throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  const ctx = await a.$context;
  const usuario = await ctx.internalAdapter.createUser({
    email: d.email.trim().toLowerCase(),
    name: d.nome,
    perfilId: d.perfil,
    ativo: true,
    ficticio: d.ficticio,
  });
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: usuario.id,
    userId: usuario.id,
    password: await ctx.password.hash(d.senha),
  });
  await banco.insert(schema.eventosAuditoria).values({
    operacao: "usuario_criado",
    entidade: "usuarios",
    entidadeId: usuario.id,
    depois: { email: usuario.email, perfil: d.perfil, ficticio: d.ficticio },
  });
  return usuario.id;
}
```

- [ ] **Step 7: Rodar**

Run: `cd apps/usinagem && pnpm test lib/dominio/seguranca lib/servidor/auth.test.ts && pnpm typecheck`
Expected: PASS. Se o `tsc` acusar campo ou assinatura diferente na 1.6.33, ajustar pelo `.d.ts` em `node_modules/better-auth` e registrar o ajuste no relatório da task.

- [ ] **Step 8: Commit**

```bash
git add apps/usinagem/lib/dominio/seguranca/login.ts apps/usinagem/lib/dominio/seguranca/login.test.ts apps/usinagem/lib/servidor/auth-config.ts apps/usinagem/lib/servidor/auth.ts apps/usinagem/lib/servidor/usuarios-auth.ts apps/usinagem/lib/servidor/auth.test.ts
git commit -m "feat(usinagem): Better Auth com login auditado, cadastro fechado e bloqueio de inativo"
```

### Task 3: Handler, `proxy.ts`, sessão real, `/entrar` e sair

**Files:**
- Create: `apps/usinagem/app/api/auth/[...all]/route.ts`
- Modify: `apps/usinagem/scripts/cobertura-acoes.ts` (`ROTAS_ISENTAS`)
- Create: `apps/usinagem/proxy.ts`
- Modify: `apps/usinagem/lib/servidor/sessao.ts`
- Create: `apps/usinagem/lib/servidor/auth-cliente.ts`
- Create: `apps/usinagem/app/entrar/page.tsx`
- Create: `apps/usinagem/app/entrar/FormEntrar.tsx`
- Create: `apps/usinagem/app/entrar/acoes.ts`

**Interfaces:**
- Consumes: `auth()`, `exigeReautenticacao`, `acaoPublica` (1B), `seletorDevAtivo` (1B).
- Produces:
  - `usuarioAtual()` agora com sessão Better Auth;
  - `requirePermissaoSensivel(p: Permissao): Promise<UsuarioSessao>`;
  - `class ErroReautenticacao extends ErroPermissao`;
  - ação `sair`.

- [ ] **Step 1: Ler a doc do Next antes do `proxy.ts`**

Ler `apps/usinagem/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, em especial o export `proxy` e o `config.matcher`.

- [ ] **Step 2: Handler isento, com motivo**

`app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/servidor/auth";

// Isento do wrapper rota(): é o próprio endpoint de autenticação, com rate limit do Better Auth.
// Cadastro público desligado (disableSignUp). Ver ROTAS_ISENTAS.
export const GET = (req: Request) => toNextJsHandler(auth()).GET(req);
export const POST = (req: Request) => toNextJsHandler(auth()).POST(req);
```

Em `scripts/cobertura-acoes.ts`:

```ts
/** Rotas que não passam pelo wrapper, com motivo. */
export const ROTAS_ISENTAS: readonly string[] = [
  // Endpoint do Better Auth: autentica, não pode exigir sessão. Rate limit e disableSignUp no auth-config.ts.
  "app/api/auth/[...all]/route.ts",
];
```

- [ ] **Step 3: `proxy.ts` (barreira otimista; a autoritativa é o `requirePermissao`)**

```ts
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Seletor de dev: sem cookie do Better Auth; quem barra é o requirePermissao.
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_SWITCHER === "1") return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  // Fora do gate: login, endpoint de auth, assets e /dev (sem rota em produção: 404, não redirect).
  matcher: ["/((?!entrar|api/auth|dev/|_next/static|_next/image|favicon\\.ico).*)"],
};
```

- [ ] **Step 4: Sessão real em `sessao.ts`**

`lib/servidor/sessao.ts` passa a ser:

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decidirAcesso, type UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import type { Perfil } from "../dominio/permissoes/perfis";
import { seletorDevAtivo } from "../dominio/seguranca/dev";
import { exigeReautenticacao } from "../dominio/seguranca/login";
import { auth } from "./auth";
import { db } from "./db";
import { perfilPermissoes, usuarios } from "./db/schema";

export class ErroPermissao extends Error {
  constructor(readonly status: 401 | 403, mensagem?: string) {
    super(mensagem ?? (status === 401 ? "Sessão ausente." : "Sem permissão para esta ação."));
  }
}

export class ErroReautenticacao extends ErroPermissao {
  constructor() {
    super(403, "Confirme sua senha para continuar.");
  }
}

async function sessaoReal() {
  return auth().api.getSession({ headers: await headers() });
}

export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const s = await sessaoReal();
  if (s) {
    const [u] = await db()
      .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
      .from(usuarios)
      .where(and(eq(usuarios.id, s.user.id), eq(usuarios.ativo, true)));
    return u ? { ...u, perfil: u.perfil as Perfil } : null;
  }
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

/** usuarios.gerenciar e permissoes.gerenciar: sessão real com menos de 10 minutos. Seletor de dev nunca passa. */
export async function requirePermissaoSensivel(permissao: Permissao): Promise<UsuarioSessao> {
  const usuario = await requirePermissao(permissao);
  const s = await sessaoReal();
  if (exigeReautenticacao(s ? new Date(s.session.createdAt) : null, new Date())) throw new ErroReautenticacao();
  return usuario;
}
```

- [ ] **Step 5: Cliente de auth, `/entrar` e sair**

`lib/servidor/auth-cliente.ts`:

```ts
import { createAuthClient } from "better-auth/react";

// Mesmo domínio: baseURL implícito.
export const authCliente = createAuthClient();
```

`app/entrar/FormEntrar.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authCliente } from "@/lib/servidor/auth-cliente";

// Funcional e sem estilo próprio: o visual vem do /impeccable shape da 1C.
export function FormEntrar() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(form: FormData) {
    setEnviando(true);
    setErro(null);
    const { error } = await authCliente.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("senha") ?? ""),
    });
    setEnviando(false);
    // Mensagem única: não revela se o e-mail existe.
    if (error) return setErro("E-mail ou senha incorretos.");
    router.replace("/");
  }

  return (
    <form action={enviar}>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="senha">Senha</label>
      <input id="senha" name="senha" type="password" autoComplete="current-password" required minLength={12} />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={enviando}>{enviando ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
```

`app/entrar/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FormEntrar } from "./FormEntrar";

export const metadata: Metadata = { title: "Entrar | ERP Express" };

export default function Page() {
  return (
    <main>
      <h1>Entrar</h1>
      <FormEntrar />
    </main>
  );
}
```

`app/entrar/acoes.ts`:

```ts
"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acaoPublica } from "@/lib/servidor/acao";
import { auth } from "@/lib/servidor/auth";

// Pública: encerrar a própria sessão não exige permissão.
export const sair = acaoPublica(z.object({}), async () => {
  await auth().api.signOut({ headers: await headers() });
  redirect("/entrar");
});
```

- [ ] **Step 6: Verificar**

Run: `cd apps/usinagem && pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tudo limpo. O teste de cobertura aceita `acoes.ts` (via `acaoPublica`) e a rota isenta.

Run, com o banco no ar e o Admin fictício criado pela Task 5:

```bash
pnpm dev &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/entrar
```

Expected: `307` (redireciona para `/entrar`) e `200`.

- [ ] **Step 7: Commit**

```bash
git add apps/usinagem/app/api apps/usinagem/scripts/cobertura-acoes.ts apps/usinagem/proxy.ts apps/usinagem/lib/servidor/sessao.ts apps/usinagem/lib/servidor/auth-cliente.ts apps/usinagem/app/entrar
git commit -m "feat(usinagem): login, sair, proxy e reautenticação recente nas ações sensíveis"
```

### Task 4: Seletor de perfil de dev fora do build de produção

**Files:**
- Modify: `apps/usinagem/next.config.ts`
- Create: `apps/usinagem/app/dev/perfil/page.dev.tsx`
- Create: `apps/usinagem/app/dev/perfil/acoes.dev.ts`
- Create: `apps/usinagem/app/dev/perfil/BotaoPerfil.dev.tsx`
- Create: `apps/usinagem/scripts/verificar-build-producao.sh` (modo 755)
- Modify: `.github/workflows/usinagem.yml`

**Interfaces:**
- Consumes: `seletorDevAtivo`, `COOKIE_USUARIO_DEV`, `acaoPublica`, `db()`.
- Produces: rota `/dev/perfil`, só com o gate ligado; script `verificar-build-producao.sh` (sai com código ≠ 0 se a rota responder algo diferente de 404 ou se o nome do cookie estiver no bundle).

- [ ] **Step 1: Ler a doc**

Ler `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/pageExtensions.md`.

- [ ] **Step 2: `next.config.ts`**

```ts
import type { NextConfig } from "next";
import { seletorDevAtivo } from "./lib/dominio/seguranca/dev";

const nextConfig: NextConfig = {
  // `page.dev.tsx` só vira rota com o gate ligado; em qualquer outro caso o arquivo não é rota e não entra no build.
  pageExtensions: seletorDevAtivo(process.env) ? ["dev.tsx", "dev.ts", "tsx", "ts"] : ["tsx", "ts"],
};

export default nextConfig;
```

- [ ] **Step 3: Página e ação do seletor**

`app/dev/perfil/acoes.dev.ts`:

```ts
"use server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { seletorDevAtivo } from "@/lib/dominio/seguranca/dev";
import { acaoPublica } from "@/lib/servidor/acao";
import { db } from "@/lib/servidor/db";
import { usuarios } from "@/lib/servidor/db/schema";
import { COOKIE_USUARIO_DEV } from "@/lib/servidor/sessao-dev";

// Pública porque escolhe a própria identidade de dev; o gate e o filtro de fictício são a barreira.
export const escolherPerfil = acaoPublica(z.object({ id: z.uuid() }), async ({ id }) => {
  if (!seletorDevAtivo(process.env)) throw new Error("Seletor de dev desligado.");
  const [u] = await db().select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.ficticio, true)));
  if (!u) throw new Error("Usuário fictício não encontrado.");
  (await cookies()).set(COOKIE_USUARIO_DEV, u.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
});
```

`app/dev/perfil/BotaoPerfil.dev.tsx` (client; ação em arquivo próprio, nunca `"use server"` inline):

```tsx
"use client";
import { escolherPerfil } from "./acoes.dev";

export function BotaoPerfil({ id, rotulo }: { id: string; rotulo: string }) {
  return (
    <button type="button" aria-label={`Entrar como ${rotulo}`} onClick={() => escolherPerfil({ id })}>
      {rotulo}
    </button>
  );
}
```

`app/dev/perfil/page.dev.tsx`:

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { NOME_PERFIL, type Perfil } from "@/lib/dominio/permissoes/perfis";
import { seletorDevAtivo } from "@/lib/dominio/seguranca/dev";
import { db } from "@/lib/servidor/db";
import { usuarios } from "@/lib/servidor/db/schema";
import { BotaoPerfil } from "./BotaoPerfil.dev";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!seletorDevAtivo(process.env)) notFound();
  const lista = await db().select().from(usuarios).where(eq(usuarios.ficticio, true));
  return (
    <main>
      <h1>Seletor de perfil (somente desenvolvimento, dados fictícios)</h1>
      <ul>
        {lista.map((u) => (
          <li key={u.id}>
            <BotaoPerfil id={u.id} rotulo={`${u.nome} (${NOME_PERFIL[u.perfilId as Perfil]})`} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Script de verificação do build de produção**

`scripts/verificar-build-producao.sh`:

```bash
#!/usr/bin/env bash
# Prova que o seletor de dev não existe em produção, mesmo com ENABLE_DEV_SWITCHER=1.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .next
ENABLE_DEV_SWITCHER=1 pnpm build

if grep -rl "usinagem_dev_usuario" .next --include=*.js --include=*.json --include=*.html >/dev/null; then
  echo "FALHA: o nome do cookie de dev está no bundle de produção." >&2
  exit 1
fi

PORTA=3999
ENABLE_DEV_SWITCHER=1 pnpm start -p "$PORTA" >/dev/null 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:$PORTA/entrar" && break
  sleep 1
done

codigo=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTA/dev/perfil")
if [ "$codigo" != "404" ]; then
  echo "FALHA: /dev/perfil respondeu $codigo em produção (esperado 404)." >&2
  exit 1
fi
echo "OK: seletor de dev ausente do build de produção."
```

Run: `cd apps/usinagem && chmod 755 scripts/verificar-build-producao.sh && bash scripts/verificar-build-producao.sh`
Expected: `OK: seletor de dev ausente do build de produção.`

Prova negativa (não commitar): trocar temporariamente o `pageExtensions` para incluir sempre `dev.tsx` e rodar o script.
Expected: `FALHA`. Desfazer a troca em seguida.

- [ ] **Step 5: Seletor funcionando em dev**

Run: `ENABLE_DEV_SWITCHER=1 pnpm dev` e abrir `/dev/perfil`.
Expected: lista os 5 usuários fictícios. Sem `ENABLE_DEV_SWITCHER=1`, `/dev/perfil` responde 404.

- [ ] **Step 6: CI**

Em `.github/workflows/usinagem.yml`, no bloco `env` do job:

```yaml
      # Segredo descartável do CI, valor de teste, diferente do local.
      BETTER_AUTH_SECRET: ci_better_auth_descartavel_0123456789abcdef
      BETTER_AUTH_URL: http://localhost:3999
```

E depois do passo `pnpm test`:

```yaml
      - run: bash scripts/verificar-build-producao.sh
```

- [ ] **Step 7: Commit**

```bash
git add apps/usinagem/next.config.ts apps/usinagem/app/dev apps/usinagem/scripts/verificar-build-producao.sh .github/workflows/usinagem.yml
git commit -m "feat(usinagem): seletor de perfil de dev excluído do build de produção, com verificação no CI"
```

### Task 5: Script local de criação do Admin real

**Files:**
- Create: `apps/usinagem/scripts/criar-usuario.ts`
- Modify: `apps/usinagem/package.json` (script `usuario:criar`)

**Interfaces:**
- Consumes: `criarAuth`, `criarUsuarioComSenha`, `urlLocal`, `PERFIS`.

- [ ] **Step 1: Script**

`scripts/criar-usuario.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { text } from "node:stream/consumers";
import { PERFIS, type Perfil } from "../lib/dominio/permissoes/perfis";
import { criarAuth } from "../lib/servidor/auth-config";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { criarUsuarioComSenha } from "../lib/servidor/usuarios-auth";

// Uso: printf '%s' "$SENHA" | pnpm usuario:criar "<nome>" <email> <perfil> [--ficticio]
// A senha chega só pela entrada padrão: nunca por argumento (fica no histórico do shell) nem por arquivo do repo.
const [nome, email, perfil, flag] = process.argv.slice(2);
if (!nome || !email || !PERFIS.includes(perfil as Perfil)) {
  console.error(`Uso: printf '%s' "$SENHA" | pnpm usuario:criar "<nome>" <email> <${PERFIS.join("|")}> [--ficticio]`);
  process.exit(1);
}
const senha = (await text(process.stdin)).trim();
const banco = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
try {
  const id = await criarUsuarioComSenha(criarAuth({ banco }), banco, {
    nome, email, senha, perfil: perfil as Perfil, ficticio: flag === "--ficticio",
  });
  console.log(`Usuário criado: ${id}`);
} finally {
  await banco.$client.end();
}
```

Em `package.json`, `scripts`:

```json
    "usuario:criar": "node --env-file=.env.local --import tsx scripts/criar-usuario.ts"
```

- [ ] **Step 2: Testar com usuário fictício**

```bash
cd apps/usinagem
printf '%s' 'senha-ficticia-local-123' | pnpm usuario:criar "[FICTÍCIO] Admin Login" admin-login@ficticio.invalid admin --ficticio
```

Expected: `Usuário criado: <uuid>`. Login em `/entrar` com esse e-mail funciona; senha errada mostra "E-mail ou senha incorretos." e grava `login_falha`.

- [ ] **Step 3: Commit**

```bash
git add apps/usinagem/scripts/criar-usuario.ts apps/usinagem/package.json
git commit -m "feat(usinagem): script local de criação de usuário com senha pela entrada padrão"
```

- [ ] **Step 4: Gate final**

Run: `cd apps/usinagem && pnpm test && pnpm typecheck && pnpm lint && bash scripts/verificar-build-producao.sh`
Expected: tudo limpo e `OK: seletor de dev ausente do build de produção.`

O Admin real (o dono da Express) só é criado com dados reais depois do gate de produção da spec. Até lá, só usuários fictícios.
