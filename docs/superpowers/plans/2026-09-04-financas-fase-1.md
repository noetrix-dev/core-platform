# Painel Financeiro Pessoal — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `apps/financas` com Contas, Lançamentos (manual + import OFX), Cockpit (6 KPIs, roscas de categoria/distribuição, 50/30/20 comparativo, saldo projetado, alerta, próximas contas, bloco Noetrix, bloco Cartões manual, últimos lançamentos) e Dívidas, como app sibling no monorepo `noetrix-platform`.

**Architecture:** App Next 16 / React 19 / Tailwind 4 no pnpm workspace + Turborepo. Camada de dados Path A (`financasDb()` service-role, `db:{schema:"financas"}`, só no servidor) e autenticação `@supabase/ssr` (`requireUser()` + `proxy.ts`) copiadas verbatim do `apps/studiold`. RSC lê, Server Actions mutam com `revalidatePath`. Todo cálculo derivado (50/30/20, saldo projetado, progresso de dívida, parcelas, recorrentes, parse OFX, dedupe) é função pura em `lib/`, coberta por `assert` puro rodado com `node --experimental-strip-types`.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5, Tailwind CSS 4, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, `server-only`, pnpm 9.15.9, Supabase (Postgres, projeto `nnybwmuhkaobsdtzospc`).

**Spec:** `docs/superpowers/specs/2026-09-04-financas-fase-1-design.md`

## Global Constraints

- Stack fixa: Next `16.3.3`, React `19.2.8`, `eslint-config-next` `16.3.3`, Tailwind `^4`, `@tailwindcss/postcss` `^4`, `@supabase/ssr` `^0.12.5`, `@supabase/supabase-js` `^2.112.4`, `server-only` `^0.0.1`, `typescript` `^5`, `packageManager` `pnpm@9.15.9`.
- Path A: `lib/supabase/server.ts` usa service-role e nunca pode ser importado no client (guard `if (typeof window !== "undefined") throw`). Nenhum SQL cru nos apps — só query builder ou RPC.
- Sem RLS no schema `financas`. Isolamento = service-role só no servidor + gate de sessão.
- `requireUser()` no topo de **toda** página protegida e de **toda** Server Action. Qualquer sessão autenticada = Ewerton (usuário único, criado à mão no dashboard, sem signup/reset no app).
- Toda alteração de schema entra por migration nova. Cada arquivo SQL termina com `GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;` + as variantes SEQUENCES/FUNCTIONS + `NOTIFY pgrst, 'reload schema';`.
- Todas as tabelas: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>'`, `criado_em`/`atualizado_em TIMESTAMPTZ DEFAULT now()`. Prefixo `fin_`.
- `fin_transactions.amount` e `fin_recurring_templates.amount`: `NUMERIC(14,2)` sempre positivo (`CHECK (amount > 0)`); o sinal vem de `movement`.
- Status `overdue` é derivado na leitura (`pending` com `due_date < hoje`), nunca setado no fluxo normal — só pela ação manual "recalcular atrasados".
- Toda Server Action: `try/catch`, `console.error` no servidor, retorno `{ ok: false, erro: <mensagem pt-BR genérica> }` — nunca vaza texto do Postgres para a UI.
- UI 100% pt-BR, mobile-first. A direção visual de cada superfície vem do `/impeccable shape` daquela rota (rodado pelo Ewerton entre este plano e a execução); as tasks de UI ligam estrutura, dados e estados — não inventam tratamento visual.
- Gate antes de concluir qualquer task: `pnpm --filter financas typecheck`, `pnpm --filter financas lint`, `pnpm --filter financas build`, `pnpm --filter financas check` (quando houver funções puras), revisão do diff contra o escopo da task, zero secret no working tree.
- Commits em português, imperativo, prefixo Conventional Commits. Cada commit fecha com:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01U11CBKuJMhJwaEJ3ASUoa3
  ```

---

## File Structure

**Scaffold / infra**
- `apps/financas/package.json` — deps e scripts (`dev`, `build`, `lint`, `typecheck`, `check`).
- `apps/financas/tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore` — cópias do `studiold`.
- `apps/financas/app/globals.css` — `@import "tailwindcss"` + tokens base + fontes Barlow.
- `apps/financas/app/layout.tsx` — root layout, `next/font/google` Barlow + Barlow Condensed, `lang="pt-BR"`.
- `apps/financas/.env.local` — **não versionado**; criado à mão (ver Task 2).

**Camada de dados e auth (cópias do `studiold`, adaptadas)**
- `apps/financas/lib/supabase/server.ts` — `financasDb()`, service-role, `db:{schema:"financas"}`.
- `apps/financas/lib/supabase/auth.ts` — `authServer()`, `requireUser()`, `getUserOpcional()`.
- `apps/financas/lib/supabase/client.ts` — `browserSupabase` (anon).
- `apps/financas/proxy.ts` — gate de rota.
- `apps/financas/app/login/{page.tsx,actions.ts,LoginForm.tsx}` — login.

**Migrations (draft → depois copiadas para `infra/supabase/migrations/`)**
- `docs/migrations-draft/2026-09-04-01-create-schema-financas.sql`
- `docs/migrations-draft/2026-09-04-02-fn-registrar-pagamento-divida.sql`
- `docs/migrations-draft/2026-09-04-03-seed-financas.sql`
- `docs/migrations-draft/2026-09-04-04-financas-cockpit-extra.sql` — `fatura_atual`/`limite_disponivel` em `fin_accounts` + `fin_noetrix_metrics` (Task 3b, adicionada depois do `/impeccable shape` do Cockpit).

**Fundação de tipos e lógica pura**
- `apps/financas/lib/financas/types.ts` — unions e row types compartilhados.
- `apps/financas/lib/datas.ts` — `somaMesesISO`, `fimDoMesISO`, `hojeISO`.
- `apps/financas/lib/financas.check.ts` — harness de `assert`, importa e exercita todo módulo puro.

**Lógica pura de domínio**
- `apps/financas/lib/lancamentos/parcelas.ts` — `expandirParcelas`.
- `apps/financas/lib/lancamentos/recorrentes.ts` — `gerarTransacoesDoMes`.
- `apps/financas/lib/lancamentos/overdue.ts` — `derivarStatus`.
- `apps/financas/lib/cockpit/agrega.ts` — `agregarMes`.
- `apps/financas/lib/cockpit/split.ts` — `calcularSplit`.
- `apps/financas/lib/cockpit/projecao.ts` — `calcularProjecao`.
- `apps/financas/lib/cockpit/roscas.ts` — `calcularKpis`, `agregarPorCategoria`, `agregarDistribuicao` (Task 8b).
- `apps/financas/lib/dividas/progresso.ts` — `progressoDivida`, `progressoAgregado`.
- `apps/financas/lib/import/ofx.ts` — `parseOfx`.
- `apps/financas/lib/import/dedupe.ts` — `hashTransacao`, `classificar`.

**Telas (load + actions + UI)**
- `apps/financas/lib/configuracoes/load.ts` + `app/configuracoes/{page.tsx,actions.ts}` + `components/configuracoes/*` (inclui `SecaoNoetrix.tsx` — Task 13 revisada).
- `apps/financas/lib/lancamentos/load.ts` + `app/lancamentos/{page.tsx,actions.ts}` + `components/lancamentos/*`.
- `apps/financas/app/lancamentos/importar/{page.tsx,actions.ts}` + `components/lancamentos/FilaRevisao.tsx`.
- `apps/financas/lib/cockpit/load.ts` + `app/cockpit/page.tsx` + `components/cockpit/*` (Task 16 revisada: hero+ticker de KPIs, 2 roscas, próximas contas, bloco Noetrix, bloco cartões, últimos lançamentos).
- `apps/financas/lib/dividas/load.ts` + `app/dividas/{page.tsx,actions.ts}` + `components/dividas/*`.
- `apps/financas/components/Shell.tsx` + `components/Topbar.tsx` + `components/LogoutButton.tsx`.

---

## Task 1: Scaffold do app `apps/financas`

**Files:**
- Create: `apps/financas/package.json`
- Create: `apps/financas/tsconfig.json`
- Create: `apps/financas/next.config.ts`
- Create: `apps/financas/postcss.config.mjs`
- Create: `apps/financas/eslint.config.mjs`
- Create: `apps/financas/.gitignore`
- Create: `apps/financas/app/globals.css`
- Create: `apps/financas/app/layout.tsx`
- Create: `apps/financas/app/page.tsx` (temporário)

**Interfaces:**
- Consumes: nada.
- Produces: workspace `financas` buildável; scripts `pnpm --filter financas {dev,build,lint,typecheck}`.

- [ ] **Step 1: Criar `apps/financas/package.json`**

```json
{
  "name": "financas",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "check": "node --experimental-strip-types lib/financas.check.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.12.5",
    "@supabase/supabase-js": "^2.112.4",
    "next": "16.3.3",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.3",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "packageManager": "pnpm@9.15.9"
}
```

- [ ] **Step 2: Criar os arquivos de config (cópias exatas do `apps/studiold`)**

`apps/financas/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/financas/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`apps/financas/postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

`apps/financas/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

`apps/financas/.gitignore` — copiar byte a byte `apps/studiold/.gitignore`.

- [ ] **Step 3: Criar `apps/financas/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-barlow), system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-barlow), system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

- [ ] **Step 4: Criar `apps/financas/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const barlowCond = Barlow_Condensed({
  variable: "--font-barlow-cond",
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finanças",
  description: "Painel financeiro pessoal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${barlow.variable} ${barlowCond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Criar `apps/financas/app/page.tsx` (temporário — substituído na Task 2)**

```tsx
export default function Home() {
  return <main className="p-6">financas — scaffold</main>;
}
```

- [ ] **Step 6: Instalar e buildar**

Run: `pnpm install` (na raiz do monorepo) depois `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`
Expected: os três passam; o build gera a rota `/`.

- [ ] **Step 7: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): scaffold do app Next 16 no monorepo"
```

---

## Task 2: Camada de dados, autenticação e login

**Files:**
- Create: `apps/financas/lib/supabase/server.ts`
- Create: `apps/financas/lib/supabase/auth.ts`
- Create: `apps/financas/lib/supabase/client.ts`
- Create: `apps/financas/proxy.ts`
- Create: `apps/financas/app/login/page.tsx`
- Create: `apps/financas/app/login/actions.ts`
- Create: `apps/financas/app/login/LoginForm.tsx`
- Modify: `apps/financas/app/page.tsx` (vira `redirect("/cockpit")`)
- Create: `apps/financas/app/cockpit/page.tsx` (stub protegido — substituído na Task 15)

**Interfaces:**
- Consumes: scaffold da Task 1.
- Produces:
  - `financasDb(): SupabaseClient` — service-role, `db:{schema:"financas"}`. Import só server.
  - `authServer(): Promise<SupabaseClient>` — client ligado aos cookies da request (anon).
  - `requireUser(): Promise<User>` — redireciona para `/login` se não houver sessão.
  - `getUserOpcional(): Promise<User | null>`.
  - `browserSupabase` — client anon para o browser.

- [ ] **Step 1: Criar `apps/financas/lib/supabase/server.ts`**

```ts
// Cliente Supabase SÓ para o servidor (RSC, Server Actions, Route Handlers).
// service-role key, fala direto com o schema financas. Nunca importar do client.
//
// Segurança (path A): não há RLS no schema financas nem autorização no app além
// do gate de sessão. O isolamento é: a service-role key nunca chega ao browser e
// todo acesso ao schema passa por aqui.

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/server.ts foi importado no cliente");
}

const SCHEMA = "financas";

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: SCHEMA },
  });
}

let cached: ReturnType<typeof makeClient> | null = null;

export function financasDb(): ReturnType<typeof makeClient> {
  if (!cached) cached = makeClient();
  return cached;
}
```

- [ ] **Step 2: Criar `apps/financas/lib/supabase/auth.ts` e `client.ts`**

`auth.ts` — copiar `apps/studiold/lib/supabase/auth.ts` **sem alterações** (o texto do comentário sobre `barbearia_001` pode ficar; não afeta comportamento — opcionalmente trocar "barbearia_001" por "financas" na frase do topo).

`client.ts` — copiar `apps/studiold/lib/supabase/client.ts` sem alterações.

- [ ] **Step 3: Criar `apps/financas/proxy.ts`**

Copiar `apps/studiold/proxy.ts` **sem alterações**, exceto o redirect de usuário já logado: trocar `destino.pathname = "/agenda"` por `destino.pathname = "/cockpit"`. Manter o mesmo `config.matcher`.

- [ ] **Step 4: Criar o login**

`apps/financas/app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { authServer } from "@/lib/supabase/auth";

export type EntrarEstado = { erro: string | null };

export async function entrar(
  _prev: EntrarEstado,
  fd: FormData,
): Promise<EntrarEstado> {
  const email = (fd.get("email") ?? "").toString().trim();
  const senha = (fd.get("senha") ?? "").toString();
  if (!email || !senha) return { erro: "Preencha e-mail e senha." };

  const supabase = await authServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) return { erro: "E-mail ou senha incorretos." };

  redirect("/cockpit");
}
```

`apps/financas/app/login/LoginForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { entrar, type EntrarEstado } from "./actions";

const INICIAL: EntrarEstado = { erro: null };

export function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          autoFocus
          className="border px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="border px-3 py-2"
        />
      </div>

      {estado.erro && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        className="border px-4 py-2 font-semibold"
        disabled={pendente}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
```

`apps/financas/app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getUserOpcional } from "@/lib/supabase/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar — Finanças" };

export default async function LoginPage() {
  if (await getUserOpcional()) redirect("/cockpit");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold">Entrar</h1>
      <p className="mb-6 text-sm opacity-70">Acesso pessoal.</p>
      <LoginForm />
    </main>
  );
}
```

> Estilo mínimo de propósito — o `/impeccable shape` de `/login` refina depois.

- [ ] **Step 5: `app/page.tsx` e stub do cockpit**

`apps/financas/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/cockpit");
}
```

`apps/financas/app/cockpit/page.tsx`:

```tsx
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  await requireUser();
  return <main className="p-6">cockpit — em construção</main>;
}
```

- [ ] **Step 6: Criar `.env.local` (manual, não versionado)**

Criar `apps/financas/.env.local` com:

```
NEXT_PUBLIC_SUPABASE_URL=<mesma URL do apps/studiold/.env.local>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<mesma anon key do apps/studiold/.env.local>
SUPABASE_SERVICE_ROLE_KEY=<mesma service-role key do apps/studiold/.env.local>
```

Sem `NEXT_PUBLIC_TENANT` (o schema é fixo em código). Confirmar que `.env*` está no `.gitignore` do app.

- [ ] **Step 7: Verificar o gate de sessão (manual, browser)**

Run: `pnpm --filter financas dev`
Checklist:
1. Abrir `/cockpit` sem sessão → redireciona para `/login`.
2. Abrir `/` sem sessão → `/login`.
3. Logar com o usuário do Ewerton (criado no dashboard do Supabase) → cai em `/cockpit` ("em construção").
4. Com sessão, abrir `/login` → redireciona para `/cockpit`.

Depois: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`.

- [ ] **Step 8: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): camada de dados path A, auth e login"
```

---

## Task 3: Drafts das migrations do schema `financas`

**Files:**
- Create: `docs/migrations-draft/2026-09-04-01-create-schema-financas.sql`
- Create: `docs/migrations-draft/2026-09-04-02-fn-registrar-pagamento-divida.sql`
- Create: `docs/migrations-draft/2026-09-04-03-seed-financas.sql`

**Interfaces:**
- Consumes: nada (SQL puro).
- Produces: o schema `financas` com 6 tabelas + índices, a RPC `financas.fn_registrar_pagamento_divida(uuid, numeric, uuid, date, text) RETURNS financas.fin_transactions`, e o seed de referência. Nomes de tabela e coluna que todas as tasks seguintes consomem.

> Estas tasks **não têm ciclo de teste automatizado** — o SQL é aplicado à mão pelo Ewerton via SQL Editor do dashboard. A entrega é o arquivo revisável + o checklist de aplicação.

- [ ] **Step 1: Criar `2026-09-04-01-create-schema-financas.sql`**

Ordem de criação por causa das FKs: `fin_accounts`, `fin_categories` → `fin_subcategories` → `fin_debts` → `fin_recurring_templates` → `fin_transactions`.

```sql
-- Painel financeiro pessoal — schema financas (Fase 1).
-- ANTES DE APLICAR: trocar <UUID_EWERTON> pelo id do auth.users do Ewerton
-- (Authentication -> Users no dashboard). Todas as colunas user_id usam esse
-- valor como DEFAULT; o app nunca preenche user_id.

CREATE SCHEMA IF NOT EXISTS financas;

CREATE TABLE financas.fin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  name TEXT NOT NULL,
  bank TEXT NOT NULL CHECK (bank IN ('inter','nubank','bradesco','btg')),
  type TEXT NOT NULL CHECK (type IN ('corrente','poupanca','investimento')),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_updated_at TIMESTAMPTZ DEFAULT now(),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','investment')),
  bucket TEXT CHECK (bucket IN ('necessidade','desejo','investimento')),
  color TEXT,
  icon TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  category_id UUID NOT NULL REFERENCES financas.fin_categories(id),
  name TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  creditor TEXT NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN ('fgts','consignado','serasa','pessoal','familia','cartao')),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  remaining_amount NUMERIC(14,2) NOT NULL CHECK (remaining_amount >= 0),
  monthly_payment NUMERIC(14,2),
  due_day INT CHECK (due_day BETWEEN 1 AND 31),
  status TEXT NOT NULL CHECK (status IN ('ativa','quitada')) DEFAULT 'ativa',
  notes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement TEXT NOT NULL CHECK (movement IN ('income','expense','investment')),
  category_id UUID REFERENCES financas.fin_categories(id),
  subcategory_id UUID REFERENCES financas.fin_subcategories(id),
  account_id UUID REFERENCES financas.fin_accounts(id),
  day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  type TEXT NOT NULL CHECK (type IN ('fixed','variable','installment')) DEFAULT 'fixed',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement TEXT NOT NULL CHECK (movement IN ('income','expense','investment')),
  type TEXT NOT NULL CHECK (type IN ('fixed','variable','installment')) DEFAULT 'variable',
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','overdue')) DEFAULT 'pending',
  account_id UUID REFERENCES financas.fin_accounts(id),
  category_id UUID REFERENCES financas.fin_categories(id),
  subcategory_id UUID REFERENCES financas.fin_subcategories(id),
  card_id UUID,
  debt_id UUID REFERENCES financas.fin_debts(id),
  installment_current INT,
  installment_total INT,
  installment_group_id UUID,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_template_id UUID REFERENCES financas.fin_recurring_templates(id),
  source TEXT NOT NULL CHECK (source IN ('manual','ofx')) DEFAULT 'manual',
  external_id TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX uq_fin_transactions_external
  ON financas.fin_transactions(user_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX idx_fin_transactions_status_due ON financas.fin_transactions(status, due_date);
CREATE INDEX idx_fin_transactions_due ON financas.fin_transactions(due_date);
CREATE INDEX idx_fin_transactions_account ON financas.fin_transactions(account_id);
CREATE INDEX idx_fin_transactions_category ON financas.fin_transactions(category_id);
CREATE INDEX idx_fin_transactions_group ON financas.fin_transactions(installment_group_id);
CREATE INDEX idx_fin_transactions_movement_due ON financas.fin_transactions(movement, due_date);

GRANT USAGE ON SCHEMA financas TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA financas TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Criar `2026-09-04-02-fn-registrar-pagamento-divida.sql`**

```sql
-- RPC transacional: registra um pagamento de dívida.
-- Insere a transação (movement=expense, debt_id) e abate remaining_amount na
-- mesma transação, com FOR UPDATE na linha da dívida. Zera -> status quitada.

CREATE OR REPLACE FUNCTION financas.fn_registrar_pagamento_divida(
  p_debt_id UUID,
  p_amount NUMERIC,
  p_account_id UUID,
  p_due_date DATE,
  p_status TEXT
) RETURNS financas.fin_transactions
LANGUAGE plpgsql
AS $$
DECLARE
  v_debt financas.fin_debts;
  v_tx financas.fin_transactions;
  v_novo_restante NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'valor invalido';
  END IF;
  IF p_status NOT IN ('pending','paid','overdue') THEN
    RAISE EXCEPTION 'status invalido';
  END IF;

  SELECT * INTO v_debt FROM financas.fin_debts WHERE id = p_debt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'divida nao encontrada';
  END IF;

  v_novo_restante := greatest(0, v_debt.remaining_amount - p_amount);

  INSERT INTO financas.fin_transactions
    (description, amount, movement, type, due_date, payment_date, status,
     account_id, debt_id, source)
  VALUES
    ('Pagamento: ' || v_debt.creditor, p_amount, 'expense', 'fixed',
     p_due_date,
     CASE WHEN p_status = 'paid' THEN p_due_date ELSE NULL END,
     p_status, p_account_id, p_debt_id, 'manual')
  RETURNING * INTO v_tx;

  UPDATE financas.fin_debts
     SET remaining_amount = v_novo_restante,
         status = CASE WHEN v_novo_restante = 0 THEN 'quitada' ELSE status END,
         atualizado_em = now()
   WHERE id = p_debt_id;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION financas.fn_registrar_pagamento_divida(UUID, NUMERIC, UUID, DATE, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Criar `2026-09-04-03-seed-financas.sql`**

```sql
-- Seed de referência da Fase 1. Números são ponto de partida; editar pela UI.

INSERT INTO financas.fin_accounts (name, bank, type, balance) VALUES
  ('Inter',    'inter',    'corrente', 0),
  ('Nubank',   'nubank',   'corrente', 0),
  ('Bradesco', 'bradesco', 'corrente', 0);

INSERT INTO financas.fin_categories (name, type, bucket) VALUES
  ('Salário CLT',            'income',     NULL),
  ('Freela',                 'income',     NULL),
  ('Noetrix',                'income',     NULL),
  ('Moradia',                'expense',    'necessidade'),
  ('Mercado',                'expense',    'necessidade'),
  ('Contas de casa',         'expense',    'necessidade'),
  ('Transporte',             'expense',    'necessidade'),
  ('Saúde',                  'expense',    'necessidade'),
  ('Educação',               'expense',    'necessidade'),
  ('Lazer',                  'expense',    'desejo'),
  ('Restaurantes',           'expense',    'desejo'),
  ('Assinaturas',            'expense',    'desejo'),
  ('Compras',                'expense',    'desejo'),
  ('Aporte investimento',    'investment', 'investimento'),
  ('Reserva de emergência',  'investment', 'investimento');

INSERT INTO financas.fin_debts (creditor, grupo, total_amount, remaining_amount, monthly_payment) VALUES
  ('Empréstimo consignado',   'consignado', 22000.00, 22000.00, 900.00),
  ('Saque-aniversário FGTS',  'fgts',        8000.00,  8000.00, NULL),
  ('Negociação Serasa',       'serasa',      9500.00,  9500.00, 400.00),
  ('Empréstimo pessoal',      'pessoal',     7891.00,  7891.00, 300.00),
  ('Dívida com família',      'familia',     4500.00,  4500.00, NULL),
  ('Rotativo de cartão',      'cartao',      5000.00,  5000.00, NULL);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Commit dos drafts**

Só os drafts em `docs/migrations-draft/`. **Não** copiar para `infra/supabase/migrations/` por ferramenta — `.claude/rules/security.md` marca esse diretório como protegido (migration é escrita e revisada à mão, via `pnpm supabase migration new <nome>`). A promoção do draft para `infra/supabase/migrations/` é passo manual do Ewerton (Step 5).

```bash
git add docs/migrations-draft
git commit -m "feat(financas): drafts das migrations do schema financas (draft)"
```

- [ ] **Step 5: Checklist de aplicação (Ewerton, manual — fora do ciclo da task)**

1. Criar o usuário no dashboard do Supabase (Authentication → Users → Add user, e-mail + senha, Auto Confirm ON). Copiar o `id`.
2. Trocar `<UUID_EWERTON>` pelo `id` nos 3 arquivos.
3. `pnpm supabase migration new financas_schema` (e para as outras duas), colar o conteúdo de cada draft no arquivo gerado em `infra/supabase/migrations/`, revisar à mão.
4. SQL Editor do dashboard: rodar `01`, depois `02`, depois `03` (ou `pnpm supabase db push`).
5. Project Settings → API → **Exposed schemas**: adicionar `financas`.
6. Conferir: `select * from financas.fin_accounts;` retorna 3 linhas; `select proname from pg_proc where proname = 'fn_registrar_pagamento_divida';` retorna 1 linha.

---

## Task 3b: Migration draft — Cartões e Noetrix no Cockpit

> Adicionada depois do `/impeccable shape` do Cockpit: os blocos Cartões
> (fatura/limite manual) e Noetrix (MRR/clientes/churn/reserva manual) entraram
> na Fase 1 (ver PRODUCT.md e spec atualizados). Mesmo regime da Task 3 —
> draft revisável à mão, sem ciclo de teste automatizado, sem tocar
> `infra/supabase/migrations/` por ferramenta.

**Files:**
- Create: `docs/migrations-draft/2026-09-04-04-financas-cockpit-extra.sql`

**Interfaces:**
- Consumes: `fin_accounts` (Task 3).
- Produces: colunas `fatura_atual`/`limite_disponivel` em `fin_accounts`; tabela
  `financas.fin_noetrix_metrics(mes, mrr, clientes_pagantes, churn_pct,
  custo_operacional, reserva_meses)`, `unique (user_id, mes)`. Nomes que a
  Task 4 (tipos) e a Task 16 (Cockpit) consomem.

- [ ] **Step 1: Criar `2026-09-04-04-financas-cockpit-extra.sql`**

```sql
-- Cockpit Fase 1 revisado: blocos Cartões (manual) e Noetrix (manual).
-- ANTES DE APLICAR: mesma ordem das migrations anteriores (depois da 01/02/03).

ALTER TABLE financas.fin_accounts
  ADD COLUMN fatura_atual NUMERIC(14,2),
  ADD COLUMN limite_disponivel NUMERIC(14,2);

CREATE TABLE financas.fin_noetrix_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  mes DATE NOT NULL,
  mrr NUMERIC(14,2) NOT NULL DEFAULT 0,
  clientes_pagantes INT NOT NULL DEFAULT 0,
  churn_pct NUMERIC(5,2),
  custo_operacional NUMERIC(14,2),
  reserva_meses NUMERIC(5,2),
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, mes)
);

GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA financas TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit do draft**

```bash
git add docs/migrations-draft
git commit -m "feat(financas): draft de migration para cartoes e noetrix no cockpit"
```

- [ ] **Step 3: Checklist de aplicação (Ewerton, manual — fora do ciclo da task)**

Mesmo fluxo da Task 3 Step 5: `<UUID_EWERTON>` já resolvido nas migrations
anteriores, então este arquivo não tem placeholder. `pnpm supabase migration
new financas_cockpit_extra`, colar o conteúdo, revisar à mão, aplicar via SQL
Editor/`db push` **depois** das migrations 01–03. Conferir:
`select fatura_atual, limite_disponivel from financas.fin_accounts limit 1;`
e `select * from financas.fin_noetrix_metrics;` (vazia é esperado até o
primeiro lançamento manual em Configurações).

---

## Task 4: Fundação de tipos, datas e harness de teste

**Files:**
- Create: `apps/financas/lib/financas/types.ts`
- Create: `apps/financas/lib/datas.ts`
- Create: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: scaffold (Task 1).
- Produces:
  - Tipos: `Movement = "income" | "expense" | "investment"`, `TxStatus = "pending" | "paid" | "overdue"`, `TxType = "fixed" | "variable" | "installment"`, `Bucket = "necessidade" | "desejo" | "investimento"`, `Grupo = "fgts" | "consignado" | "serasa" | "pessoal" | "familia" | "cartao"`.
  - Row types: `AccountRow`, `CategoryRow`, `SubcategoryRow`, `DebtRow`, `TemplateRow`, `TransactionRow`, `NoetrixMetricRow` (campos = colunas do schema, snake_case, datas como `string` ISO). `AccountRow` inclui `fatura_atual`/`limite_disponivel` (Task 3b).
  - `NovaTransacao` — shape de insert em `fin_transactions` (sem `id`/`user_id`/timestamps; todos os campos opcionais exceto `description`, `amount`, `movement`, `due_date`).
  - `somaMesesISO(iso: string, n: number): string` — soma `n` meses a uma data `YYYY-MM-DD`, faz clamp do dia no último dia do mês de destino ("2026-01-31" + 1 → "2026-02-28"), vira o ano.
  - `fimDoMesISO(iso: string): string` — último dia do mês da data dada.
  - `hojeISO(): string` — data de hoje em `America/Sao_Paulo`, formato `YYYY-MM-DD`.

- [ ] **Step 1: Escrever os asserts em `lib/financas.check.ts`**

```ts
import assert from "node:assert/strict";
import { somaMesesISO, fimDoMesISO } from "@/lib/datas";

// --- datas ---
assert.equal(somaMesesISO("2026-01-15", 1), "2026-02-15");
assert.equal(somaMesesISO("2026-01-31", 1), "2026-02-28", "clamp fev");
assert.equal(somaMesesISO("2026-11-30", 1), "2026-12-30");
assert.equal(somaMesesISO("2026-12-10", 1), "2027-01-10", "vira ano");
assert.equal(somaMesesISO("2026-01-31", 13), "2027-02-28", "clamp + ano");
assert.equal(fimDoMesISO("2026-02-10"), "2026-02-28");
assert.equal(fimDoMesISO("2024-02-10"), "2024-02-29", "bissexto");
assert.equal(fimDoMesISO("2026-07-01"), "2026-07-31");

console.log("financas.check: OK");
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter financas check`
Expected: FAIL — `Cannot find module '@/lib/datas'`.

- [ ] **Step 3: Escrever `lib/financas/types.ts`**

```ts
export type Movement = "income" | "expense" | "investment";
export type TxStatus = "pending" | "paid" | "overdue";
export type TxType = "fixed" | "variable" | "installment";
export type Bucket = "necessidade" | "desejo" | "investimento";
export type Grupo =
  | "fgts"
  | "consignado"
  | "serasa"
  | "pessoal"
  | "familia"
  | "cartao";

export type AccountRow = {
  id: string;
  name: string;
  bank: "inter" | "nubank" | "bradesco" | "btg";
  type: "corrente" | "poupanca" | "investimento";
  balance: number;
  balance_updated_at: string | null;
  fatura_atual: number | null;
  limite_disponivel: number | null;
  ativo: boolean;
};

export type NoetrixMetricRow = {
  id: string;
  mes: string;
  mrr: number;
  clientes_pagantes: number;
  churn_pct: number | null;
  custo_operacional: number | null;
  reserva_meses: number | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  type: Movement;
  bucket: Bucket | null;
  color: string | null;
  icon: string | null;
  ativo: boolean;
};

export type SubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  ativo: boolean;
};

export type DebtRow = {
  id: string;
  creditor: string;
  grupo: Grupo;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number | null;
  due_day: number | null;
  status: "ativa" | "quitada";
  notes: string | null;
};

export type TemplateRow = {
  id: string;
  description: string;
  amount: number;
  movement: Movement;
  category_id: string | null;
  subcategory_id: string | null;
  account_id: string | null;
  day_of_month: number;
  type: TxType;
  ativo: boolean;
};

export type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  movement: Movement;
  type: TxType;
  due_date: string;
  payment_date: string | null;
  status: TxStatus;
  account_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  card_id: string | null;
  debt_id: string | null;
  installment_current: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  is_recurring: boolean;
  recurring_template_id: string | null;
  source: "manual" | "ofx";
  external_id: string | null;
};

export type NovaTransacao = {
  description: string;
  amount: number;
  movement: Movement;
  due_date: string;
  type?: TxType;
  status?: TxStatus;
  payment_date?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  debt_id?: string | null;
  installment_current?: number | null;
  installment_total?: number | null;
  installment_group_id?: string | null;
  is_recurring?: boolean;
  recurring_template_id?: string | null;
  source?: "manual" | "ofx";
  external_id?: string | null;
};
```

- [ ] **Step 4: Escrever `lib/datas.ts`**

```ts
/** Datas de calendário em ISO curto (YYYY-MM-DD), sem fuso. */

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
}

function diasNoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}

function fmt(ano: number, mes1a12: number, dia: number): string {
  const mm = String(mes1a12).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

export function somaMesesISO(iso: string, n: number): string {
  const [ano, mes, dia] = partes(iso);
  const total = (ano * 12 + (mes - 1)) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const diaClamp = Math.min(dia, diasNoMes(novoAno, novoMes));
  return fmt(novoAno, novoMes, diaClamp);
}

export function fimDoMesISO(iso: string): string {
  const [ano, mes] = partes(iso);
  return fmt(ano, mes, diasNoMes(ano, mes));
}

export function hojeISO(): string {
  // en-CA dá YYYY-MM-DD; timeZone fixa no fuso de São Paulo.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}
```

- [ ] **Step 5: Rodar até passar**

Run: `pnpm --filter financas check`
Expected: PASS — `financas.check: OK`.

- [ ] **Step 6: Gate + commit**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint`

```bash
git add apps/financas/lib
git commit -m "feat(financas): tipos compartilhados, helpers de data e harness de teste"
```

---

## Task 5: `expandirParcelas` — compra parcelada

**Files:**
- Create: `apps/financas/lib/lancamentos/parcelas.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `somaMesesISO` (Task 4); `NovaTransacao`, `Movement` (Task 4).
- Produces:
  - `expandirParcelas(input: EntradaParcelas): NovaTransacao[]`
  - `type EntradaParcelas = { descricao: string; valorTotal: number; primeiroVencimento: string; parcelas: number; movement: Movement; accountId?: string | null; categoryId?: string | null; subcategoryId?: string | null; groupId: string }`
  - Regras: `parcelas` inteiro ≥ 1, senão `throw new Error("parcelas invalido")`. `valorTotal > 0`, senão `throw`. Gera N linhas: `type: "installment"`, `status: "pending"`, `installment_total: N`, `installment_current: i` (1..N), `installment_group_id: groupId`, `due_date: somaMesesISO(primeiroVencimento, i-1)`, `description: "<descricao> (i/N)"`. Rateio: cada parcela `Math.round((valorTotal / N) * 100) / 100`; a última recebe `valorTotal - soma(anteriores)` (arredondado a 2 casas) para fechar exato.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`** (adicionar antes do `console.log` final)

```ts
import { expandirParcelas } from "@/lib/lancamentos/parcelas";

{
  const p = expandirParcelas({
    descricao: "Notebook",
    valorTotal: 3000,
    primeiroVencimento: "2026-01-10",
    parcelas: 3,
    movement: "expense",
    groupId: "g1",
  });
  assert.equal(p.length, 3);
  assert.deepEqual(
    p.map((x) => x.due_date),
    ["2026-01-10", "2026-02-10", "2026-03-10"],
  );
  assert.deepEqual(
    p.map((x) => x.installment_current),
    [1, 2, 3],
  );
  assert.ok(p.every((x) => x.installment_group_id === "g1"));
  assert.equal(p.reduce((s, x) => s + x.amount, 0), 3000, "soma fecha");
  assert.equal(p[0].description, "Notebook (1/3)");
  assert.equal(p[0].type, "installment");
}
{
  const p = expandirParcelas({
    descricao: "Curso",
    valorTotal: 100,
    primeiroVencimento: "2026-01-31",
    parcelas: 3,
    movement: "expense",
    groupId: "g2",
  });
  assert.equal(p.reduce((s, x) => s + x.amount, 0), 100, "rateio 33.33/33.33/33.34");
  assert.deepEqual(
    p.map((x) => x.due_date),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
    "clamp de fevereiro",
  );
}
{
  const p = expandirParcelas({
    descricao: "X",
    valorTotal: 50,
    primeiroVencimento: "2026-05-01",
    parcelas: 1,
    movement: "expense",
    groupId: "g3",
  });
  assert.equal(p.length, 1);
  assert.equal(p[0].amount, 50);
}
assert.throws(() =>
  expandirParcelas({
    descricao: "X",
    valorTotal: 10,
    primeiroVencimento: "2026-01-01",
    parcelas: 0,
    movement: "expense",
    groupId: "g4",
  }),
);
assert.throws(() =>
  expandirParcelas({
    descricao: "X",
    valorTotal: 10,
    primeiroVencimento: "2026-01-01",
    parcelas: 2.5,
    movement: "expense",
    groupId: "g5",
  }),
);
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter financas check`
Expected: FAIL — `Cannot find module '@/lib/lancamentos/parcelas'`.

- [ ] **Step 3: Escrever `lib/lancamentos/parcelas.ts`**

```ts
import { somaMesesISO } from "@/lib/datas";
import type { Movement, NovaTransacao } from "@/lib/financas/types";

export type EntradaParcelas = {
  descricao: string;
  valorTotal: number;
  primeiroVencimento: string;
  parcelas: number;
  movement: Movement;
  accountId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  groupId: string;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function expandirParcelas(input: EntradaParcelas): NovaTransacao[] {
  const { valorTotal, parcelas: n } = input;
  if (!Number.isInteger(n) || n < 1) throw new Error("parcelas invalido");
  if (!(valorTotal > 0)) throw new Error("valorTotal invalido");

  const base = cent(valorTotal / n);
  const linhas: NovaTransacao[] = [];
  let acumulado = 0;

  for (let i = 1; i <= n; i++) {
    const amount = i === n ? cent(valorTotal - acumulado) : base;
    acumulado = cent(acumulado + amount);
    linhas.push({
      description: `${input.descricao} (${i}/${n})`,
      amount,
      movement: input.movement,
      type: "installment",
      status: "pending",
      due_date: somaMesesISO(input.primeiroVencimento, i - 1),
      account_id: input.accountId ?? null,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      installment_current: i,
      installment_total: n,
      installment_group_id: input.groupId,
      source: "manual",
    });
  }
  return linhas;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `pnpm --filter financas check`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint`

```bash
git add apps/financas/lib
git commit -m "feat(financas): expandirParcelas com rateio exato e clamp de vencimento"
```

---

## Task 6: `gerarTransacoesDoMes` — templates recorrentes

**Files:**
- Create: `apps/financas/lib/lancamentos/recorrentes.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `fimDoMesISO` (Task 4); `TemplateRow`, `NovaTransacao` (Task 4).
- Produces:
  - `gerarTransacoesDoMes(templates: TemplateRow[], existentes: ExistenteRef[], mesAlvo: { ano: number; mes: number }): NovaTransacao[]`
  - `type ExistenteRef = { recurring_template_id: string | null; due_date: string }`
  - Regra: para cada template com `ativo === true`, se **não** existe em `existentes` nenhum item com `recurring_template_id === template.id` e `due_date` dentro de `mesAlvo` (mesmo ano e mês), gera uma `NovaTransacao`: `is_recurring: true`, `recurring_template_id: template.id`, `status: "pending"`, `type: template.type`, `movement: template.movement`, `amount: template.amount`, `description: template.description`, `due_date` = dia `min(template.day_of_month, últimoDiaDoMes(mesAlvo))` formatado `YYYY-MM-DD`, e copia `category_id`/`subcategory_id`/`account_id`. Templates inativos são ignorados. Idempotente.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { gerarTransacoesDoMes } from "@/lib/lancamentos/recorrentes";

{
  const tpls = [
    { id: "t1", description: "Aluguel", amount: 1800, movement: "expense",
      category_id: "c1", subcategory_id: null, account_id: "a1",
      day_of_month: 10, type: "fixed", ativo: true },
    { id: "t2", description: "Salário", amount: 4597, movement: "income",
      category_id: "c2", subcategory_id: null, account_id: "a1",
      day_of_month: 5, type: "fixed", ativo: true },
    { id: "t3", description: "Inativo", amount: 10, movement: "expense",
      category_id: null, subcategory_id: null, account_id: null,
      day_of_month: 1, type: "fixed", ativo: false },
    { id: "t4", description: "Fatura", amount: 500, movement: "expense",
      category_id: null, subcategory_id: null, account_id: null,
      day_of_month: 31, type: "fixed", ativo: true },
  ] as const;

  const out = gerarTransacoesDoMes([...tpls], [], { ano: 2026, mes: 2 });
  assert.equal(out.length, 3, "t3 inativo fora");
  const aluguel = out.find((x) => x.recurring_template_id === "t1")!;
  assert.equal(aluguel.due_date, "2026-02-10");
  assert.equal(aluguel.is_recurring, true);
  const fatura = out.find((x) => x.recurring_template_id === "t4")!;
  assert.equal(fatura.due_date, "2026-02-28", "clamp dia 31 em fevereiro");

  const out2 = gerarTransacoesDoMes(
    [...tpls],
    [{ recurring_template_id: "t1", due_date: "2026-02-10" }],
    { ano: 2026, mes: 2 },
  );
  assert.equal(out2.length, 2, "t1 já existe no mês");
  assert.ok(!out2.some((x) => x.recurring_template_id === "t1"));
}
```

- [ ] **Step 2: Rodar para ver falhar** — `pnpm --filter financas check` → FAIL (módulo ausente).

- [ ] **Step 3: Escrever `lib/lancamentos/recorrentes.ts`**

```ts
import { fimDoMesISO } from "@/lib/datas";
import type { NovaTransacao, TemplateRow } from "@/lib/financas/types";

export type ExistenteRef = {
  recurring_template_id: string | null;
  due_date: string;
};

export function gerarTransacoesDoMes(
  templates: TemplateRow[],
  existentes: ExistenteRef[],
  mesAlvo: { ano: number; mes: number },
): NovaTransacao[] {
  const mm = String(mesAlvo.mes).padStart(2, "0");
  const prefixo = `${mesAlvo.ano}-${mm}`;
  const ultimoDia = Number(fimDoMesISO(`${prefixo}-01`).slice(-2));

  const jaTem = new Set(
    existentes
      .filter((e) => e.recurring_template_id && e.due_date.startsWith(prefixo))
      .map((e) => e.recurring_template_id as string),
  );

  const linhas: NovaTransacao[] = [];
  for (const t of templates) {
    if (!t.ativo) continue;
    if (jaTem.has(t.id)) continue;
    const dia = Math.min(t.day_of_month, ultimoDia);
    linhas.push({
      description: t.description,
      amount: t.amount,
      movement: t.movement,
      type: t.type,
      status: "pending",
      due_date: `${prefixo}-${String(dia).padStart(2, "0")}`,
      account_id: t.account_id,
      category_id: t.category_id,
      subcategory_id: t.subcategory_id,
      is_recurring: true,
      recurring_template_id: t.id,
      source: "manual",
    });
  }
  return linhas;
}
```

- [ ] **Step 4: Rodar até passar** — `pnpm --filter financas check` → PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): gerarTransacoesDoMes idempotente para recorrentes"
```

---

## Task 7: `derivarStatus` — status overdue derivado

**Files:**
- Create: `apps/financas/lib/lancamentos/overdue.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `TxStatus` (Task 4).
- Produces:
  - `derivarStatus(row: { status: TxStatus; due_date: string }, hojeIso: string): TxStatus`
  - Regra: `status === "paid"` → `"paid"`. `status !== "paid"` e `due_date < hojeIso` (comparação lexical de ISO) → `"overdue"`. Caso contrário → `"pending"`. `due_date === hojeIso` → `"pending"`.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { derivarStatus } from "@/lib/lancamentos/overdue";

assert.equal(derivarStatus({ status: "pending", due_date: "2026-01-01" }, "2026-02-01"), "overdue");
assert.equal(derivarStatus({ status: "pending", due_date: "2026-03-01" }, "2026-02-01"), "pending");
assert.equal(derivarStatus({ status: "pending", due_date: "2026-02-01" }, "2026-02-01"), "pending", "vence hoje");
assert.equal(derivarStatus({ status: "paid", due_date: "2020-01-01" }, "2026-02-01"), "paid", "paid nunca vira overdue");
assert.equal(derivarStatus({ status: "overdue", due_date: "2026-03-01" }, "2026-02-01"), "pending", "recalcula a partir da data");
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL (módulo ausente).

- [ ] **Step 3: Escrever `lib/lancamentos/overdue.ts`**

```ts
import type { TxStatus } from "@/lib/financas/types";

export function derivarStatus(
  row: { status: TxStatus; due_date: string },
  hojeIso: string,
): TxStatus {
  if (row.status === "paid") return "paid";
  if (row.due_date < hojeIso) return "overdue";
  return "pending";
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): derivarStatus para overdue calculado na leitura"
```

---

## Task 8: `agregarMes` + `calcularSplit` — painel 50/30/20

**Files:**
- Create: `apps/financas/lib/cockpit/agrega.ts`
- Create: `apps/financas/lib/cockpit/split.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `TransactionRow`, `CategoryRow`, `Bucket` (Task 4).
- Produces:
  - `agregarMes(transacoes: TransactionRow[], categorias: CategoryRow[]): ResumoMes`
  - `type ResumoMes = { rendaRecebida: number; investidoNoMes: number; gastosPorBucket: { necessidade: number; desejo: number; investimento: number; sem_classificacao: number } }`
    - `rendaRecebida` = soma de `amount` onde `movement === "income"` e `status === "paid"`.
    - `investidoNoMes` = soma de `amount` onde `movement === "investment"` (qualquer status).
    - `gastosPorBucket` = soma de `amount` das transações `movement` `expense` ou `investment`, agrupadas pelo `bucket` da categoria (`category_id` → `categorias`); categoria ausente ou `bucket` null → `sem_classificacao`.
  - `calcularSplit(rendaRecebida: number, gastosPorBucket: ResumoMes["gastosPorBucket"]): SplitResult`
  - `type SplitResult = { metas: { necessidade: number; desejo: number; investimento: number }; real: { necessidade: number; desejo: number; investimento: number; sem_classificacao: number }; estouro: { necessidade: boolean; desejo: boolean; investimento: boolean } }`
    - `metas` = `rendaRecebida` × `0.5` / `0.3` / `0.2`, arredondado a 2 casas. `rendaRecebida <= 0` → metas `0/0/0`.
    - `estouro[b]` = `real[b] > metas[b]` (se `metas[b] === 0` e `real[b] > 0` → `true`).

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { agregarMes } from "@/lib/cockpit/agrega";
import { calcularSplit } from "@/lib/cockpit/split";

{
  const cats = [
    { id: "c1", name: "Mercado", type: "expense", bucket: "necessidade", color: null, icon: null, ativo: true },
    { id: "c2", name: "Lazer", type: "expense", bucket: "desejo", color: null, icon: null, ativo: true },
    { id: "c3", name: "Aporte", type: "investment", bucket: "investimento", color: null, icon: null, ativo: true },
    { id: "c4", name: "Salário", type: "income", bucket: null, color: null, icon: null, ativo: true },
  ] as any[];
  const tx = [
    { movement: "income", status: "paid", amount: 4000, category_id: "c4" },
    { movement: "income", status: "pending", amount: 1000, category_id: "c4" },
    { movement: "expense", status: "paid", amount: 1200, category_id: "c1" },
    { movement: "expense", status: "pending", amount: 300, category_id: "c2" },
    { movement: "investment", status: "paid", amount: 500, category_id: "c3" },
    { movement: "expense", status: "paid", amount: 90, category_id: null },
  ] as any[];

  const r = agregarMes(tx, cats);
  assert.equal(r.rendaRecebida, 4000, "só income paid");
  assert.equal(r.investidoNoMes, 500);
  assert.equal(r.gastosPorBucket.necessidade, 1200);
  assert.equal(r.gastosPorBucket.desejo, 300);
  assert.equal(r.gastosPorBucket.investimento, 500);
  assert.equal(r.gastosPorBucket.sem_classificacao, 90);

  const s = calcularSplit(r.rendaRecebida, r.gastosPorBucket);
  assert.deepEqual(s.metas, { necessidade: 2000, desejo: 1200, investimento: 800 });
  assert.equal(s.estouro.necessidade, false);
  assert.equal(s.estouro.desejo, false);
  assert.equal(s.estouro.investimento, false);
}
{
  const s = calcularSplit(0, { necessidade: 50, desejo: 0, investimento: 0, sem_classificacao: 0 });
  assert.deepEqual(s.metas, { necessidade: 0, desejo: 0, investimento: 0 });
  assert.equal(s.estouro.necessidade, true, "meta 0 e real > 0 estoura");
}
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL.

- [ ] **Step 3: Escrever `lib/cockpit/agrega.ts`**

```ts
import type { CategoryRow, TransactionRow } from "@/lib/financas/types";

export type ResumoMes = {
  rendaRecebida: number;
  investidoNoMes: number;
  gastosPorBucket: {
    necessidade: number;
    desejo: number;
    investimento: number;
    sem_classificacao: number;
  };
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function agregarMes(
  transacoes: TransactionRow[],
  categorias: CategoryRow[],
): ResumoMes {
  const bucketDe = new Map(categorias.map((c) => [c.id, c.bucket]));
  const g = { necessidade: 0, desejo: 0, investimento: 0, sem_classificacao: 0 };
  let rendaRecebida = 0;
  let investidoNoMes = 0;

  for (const t of transacoes) {
    if (t.movement === "income") {
      if (t.status === "paid") rendaRecebida = cent(rendaRecebida + t.amount);
      continue;
    }
    if (t.movement === "investment") investidoNoMes = cent(investidoNoMes + t.amount);
    const b = (t.category_id && bucketDe.get(t.category_id)) || null;
    const chave = b ?? "sem_classificacao";
    g[chave] = cent(g[chave] + t.amount);
  }

  return { rendaRecebida, investidoNoMes, gastosPorBucket: g };
}
```

- [ ] **Step 4: Escrever `lib/cockpit/split.ts`**

```ts
import type { ResumoMes } from "@/lib/cockpit/agrega";

export type SplitResult = {
  metas: { necessidade: number; desejo: number; investimento: number };
  real: {
    necessidade: number;
    desejo: number;
    investimento: number;
    sem_classificacao: number;
  };
  estouro: { necessidade: boolean; desejo: boolean; investimento: boolean };
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularSplit(
  rendaRecebida: number,
  gastosPorBucket: ResumoMes["gastosPorBucket"],
): SplitResult {
  const base = rendaRecebida > 0 ? rendaRecebida : 0;
  const metas = {
    necessidade: cent(base * 0.5),
    desejo: cent(base * 0.3),
    investimento: cent(base * 0.2),
  };
  const real = { ...gastosPorBucket };
  return {
    metas,
    real,
    estouro: {
      necessidade: real.necessidade > metas.necessidade,
      desejo: real.desejo > metas.desejo,
      investimento: real.investimento > metas.investimento,
    },
  };
}
```

- [ ] **Step 5: Rodar até passar** — PASS.

- [ ] **Step 6: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): agregarMes e calcularSplit para o painel 50/30/20"
```

---

## Task 8b: `calcularKpis` + `agregarPorCategoria` + `agregarDistribuicao` — KPIs e roscas do Cockpit

> Adicionada junto com a Task 3b/16 revisada: o Cockpit confirmado no
> `/impeccable shape` pede 6 KPIs e 2 roscas que o desenho original (Task 8/9)
> não cobria.

**Files:**
- Create: `apps/financas/lib/cockpit/roscas.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `TransactionRow`, `CategoryRow`, `TxStatus` (Task 4); `derivarStatus` (Task 7).
- Produces:
  - `calcularKpis(transacoes: Pick<TransactionRow, "movement" | "amount" | "status" | "due_date">[], hojeIso: string): KpisCockpit`
    - `type KpisCockpit = { entradas: number; saidas: number; aVencer: number; vencidas: number; investimentos: number; saldo: number }`
    - Usa `derivarStatus({status, due_date}, hojeIso)` linha a linha (statusEfetivo). `entradas` = soma `amount` de `movement=income` com statusEfetivo `paid`. `saidas` = soma `amount` de `movement=expense` com statusEfetivo `paid`. `aVencer` = soma `amount` de `movement=expense` com statusEfetivo `pending`. `vencidas` = soma `amount` de `movement=expense` com statusEfetivo `overdue`. `investimentos` = soma `amount` de `movement=investment` (qualquer status). `saldo = entradas - saidas - investimentos`.
  - `agregarPorCategoria(transacoes: Pick<TransactionRow, "movement" | "amount" | "category_id">[], categorias: Pick<CategoryRow, "id" | "name">[]): LinhaCategoria[]`
    - `type LinhaCategoria = { categoria: string; valor: number }`
    - Só `movement` `expense`/`investment`. Agrupa por `category_id` → nome da categoria; `category_id` ausente ou sem match → `"Sem categoria"`. Ordenado por `valor` desc. Array vazio quando não há gasto (estado empty é responsabilidade da UI).
  - `agregarDistribuicao(input: { entradas: number; saidas: number; investimentos: number; dividasNaoPagas: number }): LinhaDistribuicao[]`
    - `type LinhaDistribuicao = { label: "entradas" | "saidas" | "investimentos" | "dividas_nao_pagas"; valor: number }`
    - Empacota os 4 números na ordem fixa acima; nenhum cálculo — os 4 valores já vêm prontos de `calcularKpis` e `progressoAgregado`.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { calcularKpis, agregarPorCategoria, agregarDistribuicao } from "@/lib/cockpit/roscas";

{
  const tx = [
    { movement: "income", amount: 4000, status: "paid", due_date: "2026-02-05" },
    { movement: "expense", amount: 1200, status: "paid", due_date: "2026-02-03" },
    { movement: "expense", amount: 300, status: "pending", due_date: "2026-03-01" },
    { movement: "expense", amount: 90, status: "pending", due_date: "2026-01-01" }, // vencida
    { movement: "investment", amount: 500, status: "paid", due_date: "2026-02-10" },
  ] as any[];
  const k = calcularKpis(tx, "2026-02-15");
  assert.equal(k.entradas, 4000);
  assert.equal(k.saidas, 1200);
  assert.equal(k.aVencer, 300);
  assert.equal(k.vencidas, 90);
  assert.equal(k.investimentos, 500);
  assert.equal(k.saldo, 2300, "4000 - 1200 - 500");
}
{
  const cats = [{ id: "c1", name: "Mercado" }, { id: "c2", name: "Aporte" }] as any[];
  const tx = [
    { movement: "expense", amount: 100, category_id: "c1" },
    { movement: "expense", amount: 50, category_id: "c1" },
    { movement: "investment", amount: 200, category_id: "c2" },
    { movement: "expense", amount: 30, category_id: null },
    { movement: "income", amount: 999, category_id: "c1" },
  ] as any[];
  const r = agregarPorCategoria(tx, cats);
  assert.deepEqual(r, [
    { categoria: "Aporte", valor: 200 },
    { categoria: "Mercado", valor: 150 },
    { categoria: "Sem categoria", valor: 30 },
  ]);
}
{
  const r = agregarDistribuicao({ entradas: 4000, saidas: 1200, investimentos: 500, dividasNaoPagas: 29500 });
  assert.deepEqual(r, [
    { label: "entradas", valor: 4000 },
    { label: "saidas", valor: 1200 },
    { label: "investimentos", valor: 500 },
    { label: "dividas_nao_pagas", valor: 29500 },
  ]);
}
```

- [ ] **Step 2: Rodar para ver falhar** — `pnpm --filter financas check` → FAIL (módulo ausente).

- [ ] **Step 3: Escrever `lib/cockpit/roscas.ts`**

```ts
import { derivarStatus } from "@/lib/lancamentos/overdue";
import type { CategoryRow, TransactionRow } from "@/lib/financas/types";

type TxKpi = Pick<TransactionRow, "movement" | "amount" | "status" | "due_date">;

export type KpisCockpit = {
  entradas: number;
  saidas: number;
  aVencer: number;
  vencidas: number;
  investimentos: number;
  saldo: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularKpis(transacoes: TxKpi[], hojeIso: string): KpisCockpit {
  let entradas = 0, saidas = 0, aVencer = 0, vencidas = 0, investimentos = 0;
  for (const t of transacoes) {
    const efetivo = derivarStatus({ status: t.status, due_date: t.due_date }, hojeIso);
    if (t.movement === "investment") {
      investimentos = cent(investimentos + t.amount);
    } else if (t.movement === "income") {
      if (efetivo === "paid") entradas = cent(entradas + t.amount);
    } else {
      if (efetivo === "paid") saidas = cent(saidas + t.amount);
      else if (efetivo === "pending") aVencer = cent(aVencer + t.amount);
      else vencidas = cent(vencidas + t.amount);
    }
  }
  return {
    entradas, saidas, aVencer, vencidas, investimentos,
    saldo: cent(entradas - saidas - investimentos),
  };
}

export type LinhaCategoria = { categoria: string; valor: number };

export function agregarPorCategoria(
  transacoes: Pick<TransactionRow, "movement" | "amount" | "category_id">[],
  categorias: Pick<CategoryRow, "id" | "name">[],
): LinhaCategoria[] {
  const nomeDe = new Map(categorias.map((c) => [c.id, c.name]));
  const soma = new Map<string, number>();
  for (const t of transacoes) {
    if (t.movement !== "expense" && t.movement !== "investment") continue;
    const nome = (t.category_id && nomeDe.get(t.category_id)) || "Sem categoria";
    soma.set(nome, cent((soma.get(nome) ?? 0) + t.amount));
  }
  return [...soma.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export type LinhaDistribuicao = {
  label: "entradas" | "saidas" | "investimentos" | "dividas_nao_pagas";
  valor: number;
};

export function agregarDistribuicao(input: {
  entradas: number;
  saidas: number;
  investimentos: number;
  dividasNaoPagas: number;
}): LinhaDistribuicao[] {
  return [
    { label: "entradas", valor: input.entradas },
    { label: "saidas", valor: input.saidas },
    { label: "investimentos", valor: input.investimentos },
    { label: "dividas_nao_pagas", valor: input.dividasNaoPagas },
  ];
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint`

```bash
git add apps/financas/lib
git commit -m "feat(financas): kpis e roscas do cockpit (categoria + distribuicao)"
```

---

## Task 9: `calcularProjecao` — saldo projetado do mês

**Files:**
- Create: `apps/financas/lib/cockpit/projecao.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `TransactionRow` (Task 4).
- Produces:
  - `calcularProjecao(input: EntradaProjecao): ProjecaoResult`
  - `type EntradaProjecao = { saldoContas: number; transacoes: Pick<TransactionRow, "movement" | "status" | "amount" | "due_date">[]; fimDoMesIso: string }`
  - `type ProjecaoResult = { projetado: number; entradasPrevistas: number; saidasPrevistas: number }`
  - Regra: considera apenas transações com `status !== "paid"` e `due_date <= fimDoMesIso`. `entradasPrevistas` = soma de `amount` das `movement === "income"` que passam no filtro. `saidasPrevistas` = soma de `amount` das `movement` `expense` ou `investment` que passam no filtro. `projetado = saldoContas + entradasPrevistas - saidasPrevistas`, arredondado a 2 casas, **sem clamp** (pode ser negativo).

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { calcularProjecao } from "@/lib/cockpit/projecao";

{
  const tx = [
    { movement: "income", status: "pending", amount: 4597, due_date: "2026-02-05" },
    { movement: "income", status: "pending", amount: 999, due_date: "2026-03-05" }, // fora do mês
    { movement: "income", status: "paid", amount: 100, due_date: "2026-02-01" }, // já pago, ignora
    { movement: "expense", status: "pending", amount: 1800, due_date: "2026-02-10" },
    { movement: "expense", status: "overdue", amount: 300, due_date: "2026-01-20" },
    { movement: "investment", status: "pending", amount: 500, due_date: "2026-02-15" },
  ] as any[];
  const r = calcularProjecao({ saldoContas: 1000, transacoes: tx, fimDoMesIso: "2026-02-28" });
  assert.equal(r.entradasPrevistas, 4597);
  assert.equal(r.saidasPrevistas, 2600, "1800 + 300 + 500");
  assert.equal(r.projetado, 2997, "1000 + 4597 - 2600");
}
{
  const tx = [
    { movement: "expense", status: "pending", amount: 7091, due_date: "2026-02-10" },
  ] as any[];
  const r = calcularProjecao({ saldoContas: 1000, transacoes: tx, fimDoMesIso: "2026-02-28" });
  assert.equal(r.projetado, -6091, "não faz clamp");
}
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL.

- [ ] **Step 3: Escrever `lib/cockpit/projecao.ts`**

```ts
import type { TransactionRow } from "@/lib/financas/types";

type TxParcial = Pick<
  TransactionRow,
  "movement" | "status" | "amount" | "due_date"
>;

export type EntradaProjecao = {
  saldoContas: number;
  transacoes: TxParcial[];
  fimDoMesIso: string;
};

export type ProjecaoResult = {
  projetado: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularProjecao(input: EntradaProjecao): ProjecaoResult {
  let entradasPrevistas = 0;
  let saidasPrevistas = 0;

  for (const t of input.transacoes) {
    if (t.status === "paid") continue;
    if (t.due_date > input.fimDoMesIso) continue;
    if (t.movement === "income") entradasPrevistas = cent(entradasPrevistas + t.amount);
    else saidasPrevistas = cent(saidasPrevistas + t.amount);
  }

  return {
    entradasPrevistas,
    saidasPrevistas,
    projetado: cent(input.saldoContas + entradasPrevistas - saidasPrevistas),
  };
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): calcularProjecao do saldo de fim de mês sem clamp"
```

---

## Task 10: `progressoDivida` + `progressoAgregado` — mapa do passivo

**Files:**
- Create: `apps/financas/lib/dividas/progresso.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: `DebtRow`, `Grupo` (Task 4).
- Produces:
  - `progressoDivida(d: Pick<DebtRow, "total_amount" | "remaining_amount">): number` — retorna `0..1`. `total_amount <= 0` → `0`. `1 - remaining/total`, com clamp em `[0, 1]` (juros que inflam `remaining` acima de `total` → `0`; `remaining` 0 → `1`).
  - `progressoAgregado(dividas: DebtRow[]): AgregadoResult`
  - `type LinhaAgregada = { total: number; pago: number; restante: number; progresso: number }`
  - `type AgregadoResult = { porGrupo: Record<Grupo, LinhaAgregada>; geral: LinhaAgregada }` — `pago = total - restante` (clamp em 0); `progresso` da linha agregada = `total > 0 ? pago / total : 0`. Grupos sem dívida aparecem com tudo `0`.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { progressoDivida, progressoAgregado } from "@/lib/dividas/progresso";

assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 250 }), 0.75);
assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 0 }), 1);
assert.equal(progressoDivida({ total_amount: 0, remaining_amount: 0 }), 0, "sem NaN");
assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 1200 }), 0, "juros nao vira negativo");

{
  const dv = [
    { grupo: "consignado", total_amount: 22000, remaining_amount: 20000 },
    { grupo: "consignado", total_amount: 3000, remaining_amount: 0 },
    { grupo: "serasa", total_amount: 9500, remaining_amount: 9500 },
  ] as any[];
  const r = progressoAgregado(dv);
  assert.equal(r.porGrupo.consignado.total, 25000);
  assert.equal(r.porGrupo.consignado.restante, 20000);
  assert.equal(r.porGrupo.consignado.pago, 5000);
  assert.equal(r.porGrupo.serasa.pago, 0);
  assert.equal(r.porGrupo.fgts.total, 0, "grupo sem dívida");
  assert.equal(r.geral.total, 34500);
  assert.equal(r.geral.restante, 29500);
  assert.equal(r.geral.pago, 5000);
}
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL.

- [ ] **Step 3: Escrever `lib/dividas/progresso.ts`**

```ts
import type { DebtRow, Grupo } from "@/lib/financas/types";

const GRUPOS: Grupo[] = [
  "fgts",
  "consignado",
  "serasa",
  "pessoal",
  "familia",
  "cartao",
];

const cent = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function progressoDivida(
  d: Pick<DebtRow, "total_amount" | "remaining_amount">,
): number {
  if (!(d.total_amount > 0)) return 0;
  return clamp01(1 - d.remaining_amount / d.total_amount);
}

export type LinhaAgregada = {
  total: number;
  pago: number;
  restante: number;
  progresso: number;
};

export type AgregadoResult = {
  porGrupo: Record<Grupo, LinhaAgregada>;
  geral: LinhaAgregada;
};

function linha(total: number, restante: number): LinhaAgregada {
  const t = cent(total);
  const r = cent(restante);
  const pago = cent(Math.max(0, t - r));
  return { total: t, restante: r, pago, progresso: t > 0 ? pago / t : 0 };
}

export function progressoAgregado(dividas: DebtRow[]): AgregadoResult {
  const acc: Record<Grupo, { total: number; restante: number }> = Object.fromEntries(
    GRUPOS.map((g) => [g, { total: 0, restante: 0 }]),
  ) as Record<Grupo, { total: number; restante: number }>;

  let total = 0;
  let restante = 0;
  for (const d of dividas) {
    acc[d.grupo].total += d.total_amount;
    acc[d.grupo].restante += d.remaining_amount;
    total += d.total_amount;
    restante += d.remaining_amount;
  }

  const porGrupo = Object.fromEntries(
    GRUPOS.map((g) => [g, linha(acc[g].total, acc[g].restante)]),
  ) as Record<Grupo, LinhaAgregada>;

  return { porGrupo, geral: linha(total, restante) };
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): progresso de quitação por dívida e agregado por grupo"
```

---

## Task 11: `parseOfx` — leitura de extrato OFX

**Files:**
- Create: `apps/financas/lib/import/ofx.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `parseOfx(conteudo: string): OfxTransacao[]`
  - `type OfxTransacao = { dataIso: string; valor: number; memo: string; fitid: string | null; movimentoSugerido: "income" | "expense" }`
  - Regra: extrai cada bloco `<STMTTRN>...</STMTTRN>`. De cada bloco lê as tags `DTPOSTED`, `TRNAMT`, `MEMO` (ou `NAME` se não houver `MEMO`), `FITID`. Aceita as duas formas: SGML (`<TAG>valor` até quebra de linha ou próxima `<`) e XML (`<TAG>valor</TAG>`). `DTPOSTED` vem como `YYYYMMDD` possivelmente seguido de `HHMMSS[.xxx][[-3:BRT]]` — usar os 8 primeiros dígitos → `YYYY-MM-DD`. `TRNAMT` com vírgula ou ponto decimal → `Number` (`valor` mantém o sinal). `movimentoSugerido` = `valor < 0 ? "expense" : "income"`. Sem nenhum `STMTTRN` → `[]` (nunca lança). `memo` default `""`. `fitid` ausente → `null`.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { parseOfx } from "@/lib/import/ofx";

{
  const ofx = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260210120000[-3:BRT]
<TRNAMT>-89.90
<FITID>2026021001
<MEMO>MERCADO EXTRA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260205
<TRNAMT>4597.00
<FITID>2026020501
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = parseOfx(ofx);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], {
    dataIso: "2026-02-10",
    valor: -89.9,
    memo: "MERCADO EXTRA",
    fitid: "2026021001",
    movimentoSugerido: "expense",
  });
  assert.equal(r[1].dataIso, "2026-02-05");
  assert.equal(r[1].valor, 4597);
  assert.equal(r[1].memo, "SALARIO", "cai no NAME sem MEMO");
  assert.equal(r[1].movimentoSugerido, "income");
}
{
  const xml = `<OFX><STMTTRN><DTPOSTED>20260101</DTPOSTED><TRNAMT>-10.00</TRNAMT><MEMO>X</MEMO></STMTTRN></OFX>`;
  const r = parseOfx(xml);
  assert.equal(r.length, 1);
  assert.equal(r[0].fitid, null);
  assert.equal(r[0].valor, -10);
}
assert.deepEqual(parseOfx("sem transacoes aqui"), []);
assert.deepEqual(parseOfx(""), []);
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL.

- [ ] **Step 3: Escrever `lib/import/ofx.ts`**

```ts
export type OfxTransacao = {
  dataIso: string;
  valor: number;
  memo: string;
  fitid: string | null;
  movimentoSugerido: "income" | "expense";
};

function tag(bloco: string, nome: string): string | null {
  // XML: <TAG>valor</TAG>  |  SGML: <TAG>valor (até < ou fim de linha)
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

export function parseOfx(conteudo: string): OfxTransacao[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const out: OfxTransacao[] = [];

  for (const b of blocos) {
    const dtRaw = tag(b, "DTPOSTED");
    const amtRaw = tag(b, "TRNAMT");
    if (!dtRaw || !amtRaw) continue;

    const digitos = dtRaw.replace(/[^0-9]/g, "").slice(0, 8);
    if (digitos.length < 8) continue;
    const dataIso = `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;

    const valor = Number(amtRaw.replace(",", "."));
    if (Number.isNaN(valor)) continue;

    const memo = tag(b, "MEMO") ?? tag(b, "NAME") ?? "";
    const fitid = tag(b, "FITID");

    out.push({
      dataIso,
      valor,
      memo,
      fitid: fitid || null,
      movimentoSugerido: valor < 0 ? "expense" : "income",
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): parseOfx tolerante a SGML e XML"
```

---

## Task 12: `hashTransacao` + `classificar` — dedupe do import

**Files:**
- Create: `apps/financas/lib/import/dedupe.ts`
- Modify: `apps/financas/lib/financas.check.ts`

**Interfaces:**
- Consumes: nada (`node:crypto`).
- Produces:
  - `hashTransacao(input: { accountId: string; dataIso: string; valor: number; memo: string }): string` — `sha1` hex de `` `${accountId}|${dataIso}|${valor.toFixed(2)}|${memo.trim().toLowerCase()}` ``.
  - `classificar(candidatos: CandidatoIn[], jaImportados: Set<string>): CandidatoOut[]`
  - `type CandidatoIn = { hash: string; fitid: string | null }`
  - `type CandidatoOut = CandidatoIn & { externalId: string; novo: boolean }` — `externalId = fitid ?? hash`; `novo = !jaImportados.has(externalId)`.

- [ ] **Step 1: Asserts em `lib/financas.check.ts`**

```ts
import { hashTransacao, classificar } from "@/lib/import/dedupe";

{
  const a = hashTransacao({ accountId: "acc1", dataIso: "2026-02-10", valor: -89.9, memo: "Mercado Extra" });
  const b = hashTransacao({ accountId: "acc1", dataIso: "2026-02-10", valor: -89.9, memo: "  mercado extra " });
  assert.equal(a, b, "normaliza memo (trim + lower)");
  const c = hashTransacao({ accountId: "acc1", dataIso: "2026-02-11", valor: -89.9, memo: "Mercado Extra" });
  assert.notEqual(a, c, "data diferente muda o hash");
}
{
  const out = classificar(
    [
      { hash: "h1", fitid: "F1" },
      { hash: "h2", fitid: null },
      { hash: "h3", fitid: "F3" },
    ],
    new Set(["F1", "h2"]),
  );
  assert.equal(out[0].externalId, "F1");
  assert.equal(out[0].novo, false, "fitid já importado");
  assert.equal(out[1].externalId, "h2");
  assert.equal(out[1].novo, false, "hash já importado (sem fitid)");
  assert.equal(out[2].novo, true);
}
```

- [ ] **Step 2: Rodar para ver falhar** — FAIL.

- [ ] **Step 3: Escrever `lib/import/dedupe.ts`**

```ts
import { createHash } from "node:crypto";

export function hashTransacao(input: {
  accountId: string;
  dataIso: string;
  valor: number;
  memo: string;
}): string {
  const chave = `${input.accountId}|${input.dataIso}|${input.valor.toFixed(2)}|${input.memo
    .trim()
    .toLowerCase()}`;
  return createHash("sha1").update(chave).digest("hex");
}

export type CandidatoIn = { hash: string; fitid: string | null };
export type CandidatoOut = CandidatoIn & { externalId: string; novo: boolean };

export function classificar(
  candidatos: CandidatoIn[],
  jaImportados: Set<string>,
): CandidatoOut[] {
  return candidatos.map((c) => {
    const externalId = c.fitid ?? c.hash;
    return { ...c, externalId, novo: !jaImportados.has(externalId) };
  });
}
```

- [ ] **Step 4: Rodar até passar** — PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add apps/financas/lib
git commit -m "feat(financas): hashTransacao e classificar para dedupe do import OFX"
```

---

## Task 13: Tela `/configuracoes` — contas, categorias, subcategorias, recorrentes

**Files:**
- Create: `apps/financas/lib/configuracoes/load.ts`
- Create: `apps/financas/app/configuracoes/actions.ts`
- Create: `apps/financas/app/configuracoes/page.tsx`
- Create: `apps/financas/components/configuracoes/SecaoContas.tsx`
- Create: `apps/financas/components/configuracoes/SecaoCategorias.tsx`
- Create: `apps/financas/components/configuracoes/SecaoRecorrentes.tsx`
- Create: `apps/financas/components/configuracoes/SecaoNoetrix.tsx`

**Interfaces:**
- Consumes: `financasDb`, `requireUser` (Task 2); row types incl. `NoetrixMetricRow` (Task 4); colunas `fatura_atual`/`limite_disponivel` (Task 3b).
- Produces:
  - `carregarConfiguracoes(): Promise<ConfigData>` onde `ConfigData = { contas: AccountRow[]; categorias: CategoryRow[]; subcategorias: SubcategoryRow[]; templates: TemplateRow[]; metricasNoetrix: NoetrixMetricRow[] }` (todas as linhas, ativas e inativas, ordenadas por `name`/`description`; `metricasNoetrix` ordenada por `mes` desc, últimos 12 meses).
  - Server Actions, todas `async`, retorno `{ ok: true } | { ok: false; erro: string }`, `requireUser()` no topo, `revalidatePath("/configuracoes")` no fim, `try/catch` com `console.error`:
    - `criarConta(fd: FormData)` — `name`, `bank`, `type`; `balance` opcional (default 0).
    - `editarConta(fd: FormData)` — `id`, `name`, `bank`, `type`, `balance`, `ativo`, e (quando `bank` for `nubank`/`inter`) `fatura_atual`/`limite_disponivel` opcionais.
    - `criarCategoria(fd: FormData)` — `name`, `type`, `bucket` (vazio → null).
    - `editarCategoria(fd: FormData)` — `id`, `name`, `type`, `bucket`, `ativo`.
    - `criarSubcategoria(fd: FormData)` — `category_id`, `name`.
    - `toggleSubcategoria(fd: FormData)` — `id`, `ativo`.
    - `criarTemplate(fd: FormData)` — `description`, `amount`, `movement`, `day_of_month`, opcionais `category_id`/`subcategory_id`/`account_id`/`type`.
    - `editarTemplate(fd: FormData)` — idem + `id` + `ativo`.
    - `salvarMetricaNoetrix(fd: FormData)` — `mes` (`YYYY-MM`, gravado como `${mes}-01`), `mrr`, `clientes_pagantes`, `churn_pct` opcional, `reserva_meses` opcional; `upsert` em `fin_noetrix_metrics` por `(user_id, mes)` (`onConflict: "user_id,mes"`) — um registro por mês, salvar de novo atualiza o existente. `revalidatePath("/configuracoes")` + `revalidatePath("/cockpit")`.

- [ ] **Step 1: Escrever `lib/configuracoes/load.ts`**

```ts
import "server-only";
import { financasDb } from "@/lib/supabase/server";
import type {
  AccountRow,
  CategoryRow,
  SubcategoryRow,
  TemplateRow,
  NoetrixMetricRow,
} from "@/lib/financas/types";

export type ConfigData = {
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  templates: TemplateRow[];
  metricasNoetrix: NoetrixMetricRow[];
};

export async function carregarConfiguracoes(): Promise<ConfigData> {
  const db = financasDb();
  const [contas, categorias, subcategorias, templates, metricasNoetrix] = await Promise.all([
    db.from("fin_accounts").select("*").order("name"),
    db.from("fin_categories").select("*").order("name"),
    db.from("fin_subcategories").select("*").order("name"),
    db.from("fin_recurring_templates").select("*").order("description"),
    db.from("fin_noetrix_metrics").select("*").order("mes", { ascending: false }).limit(12),
  ]);
  for (const r of [contas, categorias, subcategorias, templates, metricasNoetrix]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    contas: (contas.data ?? []) as AccountRow[],
    categorias: (categorias.data ?? []) as CategoryRow[],
    subcategorias: (subcategorias.data ?? []) as SubcategoryRow[],
    templates: (templates.data ?? []) as TemplateRow[],
    metricasNoetrix: (metricasNoetrix.data ?? []) as NoetrixMetricRow[],
  };
}
```

- [ ] **Step 2: Escrever `app/configuracoes/actions.ts`**

Padrão de cada action (repetir para as 8, variando tabela e campos):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";

export type Resultado = { ok: true } | { ok: false; erro: string };

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export async function criarConta(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const name = str(fd, "name");
    const bank = str(fd, "bank");
    const type = str(fd, "type");
    if (!name || !bank || !type) return { ok: false, erro: "Preencha nome, banco e tipo." };
    const balanceRaw = str(fd, "balance");
    const balance = balanceRaw ? num(fd, "balance") : 0;
    if (Number.isNaN(balance)) return { ok: false, erro: "Saldo inválido." };

    const { error } = await financasDb()
      .from("fin_accounts")
      .insert({ name, bank, type, balance });
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("criarConta", e);
    return { ok: false, erro: "Não foi possível salvar a conta." };
  }
}

// editarConta, criarCategoria, editarCategoria, criarSubcategoria,
// toggleSubcategoria, criarTemplate, editarTemplate — mesma forma:
// requireUser() -> validar -> insert/update -> revalidatePath -> catch genérico.
```

Regras específicas:
- `editarConta`: `update({...}).eq("id", id)`; `balance` sempre revalidado; setar `balance_updated_at: new Date().toISOString()` quando `balance` mudar (comparar com o valor atual carregado é overkill — sempre atualiza o timestamp no submit). `fatura_atual`/`limite_disponivel`: só lê e grava esses campos do `FormData` quando `bank` for `nubank`/`inter` (`str()` vazio → `null`).
- `criarCategoria`/`editarCategoria`: `bucket` vazio → `null`; se `type === "income"` forçar `bucket: null`.
- `criarSubcategoria`: exige `category_id` válido (vem do `<select>`).
- `criarTemplate`/`editarTemplate`: `day_of_month` inteiro 1–31, senão erro; `amount` via `num()`, `> 0` senão erro.
- `salvarMetricaNoetrix`: `mes` no formato `YYYY-MM` (`<input type="month">`), senão erro; grava `mes: `${mes}-01``; `mrr`/`clientes_pagantes` obrigatórios via `num()`; `churn_pct`/`reserva_meses` opcionais (vazio → `null`); `.from("fin_noetrix_metrics").upsert({...}, { onConflict: "user_id,mes" })`.

- [ ] **Step 3: Escrever `app/configuracoes/page.tsx`**

```tsx
import { requireUser } from "@/lib/supabase/auth";
import { carregarConfiguracoes } from "@/lib/configuracoes/load";
import { SecaoContas } from "@/components/configuracoes/SecaoContas";
import { SecaoCategorias } from "@/components/configuracoes/SecaoCategorias";
import { SecaoRecorrentes } from "@/components/configuracoes/SecaoRecorrentes";
import { SecaoNoetrix } from "@/components/configuracoes/SecaoNoetrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações — Finanças" };

export default async function ConfiguracoesPage() {
  await requireUser();
  const data = await carregarConfiguracoes();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-10">
      <h1 className="text-xl font-bold">Configurações</h1>
      <SecaoContas contas={data.contas} />
      <SecaoCategorias
        categorias={data.categorias}
        subcategorias={data.subcategorias}
      />
      <SecaoRecorrentes
        templates={data.templates}
        categorias={data.categorias}
        subcategorias={data.subcategorias}
        contas={data.contas}
      />
      <SecaoNoetrix metricas={data.metricasNoetrix} />
    </main>
  );
}
```

- [ ] **Step 4: Escrever os 4 componentes de seção**

Cada seção: lista das linhas + `<form action={serverAction}>` nativo para criar, `<details>` por linha para editar (padrão do `apps/studiold/app/configuracoes`). Sem estado de cliente. Campos por seção conforme os `FormData` das actions. `SecaoContas`: `name`, `<select bank>` (inter/nubank/bradesco/btg), `<select type>`, `balance` (`inputMode="decimal"`); quando `bank` selecionado for `nubank`/`inter`, mostra também `fatura_atual`/`limite_disponivel` (`inputMode="decimal"`, opcionais). `SecaoCategorias`: form de categoria (`name`, `<select type>`, `<select bucket>` desabilitado quando `type=income`) + sub-lista de subcategorias por categoria com form inline. `SecaoRecorrentes`: `description`, `amount`, `<select movement>`, `day_of_month` (`type="number" min=1 max=31`), selects opcionais de categoria/subcategoria/conta. `SecaoNoetrix`: lista dos últimos `metricas` (mês, MRR, clientes) + `<form action={salvarMetricaNoetrix}>` com `mes` (`type="month"`, default mês corrente), `mrr`, `clientes_pagantes`, `churn_pct` e `reserva_meses` opcionais — salvar de novo no mesmo mês atualiza (upsert), sem duplicar linha.

> Tratamento visual/microcopy: vem do `/impeccable shape /configuracoes`. Esta task entrega estrutura, binding de dados e os forms funcionais.

- [ ] **Step 5: Gate**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`

- [ ] **Step 6: Verificação manual (browser, requer schema aplicado)**

1. `/configuracoes` carrega com as 3 contas e as categorias do seed.
2. Criar uma conta BTG → aparece na lista, sem recarregar a página inteira além do `revalidatePath`.
3. Editar o `balance` de uma conta → persiste.
4. Criar categoria `type=income` → o select de bucket fica desabilitado e grava `null`.
5. Criar uma subcategoria numa categoria de despesa → aparece aninhada.
6. Criar um template recorrente dia 10 → aparece na lista.
7. Editar a conta Nubank com `fatura_atual`/`limite_disponivel` → persiste; conta Bradesco não mostra esses campos.
8. Salvar métrica Noetrix do mês corrente → aparece na lista; salvar de novo o mesmo mês → atualiza a linha existente (não duplica).

- [ ] **Step 7: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): tela de configuracoes (contas, categorias, recorrentes)"
```

---

## Task 14: Tela `/lancamentos` — lista, filtros e mutações manuais

**Files:**
- Create: `apps/financas/lib/lancamentos/load.ts`
- Create: `apps/financas/app/lancamentos/actions.ts`
- Create: `apps/financas/app/lancamentos/page.tsx`
- Create: `apps/financas/components/lancamentos/Filtros.tsx`
- Create: `apps/financas/components/lancamentos/NovoLancamentoForm.tsx`
- Create: `apps/financas/components/lancamentos/LinhaLancamento.tsx`

**Interfaces:**
- Consumes: `financasDb`, `requireUser` (Task 2); `derivarStatus` (Task 7), `expandirParcelas` (Task 5), `gerarTransacoesDoMes` (Task 6); `hojeISO` (Task 4); row types + `NovaTransacao` (Task 4).
- Produces:
  - `carregarLancamentos(filtro: FiltroLancamentos): Promise<LancamentosData>`
    - `type FiltroLancamentos = { mes: string /* "YYYY-MM" */; status?: TxStatus; contaId?: string; categoriaId?: string }`
    - `type LinhaComStatus = TransactionRow & { statusEfetivo: TxStatus }` (`statusEfetivo` via `derivarStatus` contra `hojeISO()`)
    - `type LancamentosData = { linhas: LinhaComStatus[]; contas: AccountRow[]; categorias: CategoryRow[]; subcategorias: SubcategoryRow[]; totais: { entradas: number; saidas: number; pendentes: number } }`
  - Server Actions (`requireUser()`, `try/catch`, `revalidatePath("/lancamentos")`, retorno `Resultado`):
    - `criarLancamento(fd)` — se `type === "installment"` e `parcelas > 1`: `expandirParcelas(...)` + `insert` em lote (gera `groupId` com `crypto.randomUUID()`); senão insere 1 linha.
    - `gerarMes(fd)` — lê `mes` (`YYYY-MM`); carrega templates ativos + as transações `recurring_template_id` daquele mês; `gerarTransacoesDoMes(...)`; `insert` em lote; retorna `{ ok: true, criados: n }`.
    - `mudarStatus(fd)` — `id`, `status` (`pending`|`paid`); `paid` → `payment_date = hojeISO()`, `pending` → `payment_date = null`.
    - `recalcularAtrasados()` — `update({ status: "overdue" }).eq("status","pending").lt("due_date", hojeISO())`.
    - `editarLancamento(fd)` — `id` + campos editáveis (não mexe em parcelas irmãs).
    - `excluirLancamento(fd)` — `id` (uma linha).
    - `excluirGrupoParcelas(fd)` — `installment_group_id` (todas as parcelas).

- [ ] **Step 1: Escrever `lib/lancamentos/load.ts`**

```ts
import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { derivarStatus } from "@/lib/lancamentos/overdue";
import { hojeISO } from "@/lib/datas";
import type {
  AccountRow,
  CategoryRow,
  SubcategoryRow,
  TransactionRow,
  TxStatus,
} from "@/lib/financas/types";

export type FiltroLancamentos = {
  mes: string;
  status?: TxStatus;
  contaId?: string;
  categoriaId?: string;
};

export type LinhaComStatus = TransactionRow & { statusEfetivo: TxStatus };

export type LancamentosData = {
  linhas: LinhaComStatus[];
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  totais: { entradas: number; saidas: number; pendentes: number };
};

export async function carregarLancamentos(
  filtro: FiltroLancamentos,
): Promise<LancamentosData> {
  const db = financasDb();
  const inicio = `${filtro.mes}-01`;
  const fim = `${filtro.mes}-31`;

  let q = db
    .from("fin_transactions")
    .select("*")
    .gte("due_date", inicio)
    .lte("due_date", fim)
    .order("due_date");
  if (filtro.contaId) q = q.eq("account_id", filtro.contaId);
  if (filtro.categoriaId) q = q.eq("category_id", filtro.categoriaId);

  const [tx, contas, categorias, subcategorias] = await Promise.all([
    q,
    db.from("fin_accounts").select("*").order("name"),
    db.from("fin_categories").select("*").order("name"),
    db.from("fin_subcategories").select("*").order("name"),
  ]);
  for (const r of [tx, contas, categorias, subcategorias]) {
    if (r.error) throw new Error(r.error.message);
  }

  const hoje = hojeISO();
  let linhas = ((tx.data ?? []) as TransactionRow[]).map((t) => ({
    ...t,
    statusEfetivo: derivarStatus(t, hoje),
  }));
  if (filtro.status) linhas = linhas.filter((l) => l.statusEfetivo === filtro.status);

  const totais = linhas.reduce(
    (acc, l) => {
      if (l.movement === "income") acc.entradas += l.amount;
      else acc.saidas += l.amount;
      if (l.statusEfetivo !== "paid") acc.pendentes += l.amount * (l.movement === "income" ? 0 : 1);
      return acc;
    },
    { entradas: 0, saidas: 0, pendentes: 0 },
  );

  return {
    linhas,
    contas: (contas.data ?? []) as AccountRow[],
    categorias: (categorias.data ?? []) as CategoryRow[],
    subcategorias: (subcategorias.data ?? []) as SubcategoryRow[],
    totais,
  };
}
```

- [ ] **Step 2: Escrever `app/lancamentos/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { expandirParcelas } from "@/lib/lancamentos/parcelas";
import { gerarTransacoesDoMes } from "@/lib/lancamentos/recorrentes";
import { hojeISO } from "@/lib/datas";
import type { Movement, TemplateRow, TxType } from "@/lib/financas/types";

export type Resultado =
  | { ok: true; criados?: number }
  | { ok: false; erro: string };

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const n = Number(str(fd, k).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function criarLancamento(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const description = str(fd, "description");
    const amount = num(fd, "amount");
    const movement = str(fd, "movement") as Movement;
    const due_date = str(fd, "due_date");
    const type = (str(fd, "type") || "variable") as TxType;
    if (!description || !due_date) return { ok: false, erro: "Preencha descrição e vencimento." };
    if (!(amount > 0)) return { ok: false, erro: "Valor inválido." };

    const db = financasDb();
    const account_id = str(fd, "account_id") || null;
    const category_id = str(fd, "category_id") || null;
    const subcategory_id = str(fd, "subcategory_id") || null;

    if (type === "installment") {
      const parcelas = Number(str(fd, "parcelas"));
      if (!Number.isInteger(parcelas) || parcelas < 1)
        return { ok: false, erro: "Número de parcelas inválido." };
      const linhas = expandirParcelas({
        descricao: description,
        valorTotal: amount,
        primeiroVencimento: due_date,
        parcelas,
        movement,
        accountId: account_id,
        categoryId: category_id,
        subcategoryId: subcategory_id,
        groupId: randomUUID(),
      });
      const { error } = await db.from("fin_transactions").insert(linhas);
      if (error) throw error;
    } else {
      const status = str(fd, "status") === "paid" ? "paid" : "pending";
      const { error } = await db.from("fin_transactions").insert({
        description,
        amount,
        movement,
        type,
        due_date,
        status,
        payment_date: status === "paid" ? hojeISO() : null,
        account_id,
        category_id,
        subcategory_id,
        source: "manual",
      });
      if (error) throw error;
    }

    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("criarLancamento", e);
    return { ok: false, erro: "Não foi possível salvar o lançamento." };
  }
}

export async function gerarMes(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const mes = str(fd, "mes"); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, erro: "Mês inválido." };
    const [ano, m] = mes.split("-").map(Number);
    const db = financasDb();

    const [tpls, existentes] = await Promise.all([
      db.from("fin_recurring_templates").select("*").eq("ativo", true),
      db
        .from("fin_transactions")
        .select("recurring_template_id,due_date")
        .gte("due_date", `${mes}-01`)
        .lte("due_date", `${mes}-31`)
        .not("recurring_template_id", "is", null),
    ]);
    if (tpls.error) throw tpls.error;
    if (existentes.error) throw existentes.error;

    const novas = gerarTransacoesDoMes(
      (tpls.data ?? []) as TemplateRow[],
      existentes.data ?? [],
      { ano, mes: m },
    );
    if (novas.length) {
      const { error } = await db.from("fin_transactions").insert(novas);
      if (error) throw error;
    }

    revalidatePath("/lancamentos");
    return { ok: true, criados: novas.length };
  } catch (e) {
    console.error("gerarMes", e);
    return { ok: false, erro: "Não foi possível gerar o mês." };
  }
}

export async function mudarStatus(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    const alvo = str(fd, "status") === "paid" ? "paid" : "pending";
    const { error } = await financasDb()
      .from("fin_transactions")
      .update({
        status: alvo,
        payment_date: alvo === "paid" ? hojeISO() : null,
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("mudarStatus", e);
    return { ok: false, erro: "Não foi possível mudar o status." };
  }
}

export async function recalcularAtrasados(): Promise<Resultado> {
  await requireUser();
  try {
    const { error } = await financasDb()
      .from("fin_transactions")
      .update({ status: "overdue" })
      .eq("status", "pending")
      .lt("due_date", hojeISO());
    if (error) throw error;
    revalidatePath("/lancamentos");
    revalidatePath("/cockpit");
    return { ok: true };
  } catch (e) {
    console.error("recalcularAtrasados", e);
    return { ok: false, erro: "Não foi possível recalcular." };
  }
}

// editarLancamento(fd): update dos campos editáveis em .eq("id", id).
// excluirLancamento(fd): delete .eq("id", id).
// excluirGrupoParcelas(fd): delete .eq("installment_group_id", gid).
// Todas: requireUser(), try/catch, revalidatePath("/lancamentos"), retorno Resultado.
```

- [ ] **Step 3: Escrever `app/lancamentos/page.tsx`**

```tsx
import { requireUser } from "@/lib/supabase/auth";
import { carregarLancamentos } from "@/lib/lancamentos/load";
import { Filtros } from "@/components/lancamentos/Filtros";
import { NovoLancamentoForm } from "@/components/lancamentos/NovoLancamentoForm";
import { LinhaLancamento } from "@/components/lancamentos/LinhaLancamento";
import { gerarMes, recalcularAtrasados } from "./actions";
import { hojeISO } from "@/lib/datas";
import type { TxStatus } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lançamentos — Finanças" };

export default async function LancamentosPage({
  searchParams,
}: PageProps<"/lancamentos">) {
  await requireUser();
  const sp = await searchParams;
  const mes = (sp.mes as string) || hojeISO().slice(0, 7);
  const data = await carregarLancamentos({
    mes,
    status: sp.status as TxStatus | undefined,
    contaId: sp.conta as string | undefined,
    categoriaId: sp.categoria as string | undefined,
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lançamentos</h1>
        <form action={gerarMes}>
          <input type="hidden" name="mes" value={mes} />
          <button className="border px-3 py-1 text-sm">Gerar mês</button>
        </form>
      </header>

      <Filtros
        mes={mes}
        contas={data.contas}
        categorias={data.categorias}
        atual={{ status: sp.status as string, conta: sp.conta as string, categoria: sp.categoria as string }}
      />

      <section className="grid grid-cols-3 gap-2 text-sm">
        <div>Entradas: {data.totais.entradas.toFixed(2)}</div>
        <div>Saídas: {data.totais.saidas.toFixed(2)}</div>
        <div>Em aberto: {data.totais.pendentes.toFixed(2)}</div>
      </section>

      <form action={recalcularAtrasados}>
        <button className="text-sm underline">Recalcular atrasados</button>
      </form>

      <NovoLancamentoForm
        contas={data.contas}
        categorias={data.categorias}
        subcategorias={data.subcategorias}
        mes={mes}
      />

      <ul className="flex flex-col divide-y">
        {data.linhas.map((l) => (
          <LinhaLancamento key={l.id} linha={l} />
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Escrever os 3 componentes**

- `Filtros.tsx` (`"use client"`): `<form method="get">` com selects de `mes` (`type="month"`), `status` (todos/pending/paid/overdue), `conta`, `categoria`; submit no `onChange` ou botão "Filtrar". Preserva o `mes` corrente.
- `NovoLancamentoForm.tsx` (`"use client"`, usa `useActionState(criarLancamento)`): campos `description`, `amount` (`inputMode="decimal"`), `movement` select, `type` select; quando `type === "installment"` mostra o campo `parcelas` (`number`, `min=1`); `due_date` (`type="date"`, default dia 1 do `mes`), selects de `conta`/`categoria`/`subcategoria` (subcategoria filtrada pela categoria escolhida — estado local), `status` (só quando não é `installment`). Mostra `estado.erro`.
- `LinhaLancamento.tsx` (server component + `<form>` nativos): descrição, valor formatado, vencimento, badge de `statusEfetivo`; `<form action={mudarStatus}>` com botão "Marcar pago" / "Reabrir"; `<details>` para editar (`editarLancamento`) e excluir (`excluirLancamento`, ou `excluirGrupoParcelas` quando `installment_group_id` presente — com aviso no texto do botão).

> Tratamento visual: `/impeccable shape /lancamentos`.

- [ ] **Step 5: Gate**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`

- [ ] **Step 6: Verificação manual (browser, schema aplicado)**

1. `/lancamentos` abre no mês corrente, lista vazia (ou seed).
2. Criar renda `movement=income`, `status=paid` → aparece, badge "pago", `payment_date` gravado.
3. Criar despesa parcelada em 3x → 3 linhas, vencimentos +1 mês, mesma descrição com `(i/3)`, soma bate.
4. Criar um template em `/configuracoes` e clicar "Gerar mês" → linha `pending` criada; clicar de novo → nada duplicado.
5. Lançamento `pending` com vencimento no passado → badge "atrasado" mesmo sem rodar nada (derivado).
6. "Recalcular atrasados" → o `status` no banco vira `overdue` (conferir no dashboard).
7. Filtrar por `status=overdue` → só os atrasados.

- [ ] **Step 7: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): tela de lancamentos com filtros, parcelas e gerar mes"
```

---

## Task 15: Tela `/lancamentos/importar` — import OFX

**Files:**
- Create: `apps/financas/app/lancamentos/importar/page.tsx`
- Create: `apps/financas/app/lancamentos/importar/actions.ts`
- Create: `apps/financas/components/lancamentos/FilaRevisao.tsx`

**Interfaces:**
- Consumes: `financasDb`, `requireUser` (Task 2); `parseOfx` (Task 11), `hashTransacao`, `classificar` (Task 12); row types.
- Produces:
  - `analisarOfx(fd: FormData): Promise<AnaliseResult>`
    - lê `arquivo` (File) + `account_id`; `texto = await arquivo.text()`; `parseOfx(texto)`; para cada transação calcula `hash = hashTransacao({ accountId, dataIso, valor, memo })`; busca em `fin_transactions` os `external_id` já existentes que casam com `(fitid ?? hash)` do lote (`.in("external_id", ids)`); `classificar(...)`.
    - `type CandidatoRevisao = { externalId: string; dataIso: string; valor: number; memo: string; movimentoSugerido: "income" | "expense"; novo: boolean }`
    - `type AnaliseResult = { ok: true; accountId: string; candidatos: CandidatoRevisao[] } | { ok: false; erro: string }`
    - **não grava nada.**
  - `confirmarImportacao(fd: FormData): Promise<Resultado>`
    - recebe `account_id` + um JSON `linhas` (array de `{ externalId, dataIso, valor, memo, movement, category_id, subcategory_id }`); insere em `fin_transactions` com `source: "ofx"`, `status: "paid"`, `payment_date: dataIso`, `due_date: dataIso`, `amount: Math.abs(valor)`, `external_id: externalId`; erro de unique (`23505`) numa linha → pula e conta; retorno `{ ok: true, criados, ignorados }`.

- [ ] **Step 1: Escrever `app/lancamentos/importar/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { parseOfx } from "@/lib/import/ofx";
import { hashTransacao, classificar } from "@/lib/import/dedupe";

export type CandidatoRevisao = {
  externalId: string;
  dataIso: string;
  valor: number;
  memo: string;
  movimentoSugerido: "income" | "expense";
  novo: boolean;
};
export type AnaliseResult =
  | { ok: true; accountId: string; candidatos: CandidatoRevisao[] }
  | { ok: false; erro: string };

export async function analisarOfx(fd: FormData): Promise<AnaliseResult> {
  await requireUser();
  try {
    const arquivo = fd.get("arquivo");
    const accountId = (fd.get("account_id") ?? "").toString().trim();
    if (!accountId) return { ok: false, erro: "Escolha a conta do extrato." };
    if (!(arquivo instanceof File) || arquivo.size === 0)
      return { ok: false, erro: "Envie um arquivo .ofx." };

    const texto = await arquivo.text();
    const transacoes = parseOfx(texto);
    if (!transacoes.length)
      return { ok: false, erro: "Nenhuma transação encontrada no arquivo." };

    const comHash = transacoes.map((t) => ({
      ...t,
      hash: hashTransacao({
        accountId,
        dataIso: t.dataIso,
        valor: t.valor,
        memo: t.memo,
      }),
    }));
    const ids = comHash.map((t) => t.fitid ?? t.hash);
    const { data: existentes, error } = await financasDb()
      .from("fin_transactions")
      .select("external_id")
      .in("external_id", ids);
    if (error) throw error;
    const jaImportados = new Set(
      (existentes ?? []).map((r) => r.external_id as string),
    );

    const classificados = classificar(
      comHash.map((t) => ({ hash: t.hash, fitid: t.fitid })),
      jaImportados,
    );

    const candidatos: CandidatoRevisao[] = comHash.map((t, i) => ({
      externalId: classificados[i].externalId,
      dataIso: t.dataIso,
      valor: t.valor,
      memo: t.memo,
      movimentoSugerido: t.movimentoSugerido,
      novo: classificados[i].novo,
    }));

    return { ok: true, accountId, candidatos };
  } catch (e) {
    console.error("analisarOfx", e);
    return { ok: false, erro: "Não foi possível ler o arquivo." };
  }
}

export type Resultado =
  | { ok: true; criados: number; ignorados: number }
  | { ok: false; erro: string };

export async function confirmarImportacao(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const accountId = (fd.get("account_id") ?? "").toString().trim();
    const linhas = JSON.parse((fd.get("linhas") ?? "[]").toString()) as Array<{
      externalId: string;
      dataIso: string;
      valor: number;
      memo: string;
      movement: "income" | "expense";
      category_id: string | null;
      subcategory_id: string | null;
    }>;
    if (!accountId || !linhas.length)
      return { ok: false, erro: "Nada para importar." };

    const db = financasDb();
    let criados = 0;
    let ignorados = 0;
    for (const l of linhas) {
      const { error } = await db.from("fin_transactions").insert({
        description: l.memo || "Importado",
        amount: Math.abs(l.valor),
        movement: l.movement,
        type: "variable",
        due_date: l.dataIso,
        payment_date: l.dataIso,
        status: "paid",
        account_id: accountId,
        category_id: l.category_id,
        subcategory_id: l.subcategory_id,
        source: "ofx",
        external_id: l.externalId,
      });
      if (error) {
        if (error.code === "23505") ignorados++;
        else throw error;
      } else criados++;
    }

    revalidatePath("/lancamentos");
    revalidatePath("/cockpit");
    return { ok: true, criados, ignorados };
  } catch (e) {
    console.error("confirmarImportacao", e);
    return { ok: false, erro: "Não foi possível concluir a importação." };
  }
}
```

- [ ] **Step 2: Escrever `app/lancamentos/importar/page.tsx`**

```tsx
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { FilaRevisao } from "@/components/lancamentos/FilaRevisao";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar OFX — Finanças" };

export default async function ImportarPage() {
  await requireUser();
  const db = financasDb();
  const [contas, categorias, subcategorias] = await Promise.all([
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
    db.from("fin_categories").select("*").eq("ativo", true).order("name"),
    db.from("fin_subcategories").select("*").eq("ativo", true).order("name"),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-bold">Importar extrato OFX</h1>
      <FilaRevisao
        contas={(contas.data ?? []) as AccountRow[]}
        categorias={(categorias.data ?? []) as CategoryRow[]}
        subcategorias={(subcategorias.data ?? []) as SubcategoryRow[]}
      />
    </main>
  );
}
```

- [ ] **Step 3: Escrever `components/lancamentos/FilaRevisao.tsx`** (`"use client"`)

Estados locais: `fase: "upload" | "revisao"`, `accountId`, `candidatos: CandidatoRevisao[]`, `atribs: Record<externalId, { movement, category_id, subcategory_id, incluir }>`, `erro`, `resultado`.
- Fase `upload`: `<select account_id>` + `<input type="file" accept=".ofx">` + botão que chama `analisarOfx(new FormData(form))`; on `ok` → guarda `candidatos`, vai pra `revisao`; inicializa `atribs` com `movement = movimentoSugerido`, `incluir = novo`.
- Fase `revisao`: tabela/lista dos `candidatos`. Linhas `novo === false` renderizam esmaecidas, `incluir` travado em `false`, sem selects. Linhas novas: `<select movement>`, `<select category>` (filtra `<select subcategory>`), checkbox "incluir", campo de descrição editável (default `memo`). Botão "Confirmar" monta `linhas` (só as `incluir`) e chama `confirmarImportacao` com `FormData` (`account_id` + `linhas` JSON). Mostra `resultado.criados` / `resultado.ignorados` e um link de volta pra `/lancamentos`.

> Tratamento visual: `/impeccable shape /lancamentos/importar`.

- [ ] **Step 4: Gate**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`

- [ ] **Step 5: Verificação manual (browser, schema aplicado)**

1. Gerar um `.ofx` de teste (2–3 `STMTTRN`, um débito, um crédito) — pode ser salvo à mão.
2. `/lancamentos/importar` → escolher conta, subir o arquivo → cai na revisão com os candidatos, todos "novo".
3. Débito sugere `expense`, crédito sugere `income`.
4. Categorizar uma linha, deixar outra fora (checkbox), confirmar → `criados` = incluídas, aparecem em `/lancamentos` como `paid`/`source ofx`.
5. Subir o **mesmo** arquivo de novo → as linhas já importadas aparecem esmaecidas e não selecionáveis; confirmar sem elas → `ignorados` reflete o que bateu no unique se forçar.

- [ ] **Step 6: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): import OFX com fila de revisao e dedupe"
```

---

## Task 16: Tela `/cockpit` (revisada — cockpit completo do `/impeccable shape`)

> Reescrita depois do brief de design confirmado: o desenho original desta task
> (saldos + split + projeção + alerta) virou só um subconjunto. Cobre agora os
> 6 KPIs, 2 roscas, seletor de mês, próximas contas, bloco Noetrix, bloco
> Cartões e últimos lançamentos.

**Files:**
- Create: `apps/financas/lib/cockpit/load.ts`
- Modify: `apps/financas/app/cockpit/page.tsx` (substitui o stub da Task 2)
- Create: `apps/financas/components/cockpit/SeletorMes.tsx`
- Create: `apps/financas/components/cockpit/KpisCockpit.tsx`
- Create: `apps/financas/components/cockpit/RoscaCategoria.tsx`
- Create: `apps/financas/components/cockpit/RoscaDistribuicao.tsx`
- Create: `apps/financas/components/cockpit/PainelSplit.tsx`
- Create: `apps/financas/components/cockpit/ProximasContas.tsx`
- Create: `apps/financas/components/cockpit/BlocoNoetrix.tsx`
- Create: `apps/financas/components/cockpit/BlocoCartoes.tsx`
- Create: `apps/financas/components/cockpit/UltimosLancamentos.tsx`
- Create: `apps/financas/components/cockpit/CardsSaldo.tsx`

**Interfaces:**
- Consumes: `financasDb`, `requireUser` (Task 2); `agregarMes` (Task 8), `calcularSplit` (Task 8), `calcularProjecao` (Task 9); `calcularKpis`, `agregarPorCategoria`, `agregarDistribuicao` (Task 8b); `hojeISO`, `fimDoMesISO` (Task 4); row types incl. `NoetrixMetricRow` (Task 4); colunas `fatura_atual`/`limite_disponivel` (Task 3b).
- Produces:
  - `carregarCockpit(mes: string): Promise<CockpitData>` — `mes` no formato `YYYY-MM`.
  - `type CockpitData = { mes: string; mesVigente: boolean; contas: AccountRow[]; saldoTotal: number; kpis: KpisCockpit; projecao: ProjecaoResult | null; split: SplitResult; categorias: LinhaCategoria[]; distribuicao: LinhaDistribuicao[]; proximasContas: TransactionRow[]; ultimosLancamentos: TransactionRow[]; noetrix: NoetrixMetricRow | null; gatilhos: { clientes: boolean; churn: boolean; reserva: boolean }; cartoes: AccountRow[]; investidoNoMes: number; metaInvestimento: number; alertaNegativo: boolean }`
    - `mesVigente` = `mes === hojeISO().slice(0, 7)`.
    - `saldoTotal` = soma de `balance` das contas ativas (não depende do mês — é saldo corrente, sem histórico na Fase 1).
    - `kpis` = `calcularKpis(txDoMes, hojeISO())` — **sempre** com a data real de hoje (não a referência do mês selecionado): `due_date` já ancora no mês, e `derivarStatus` contra o hoje real dá o resultado correto tanto pra mês passado (settled ou vencido de verdade) quanto futuro (nunca vencido).
    - `split` = `calcularSplit(resumo.rendaRecebida, resumo.gastosPorBucket)` com `resumo = agregarMes(txDoMes, categorias)`.
    - `categorias` = `agregarPorCategoria(txDoMes, categorias)` (rosca 1).
    - `distribuicao` = `agregarDistribuicao({ entradas: kpis.entradas, saidas: kpis.saidas, investimentos: kpis.investimentos, dividasNaoPagas: somaRemainingDividasAtivas })` (rosca 2).
    - `projecao` = **só quando `mesVigente`** — `calcularProjecao({ saldoContas: saldoTotal, transacoes: txDoMes, fimDoMesIso: fimDoMesISO(hojeISO()) })`; em mês não vigente, `null` (projetar o fim de um mês fechado ou muito futuro não é o que a projeção resolve — decisão desta revisão, documentada aqui em vez de forçar um número sem sentido).
    - `alertaNegativo` = `mesVigente && projecao !== null && projecao.projetado < 0`.
    - `proximasContas` = transações `movement=expense`, `status='pending'` (bruto — a janela de 7 dias à frente nunca alcança `overdue`/`paid`), `due_date` entre a referência e `+7` dias. Referência = `hojeISO()` se `mesVigente`, senão `${mes}-01`. Consulta própria (não reaproveita `txDoMes` — a janela pode cruzar a fronteira do mês).
    - `ultimosLancamentos` = transações com `payment_date` entre `hojeISO() - 7 dias` e `hojeISO()`, ordenadas por `payment_date desc`, limit 20. **Sempre relativo ao hoje real**, independente do mês selecionado — é um "o que aconteceu recentemente", não uma view do mês.
    - `noetrix` = registro de `fin_noetrix_metrics` onde `mes = '${mes}-01'`, ou `null` se não houver.
    - `gatilhos` = `{ clientes: (noetrix?.clientes_pagantes ?? 0) >= 80, churn: noetrix?.churn_pct != null && noetrix.churn_pct < 5, reserva: noetrix?.reserva_meses != null && noetrix.reserva_meses >= 4 }`.
    - `cartoes` = `contas.filter(c => c.bank === "nubank" || c.bank === "inter")`. `fatura_atual`/`limite_disponivel` são valor manual único (não historizado por mês na Fase 1) — o bloco mostra o mesmo valor em qualquer mês selecionado; a referência de data do mês **não** se aplica aqui (só a "próximas contas" tem janela de data real). Decisão desta revisão, documentada para não virar achado de review.
    - `metaInvestimento` = `split.metas.investimento`; `investidoNoMes` = `resumo.investidoNoMes`.

- [ ] **Step 1: Escrever `lib/cockpit/load.ts`**

```ts
import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { agregarMes } from "@/lib/cockpit/agrega";
import { calcularSplit, type SplitResult } from "@/lib/cockpit/split";
import { calcularProjecao, type ProjecaoResult } from "@/lib/cockpit/projecao";
import {
  calcularKpis,
  agregarPorCategoria,
  agregarDistribuicao,
  type KpisCockpit,
  type LinhaCategoria,
  type LinhaDistribuicao,
} from "@/lib/cockpit/roscas";
import { hojeISO, fimDoMesISO } from "@/lib/datas";
import type {
  AccountRow,
  CategoryRow,
  TransactionRow,
  NoetrixMetricRow,
} from "@/lib/financas/types";

function maisDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type CockpitData = {
  mes: string;
  mesVigente: boolean;
  contas: AccountRow[];
  saldoTotal: number;
  kpis: KpisCockpit;
  projecao: ProjecaoResult | null;
  split: SplitResult;
  categorias: LinhaCategoria[];
  distribuicao: LinhaDistribuicao[];
  proximasContas: TransactionRow[];
  ultimosLancamentos: TransactionRow[];
  noetrix: NoetrixMetricRow | null;
  gatilhos: { clientes: boolean; churn: boolean; reserva: boolean };
  cartoes: AccountRow[];
  investidoNoMes: number;
  metaInvestimento: number;
  alertaNegativo: boolean;
};

export async function carregarCockpit(mes: string): Promise<CockpitData> {
  const db = financasDb();
  const hoje = hojeISO();
  const mesVigente = mes === hoje.slice(0, 7);
  const referencia = mesVigente ? hoje : `${mes}-01`;

  const [contasR, catsR, txR, dividasR, noetrixR, proximasR, ultimosR] = await Promise.all([
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
    db.from("fin_categories").select("*"),
    db.from("fin_transactions").select("*").gte("due_date", `${mes}-01`).lte("due_date", `${mes}-31`),
    db.from("fin_debts").select("remaining_amount").eq("status", "ativa"),
    db.from("fin_noetrix_metrics").select("*").eq("mes", `${mes}-01`).maybeSingle(),
    db
      .from("fin_transactions")
      .select("*")
      .eq("movement", "expense")
      .eq("status", "pending")
      .gte("due_date", referencia)
      .lte("due_date", maisDias(referencia, 7))
      .order("due_date"),
    db
      .from("fin_transactions")
      .select("*")
      .not("payment_date", "is", null)
      .gte("payment_date", maisDias(hoje, -7))
      .lte("payment_date", hoje)
      .order("payment_date", { ascending: false })
      .limit(20),
  ]);
  for (const r of [contasR, catsR, txR, dividasR, proximasR, ultimosR]) {
    if (r.error) throw new Error(r.error.message);
  }
  if (noetrixR.error) throw new Error(noetrixR.error.message);

  const contas = (contasR.data ?? []) as AccountRow[];
  const categorias = (catsR.data ?? []) as CategoryRow[];
  const tx = (txR.data ?? []) as TransactionRow[];
  const noetrix = (noetrixR.data ?? null) as NoetrixMetricRow | null;

  const saldoTotal = Math.round(contas.reduce((s, c) => s + c.balance, 0) * 100) / 100;
  const kpis = calcularKpis(tx, hoje);
  const resumo = agregarMes(tx, categorias);
  const split = calcularSplit(resumo.rendaRecebida, resumo.gastosPorBucket);
  const dividasNaoPagas = Math.round(
    ((dividasR.data ?? []) as { remaining_amount: number }[]).reduce((s, d) => s + d.remaining_amount, 0) * 100,
  ) / 100;

  const projecao = mesVigente
    ? calcularProjecao({ saldoContas: saldoTotal, transacoes: tx, fimDoMesIso: fimDoMesISO(hoje) })
    : null;

  return {
    mes,
    mesVigente,
    contas,
    saldoTotal,
    kpis,
    projecao,
    split,
    categorias: agregarPorCategoria(tx, categorias),
    distribuicao: agregarDistribuicao({
      entradas: kpis.entradas,
      saidas: kpis.saidas,
      investimentos: kpis.investimentos,
      dividasNaoPagas,
    }),
    proximasContas: (proximasR.data ?? []) as TransactionRow[],
    ultimosLancamentos: (ultimosR.data ?? []) as TransactionRow[],
    noetrix,
    gatilhos: {
      clientes: (noetrix?.clientes_pagantes ?? 0) >= 80,
      churn: noetrix?.churn_pct != null && noetrix.churn_pct < 5,
      reserva: noetrix?.reserva_meses != null && noetrix.reserva_meses >= 4,
    },
    cartoes: contas.filter((c) => c.bank === "nubank" || c.bank === "inter"),
    investidoNoMes: resumo.investidoNoMes,
    metaInvestimento: split.metas.investimento,
    alertaNegativo: mesVigente && projecao !== null && projecao.projetado < 0,
  };
}
```

- [ ] **Step 2: Reescrever `app/cockpit/page.tsx`**

```tsx
import { requireUser } from "@/lib/supabase/auth";
import { carregarCockpit } from "@/lib/cockpit/load";
import { SeletorMes } from "@/components/cockpit/SeletorMes";
import { KpisCockpit } from "@/components/cockpit/KpisCockpit";
import { RoscaCategoria } from "@/components/cockpit/RoscaCategoria";
import { RoscaDistribuicao } from "@/components/cockpit/RoscaDistribuicao";
import { PainelSplit } from "@/components/cockpit/PainelSplit";
import { ProximasContas } from "@/components/cockpit/ProximasContas";
import { BlocoNoetrix } from "@/components/cockpit/BlocoNoetrix";
import { BlocoCartoes } from "@/components/cockpit/BlocoCartoes";
import { UltimosLancamentos } from "@/components/cockpit/UltimosLancamentos";
import { CardsSaldo } from "@/components/cockpit/CardsSaldo";
import { hojeISO } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit — Finanças" };

export default async function CockpitPage({
  searchParams,
}: PageProps<"/cockpit">) {
  await requireUser();
  const sp = await searchParams;
  const mes = (sp.mes as string) || hojeISO().slice(0, 7);
  const d = await carregarCockpit(mes);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <SeletorMes mes={d.mes} />
      {d.alertaNegativo && d.projecao && (
        <div role="alert" className="border border-red-600 bg-red-50 px-4 py-3 text-red-800">
          Saldo projetado para o fim do mês: R$ {d.projecao.projetado.toFixed(2)}
        </div>
      )}
      <KpisCockpit kpis={d.kpis} />
      <RoscaCategoria linhas={d.categorias} />
      <RoscaDistribuicao linhas={d.distribuicao} />
      <PainelSplit split={d.split} />
      <ProximasContas linhas={d.proximasContas} mesVigente={d.mesVigente} />
      <BlocoNoetrix noetrix={d.noetrix} gatilhos={d.gatilhos} />
      <BlocoCartoes cartoes={d.cartoes} />
      <CardsSaldo contas={d.contas} saldoTotal={d.saldoTotal} projecao={d.projecao} />
      <UltimosLancamentos linhas={d.ultimosLancamentos} />
      <section className="border px-4 py-3">
        <p className="font-semibold">Pague-se primeiro</p>
        <p className="text-sm">
          Meta de investimento no mês: R$ {d.metaInvestimento.toFixed(2)} · já investido: R$ {d.investidoNoMes.toFixed(2)}
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Escrever os componentes (server components exceto `SeletorMes`, sem estado além do form nativo)**

- `SeletorMes` (`"use client"` só pelo `<input type="month">` autosubmit — `<form method="get">` com `onChange` disparando `requestSubmit()`, ou botão "Ir" sem JS se preferir puro): `<input type="month" name="mes" defaultValue={mes} />`.
- `KpisCockpit`: hero do `kpis.saldo` (destaque, cor semântica — verde se `>= 0`, vermelho se `< 0`) + ticker compacto com `entradas`, `saidas`, `aVencer`, `vencidas`, `investimentos`.
- `RoscaCategoria`: rosca de `linhas: LinhaCategoria[]`; array vazio → estado empty explícito ("nenhum gasto lançado neste mês"), nunca gráfico quebrado.
- `RoscaDistribuicao`: rosca de `linhas: LinhaDistribuicao[]` (os 4 rótulos fixos); todos zero → mesmo estado empty.
- `PainelSplit`: inalterado do desenho original — 3 baldes (Necessidades 50% / Desejos 30% / Investimento 20%), meta vs real, barra, vermelho em `split.estouro[b]`; "Sem classificação" quando `> 0`. Estado vazio "aguardando a primeira renda do mês" quando `split.metas.investimento === 0`.
- `ProximasContas`: lista de `linhas` (descrição, valor, `due_date`); vazio → "nada vencendo nos próximos 7 dias"; título ajusta a referência quando `!mesVigente` ("a partir do dia 1").
- `BlocoNoetrix`: `noetrix?.mrr`, `noetrix?.clientes_pagantes`, semáforo dos 3 `gatilhos` (verde/vermelho por gatilho); `noetrix === null` → estado "sem métrica lançada neste mês" com link pra `/configuracoes`.
- `BlocoCartoes`: uma linha por conta em `cartoes` (`name`, `fatura_atual`, `limite_disponivel`); ambos `null` → "sem fatura lançada"; `cartoes` vazio (nenhuma conta nubank/inter ativa) → não renderiza o bloco.
- `UltimosLancamentos`: lista de `linhas` (descrição, valor, `payment_date`, `movement`); vazio → "nada pago nos últimos 7 dias".
- `CardsSaldo`: uma linha por conta (`name`, `bank`, `balance`), o `saldoTotal`; bloco de projeção (`projecao.entradasPrevistas/saidasPrevistas/projetado`) só quando `projecao !== null`.

> Tratamento visual: `/impeccable shape /cockpit` — direção confirmada (hero+ticker pro Saldo/KPIs, cards elevados com glow pro resto, dourado nos blocos Noetrix/premium). Esta task entrega estrutura, dados e estados; layout final na implementação visual.

- [ ] **Step 4: Gate**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`

- [ ] **Step 5: Verificação manual (browser, schema + migration da Task 3b aplicados)**

1. Sem lançamentos no mês: `/cockpit` mostra os 6 KPIs zerados, roscas em estado empty, painel 50/30/20 "aguardando renda", saldos das contas.
2. Lançar renda `income`/`paid` de R$ 4.000 → KPI Entradas = 4.000; metas 50/30/20 viram 2.000/1.200/800.
3. Lançar despesa `necessidade` `paid` de R$ 1.200 → KPI Saídas = 1.200; rosca de categoria mostra a fatia.
4. Lançar despesa `pending` com vencimento em 3 dias → aparece em "Próximas contas"; com vencimento no passado → some de "próximas" e conta em "Vencidas" (KPI).
5. Trocar o mês no seletor pra um mês passado com lançamentos pagos → KPIs mostram o fechamento daquele mês; sem faixa de alerta (projeção é `null`).
6. Sem métrica Noetrix do mês → bloco mostra "sem dado"; lançar uma em Configurações → bloco preenche e semáforo reage aos 3 gatilhos.
7. Editar `fatura_atual`/`limite_disponivel` da conta Nubank em Configurações → aparece no bloco Cartões do Cockpit.
8. Marcar um lançamento como pago hoje → aparece em "Últimos lançamentos".
9. Projeção negativa no mês vigente → faixa vermelha no topo com o valor.

- [ ] **Step 6: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): cockpit completo (kpis, roscas, noetrix, cartoes, proximas contas)"
```

---

## Task 17: Tela `/dividas`

**Files:**
- Create: `apps/financas/lib/dividas/load.ts`
- Create: `apps/financas/app/dividas/actions.ts`
- Create: `apps/financas/app/dividas/page.tsx`
- Create: `apps/financas/components/dividas/GrupoDividas.tsx`
- Create: `apps/financas/components/dividas/RegistrarPagamentoForm.tsx`

**Interfaces:**
- Consumes: `financasDb`, `requireUser` (Task 2); `progressoDivida`, `progressoAgregado` (Task 10); `hojeISO` (Task 4); `DebtRow`, `Grupo` (Task 4).
- Produces:
  - `carregarDividas(): Promise<DividasData>` — `type DividasData = { dividas: DebtRow[]; contas: AccountRow[]; agregado: AgregadoResult }` (ordena por `grupo`, depois `remaining_amount` desc).
  - Server Actions (`requireUser()`, `try/catch`, `revalidatePath("/dividas")` + `revalidatePath("/cockpit")`, `Resultado`):
    - `registrarPagamentoDivida(fd)` — `debt_id`, `amount`, `account_id` (opcional), `due_date` (default `hojeISO()`), `status` (`paid` default). Chama a RPC: `financasDb().rpc("fn_registrar_pagamento_divida", { p_debt_id, p_amount, p_account_id, p_due_date, p_status })`. Erro da RPC → mensagem genérica.
    - `criarDivida(fd)` — `creditor`, `grupo`, `total_amount`, `remaining_amount` (default = total), `monthly_payment?`, `due_day?`.
    - `editarDivida(fd)` — `id` + campos (inclui `remaining_amount` e `status`).

- [ ] **Step 1: Escrever `lib/dividas/load.ts`**

```ts
import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { progressoAgregado, type AgregadoResult } from "@/lib/dividas/progresso";
import type { AccountRow, DebtRow } from "@/lib/financas/types";

export type DividasData = {
  dividas: DebtRow[];
  contas: AccountRow[];
  agregado: AgregadoResult;
};

export async function carregarDividas(): Promise<DividasData> {
  const db = financasDb();
  const [dv, contas] = await Promise.all([
    db.from("fin_debts").select("*").order("grupo").order("remaining_amount", { ascending: false }),
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
  ]);
  if (dv.error) throw new Error(dv.error.message);
  if (contas.error) throw new Error(contas.error.message);

  const dividas = (dv.data ?? []) as DebtRow[];
  return {
    dividas,
    contas: (contas.data ?? []) as AccountRow[],
    agregado: progressoAgregado(dividas),
  };
}
```

- [ ] **Step 2: Escrever `app/dividas/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/datas";

export type Resultado = { ok: true } | { ok: false; erro: string };

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const n = Number(str(fd, k).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function registrarPagamentoDivida(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const p_debt_id = str(fd, "debt_id");
    const p_amount = num(fd, "amount");
    const p_account_id = str(fd, "account_id") || null;
    const p_due_date = str(fd, "due_date") || hojeISO();
    const p_status = str(fd, "status") || "paid";
    if (!p_debt_id) return { ok: false, erro: "Dívida não informada." };
    if (!(p_amount > 0)) return { ok: false, erro: "Valor inválido." };

    const { error } = await financasDb().rpc("fn_registrar_pagamento_divida", {
      p_debt_id,
      p_amount,
      p_account_id,
      p_due_date,
      p_status,
    });
    if (error) throw error;

    revalidatePath("/dividas");
    revalidatePath("/cockpit");
    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("registrarPagamentoDivida", e);
    return { ok: false, erro: "Não foi possível registrar o pagamento." };
  }
}

// criarDivida(fd) / editarDivida(fd): requireUser() -> validar creditor/grupo/
// total_amount -> insert/update -> revalidatePath("/dividas") -> catch genérico.
// criarDivida: remaining_amount default = total_amount quando o campo vier vazio.
```

- [ ] **Step 3: Escrever `app/dividas/page.tsx`**

```tsx
import { requireUser } from "@/lib/supabase/auth";
import { carregarDividas } from "@/lib/dividas/load";
import { GrupoDividas } from "@/components/dividas/GrupoDividas";
import type { Grupo } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dívidas — Finanças" };

const ORDEM: Grupo[] = ["fgts", "consignado", "serasa", "pessoal", "familia", "cartao"];
const ROTULO: Record<Grupo, string> = {
  fgts: "FGTS",
  consignado: "Consignado",
  serasa: "Serasa",
  pessoal: "Pessoal / rotativo",
  familia: "Família",
  cartao: "Cartões",
};

export default async function DividasPage() {
  await requireUser();
  const d = await carregarDividas();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-bold">Dívidas</h1>
      <section className="border px-4 py-3">
        <p className="font-semibold">Total do passivo</p>
        <p className="text-sm">
          Restante R$ {d.agregado.geral.restante.toFixed(2)} de R$ {d.agregado.geral.total.toFixed(2)}
          {" "}({Math.round(d.agregado.geral.progresso * 100)}% quitado)
        </p>
      </section>
      {ORDEM.map((g) => (
        <GrupoDividas
          key={g}
          rotulo={ROTULO[g]}
          linha={d.agregado.porGrupo[g]}
          dividas={d.dividas.filter((x) => x.grupo === g)}
          contas={d.contas}
        />
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Escrever `GrupoDividas.tsx` e `RegistrarPagamentoForm.tsx`**

- `GrupoDividas` (server): cabeçalho com `rotulo`, `linha.restante`/`linha.total`, barra `linha.progresso`. Oculta o grupo inteiro quando não há dívidas nele. Por dívida: `creditor`, `remaining_amount`/`total_amount`, barra por `progressoDivida`, `monthly_payment` e `due_day` se houver, badge `status`. `<details>` "Registrar pagamento" → `RegistrarPagamentoForm`. `<details>` "Editar" → form de `editarDivida`.
- `RegistrarPagamentoForm` (`"use client"`, `useActionState(registrarPagamentoDivida)`): hidden `debt_id`; `amount` (`inputMode="decimal"`, default `monthly_payment ?? ""`), `<select account_id>`, `due_date` (`type="date"`, default hoje), `<select status>` (`paid`/`pending`). Mostra `estado.erro`.
- Form de nova dívida no topo da página ou numa seção própria (`criarDivida`): `creditor`, `<select grupo>`, `total_amount`, `remaining_amount` (opcional), `monthly_payment` (opcional), `due_day` (opcional).

> Tratamento visual: `/impeccable shape /dividas`.

- [ ] **Step 5: Gate**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build`

- [ ] **Step 6: Verificação manual (browser, schema + seed aplicados)**

1. `/dividas` mostra os 6 grupos do seed, total ~R$ 56.891, 0% quitado.
2. Registrar pagamento de R$ 900 no consignado com `status=paid` → `remaining_amount` cai 900, barra move, e aparece uma transação `expense`/`paid` em `/lancamentos` ("Pagamento: ...").
3. Registrar pagamento que zera uma dívida → `status` vira `quitada`.
4. `/cockpit` reflete a saída (projeção/real) após o pagamento.
5. Criar uma dívida nova sem `remaining_amount` → assume o `total_amount`.

- [ ] **Step 7: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): tela de dividas com progresso e RPC de pagamento"
```

---

## Task 18: Navegação, shell e fechamento

**Files:**
- Create: `apps/financas/components/Shell.tsx`
- Create: `apps/financas/components/Topbar.tsx`
- Create: `apps/financas/components/LogoutButton.tsx`
- Modify: `apps/financas/app/layout.tsx` (envolve `children` no `Shell`, exceto `/login`)
- Modify: cada `app/<rota>/page.tsx` — adicionar `metadata.title` já feito nas tasks; conferir consistência.

**Interfaces:**
- Consumes: `browserSupabase` (Task 2).
- Produces: `Shell` (moldura com `Topbar` + `<main>`), `Topbar` (drawer mobile-first com links Cockpit / Lançamentos / Dívidas / Configurações + `LogoutButton`), `LogoutButton` (`"use client"`, `browserSupabase.auth.signOut({ scope: "local" })` + `location.assign("/login")`).

- [ ] **Step 1: Escrever `LogoutButton.tsx`**

```tsx
"use client";

import { browserSupabase } from "@/lib/supabase/client";

export function LogoutButton() {
  async function sair() {
    await browserSupabase().auth.signOut({ scope: "local" });
    location.assign("/login");
  }
  return (
    <button onClick={sair} className="text-sm underline">
      Sair
    </button>
  );
}
```

- [ ] **Step 2: Escrever `Topbar.tsx` e `Shell.tsx`**

- `Topbar` (`"use client"`): barra fixa no topo com título "Finanças" e botão hambúrguer que abre um drawer (`<dialog>` ou estado local) com os 4 links (`next/link`) e o `LogoutButton`. `usePathname()` marca o link ativo. Mobile-first: drawer full-height à esquerda.
- `Shell` (server): `<div class="min-h-dvh flex flex-col"><Topbar /><div class="flex-1">{children}</div></div>`.

- [ ] **Step 3: Ligar o `Shell` no layout**

Envolver `children` no `Shell` no `app/layout.tsx`. O `/login` não deve mostrar a `Topbar` — como o layout raiz é único, `Shell` renderiza a `Topbar` condicionalmente: passar `semChrome` a partir de `usePathname()` no `Topbar` (`if (pathname === "/login") return null`).

```tsx
// app/layout.tsx — trecho do body
<body className="min-h-full flex flex-col">
  <Shell>{children}</Shell>
</body>
```

- [ ] **Step 4: Gate completo**

Run: `pnpm --filter financas typecheck && pnpm --filter financas lint && pnpm --filter financas build && pnpm --filter financas check`
Expected: tudo verde; `financas.check: OK`; rotas `/`, `/login`, `/cockpit`, `/lancamentos`, `/lancamentos/importar`, `/dividas`, `/configuracoes` no output do build.

- [ ] **Step 5: Verificação manual final (browser)**

1. Logado, a `Topbar` aparece em todas as telas menos `/login`.
2. O drawer abre no mobile (375px), navega entre as 4 telas, marca a ativa.
3. "Sair" → volta pra `/login`; abrir `/cockpit` de novo → redireciona pra `/login`.
4. Recarregar cada rota direto pela URL → carrega sem erro.

- [ ] **Step 6: Revisar o diff da branch inteira**

Conferir contra o spec: 6 tabelas + RPC nos drafts, mais o draft da Task 3b (`fatura_atual`/`limite_disponivel` + `fin_noetrix_metrics`); `financasDb()` service-role só no servidor; `requireUser()` em toda página e Server Action; nenhum `.env*` no working tree; `overdue` só materializado pela ação manual; mensagens de erro genéricas.

- [ ] **Step 7: Commit**

```bash
git add apps/financas
git commit -m "feat(financas): shell, navegacao em drawer e logout"
```

---

## Self-Review (preenchido na escrita do plano)

**1. Cobertura do spec:**

| Requisito do spec | Task |
| --- | --- |
| App sibling no monorepo, stack fixa | 1 |
| `financasDb()` Path A + auth `@supabase/ssr` + `/login` | 2 |
| Schema `financas` com 6 tabelas + índices | 3 |
| RPC `fn_registrar_pagamento_divida` | 3 |
| Seed (3 contas, 6 grupos de dívida, categorias com bucket) | 3 |
| `fin_accounts.fatura_atual`/`limite_disponivel` + `fin_noetrix_metrics` (revisão pós-shape) | 3b |
| Helpers de data com clamp de fim de mês | 4 |
| Parcelas com rateio exato | 5 |
| Recorrentes idempotentes ("gerar mês") | 6 |
| `overdue` derivado na leitura | 7 |
| Painel 50/30/20 comparativo (agrega + split) | 8 |
| KPIs do Cockpit (entradas/saídas/a vencer/vencidas/investimentos/saldo) + roscas de categoria/distribuição (revisão pós-shape) | 8b |
| Saldo projetado sem clamp | 9 |
| Progresso de dívida por linha / grupo / total | 10 |
| Parse OFX (SGML + XML) | 11 |
| Dedupe por hash / FITID | 12 |
| Tela Configurações (contas, categorias, subcategorias, recorrentes, métricas Noetrix) | 13 |
| Tela Lançamentos (lista, filtros, criar, parcelas, gerar mês, status, recalcular atrasados, editar/excluir) | 14 |
| Tela Importar OFX (analisar sem gravar, fila de revisão, confirmar) | 15 |
| Tela Cockpit completa (seletor de mês, 6 KPIs, 2 roscas, 50/30/20, projeção, alerta, próximas contas, bloco Noetrix, bloco Cartões, últimos lançamentos) | 16 |
| Tela Dívidas (mapa por grupo, progresso, registrar pagamento) | 17 |
| Navegação mobile-first + logout | 18 |
| Erros: `try/catch`, `console.error`, mensagem pt-BR genérica | 13–17 (padrão nas actions) |
| Testes: `assert` puro via `node --experimental-strip-types` | 4–12, 8b |
| Verificação manual (Supabase live, 375px) | 13–18 (Steps de verificação) |

Fora do escopo por decisão do spec (sem task, proposital): `fin_budgets`, `fin_month_closures`, tela completa de Cartões (fatura linha a linha, parcelamento), tela de Metas CLT, Calendário, CSV por banco, Open Finance. (Cartões e Noetrix como **blocos manuais do Cockpit** entraram na Fase 1 na revisão pós-shape — Tasks 3b/8b/13/16 — não são mais fora do escopo.)

**2. Placeholders:** `<UUID_EWERTON>` no SQL é valor de runtime, resolvido no checklist de aplicação (Task 3 Step 5), não um TODO de design. Nenhum "TBD"/"implementar depois" nos passos de código. Os componentes de UF (Tasks 13–18 Step 4) descrevem campos, estados e bindings concretos; o tratamento visual é explicitamente delegado ao `/impeccable shape` de cada rota (constraint global), não omitido por preguiça.

**3. Consistência de tipos:** `NovaTransacao` (Task 4) é a forma de insert usada por `expandirParcelas` (5), `gerarTransacoesDoMes` (6) e as actions (14). `TxStatus`/`Movement`/`Grupo`/`Bucket` vêm todos de `lib/financas/types.ts` (Task 4) e são reusados sem redeclaração. `Resultado` das Server Actions tem a mesma forma em todas as telas (`{ ok: true } | { ok: false; erro: string }`, com `criados`/`ignorados` opcionais no import). `financas.check.ts` é criado na Task 4 e cada task de lógica pura (5–12) só acrescenta asserts + um import.

---

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-09-04-financas-fase-1.md`.

Antes da execução das tasks de UI (13–18), rodar `/impeccable shape` de cada superfície: `/cockpit`, `/lancamentos`, `/lancamentos/importar`, `/dividas`, `/configuracoes`, `/login`.

Antes da Task 13, aplicar as migrations (Task 3 Step 5): criar o usuário no Supabase, trocar `<UUID_EWERTON>`, promover os drafts para `infra/supabase/migrations/` à mão, rodar, expor o schema `financas` no PostgREST.
