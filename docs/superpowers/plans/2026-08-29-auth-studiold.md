# Autenticação do StudiOLD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir login (e-mail + senha, Supabase Auth) antes de qualquer rota do `apps/studiold`; sessão em cookie que sobrevive a refresh; botão de sair no drawer de navegação.

**Architecture:** Camada aditiva. `proxy.ts` (Next 16) faz o gate rápido de toda rota + renova o token de sessão; `requireUser()` no topo de cada página protegida faz o recheck autoritativo (`getUser()`). Login por Server Action + form nativo. `lib/supabase/server.ts` (service-role, path A) e `tenantDb()` não mudam — auth só decide se a request chega no RSC.

**Tech Stack:** Next.js 16.3.3 (App Router, `proxy.ts`, Server Actions, `useActionState`), React 19.2.8, `@supabase/ssr` (novo), `@supabase/supabase-js` (já presente), Supabase Auth.

**Spec:** `docs/superpowers/specs/2026-08-29-auth-studiold-design.md`

## Global Constraints

- Toda a UI em pt-BR: labels, placeholders, mensagens, erros, botões, estado.
- `apps/studiold/app/globals.css` intocado. NENHUM CSS novo. A tela de login reusa `.shell`, `.field`, `.btn`, `.btn--primary`, `.slip__meta` de `@/app/agenda/agenda.module.css` + utilitários Tailwind.
- Nova dependência: **só** `@supabase/ssr`. Nada mais.
- Env: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ambos já em `apps/studiold/.env.local`). NUNCA ler `SUPABASE_SERVICE_ROLE_KEY` no caminho de auth. Não editar `.env*` (protegido).
- Next 16: o arquivo é `apps/studiold/proxy.ts` (NÃO `middleware.ts`), export nomeado `proxy`, ao lado de `app/`. `cookies()` de `next/headers` é **async** → `await cookies()`.
- `lib/supabase/server.ts` / `tenantDb()` / path A / RLS de `barbearia_001`: NÃO mudam. Sem schema change, sem migration. `public.tenant_usuarios` não é consultado.
- Sem testes de framework. Sem lógica pura nova → `apps/studiold/lib/agenda/agenda.check.ts` não muda. Aceitação é o checklist manual da Task 6.
- Todo controle interativo com `<label htmlFor>` ou `aria-label`. Mobile-first (375px).
- `matcher` do proxy exclui `_next/static`, `_next/image`, `favicon.ico`, `*.svg`.

---

### Task 1: Dependência + clients Supabase de auth

**Files:**
- Modify: `apps/studiold/package.json` (via `pnpm add`)
- Create: `apps/studiold/lib/supabase/client.ts`
- Create: `apps/studiold/lib/supabase/auth.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  // lib/supabase/client.ts
  export function browserSupabase(): SupabaseClient

  // lib/supabase/auth.ts
  export function authServer(): Promise<SupabaseClient>
  export function requireUser(): Promise<import("@supabase/supabase-js").User>   // redirect("/login") se não houver user
  export function getUserOpcional(): Promise<import("@supabase/supabase-js").User | null>
  ```

- [ ] **Step 1: Instalar `@supabase/ssr`**

Run:
```bash
pnpm --filter studiold add @supabase/ssr
```
Expected: adiciona `@supabase/ssr` (0.x) a `apps/studiold/package.json` `dependencies` e atualiza `pnpm-lock.yaml`. Nenhuma outra dependência.

- [ ] **Step 2: Criar `lib/supabase/client.ts`**

Create `apps/studiold/lib/supabase/client.ts`:

```ts
// Client Supabase do browser (anon key). A sessão vive em cookie, gerida
// pelo @supabase/ssr. Só componentes de cliente importam isto — hoje, só o
// botão de logout. Acesso a dados de barbearia_001 continua em tenantDb().

import { createBrowserClient } from "@supabase/ssr";

export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(url, anon);
}
```

- [ ] **Step 3: Criar `lib/supabase/auth.ts`**

Create `apps/studiold/lib/supabase/auth.ts`:

```ts
// Server client Supabase ligado aos cookies da request (RSC e Server
// Actions). Anon key — a autorização vem do JWT do usuário no cookie, não da
// service-role. Para dados de barbearia_001 continua sendo tenantDb().

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, anon };
}

/** Client ligado ao cookie store da request. Em RSC o setAll é no-op (o
 *  proxy renova o cookie); em Server Action o setAll grava de verdade. */
export async function authServer() {
  const store = await cookies();
  const { url, anon } = env();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // RSC: cookies() é read-only aqui. O refresh acontece no proxy.
        }
      },
    },
  });
}

/** getUser() autoritativo (valida no Auth server). Redireciona pra /login
 *  se não houver usuário. Primeira linha das páginas protegidas. */
export async function requireUser(): Promise<User> {
  const supabase = await authServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** getUser() sem redirect — a página /login usa pra mandar quem já está
 *  logado direto pro /agenda. */
export async function getUserOpcional(): Promise<User | null> {
  const supabase = await authServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
```

- [ ] **Step 4: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos. `agenda.check: OK`. Build lista as 5 rotas de hoje (`/`, `/agenda`, `/clientes`, `/configuracoes`, `/financeiro`, `_not-found`) — nenhuma nova ainda (os módulos não são importados por ninguém).

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/package.json apps/studiold/pnpm-lock.yaml pnpm-lock.yaml apps/studiold/lib/supabase/client.ts apps/studiold/lib/supabase/auth.ts
git commit -m "feat: @supabase/ssr + clients de auth (browser e server-com-cookies)"
```
(Se o lockfile do monorepo estiver na raiz, `git add pnpm-lock.yaml` cobre; se não existir, o `git add` ignora silenciosamente. Ajustar ao que `git status` mostrar.)

---

### Task 2: Rota `/login` (página, form, Server Action)

**Files:**
- Create: `apps/studiold/app/login/actions.ts`
- Create: `apps/studiold/app/login/LoginForm.tsx`
- Create: `apps/studiold/app/login/page.tsx`

**Interfaces:**
- Consumes: `authServer`, `getUserOpcional` de `@/lib/supabase/auth` (Task 1).
- Produces:
  ```ts
  // app/login/actions.ts
  export type EntrarEstado = { erro: string | null };
  export function entrar(prev: EntrarEstado, fd: FormData): Promise<EntrarEstado>
  ```

- [ ] **Step 1: `app/login/actions.ts`**

Create `apps/studiold/app/login/actions.ts`:

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

  redirect("/agenda");
}
```

Nota: `redirect()` lança `NEXT_REDIRECT` internamente — não envolver em try/catch. `signInWithPassword` no `authServer` grava os cookies de sessão via o `setAll` (que num contexto de Server Action consegue escrever).

- [ ] **Step 2: `app/login/LoginForm.tsx`**

Create `apps/studiold/app/login/LoginForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { entrar, type EntrarEstado } from "./actions";
import styles from "@/app/agenda/agenda.module.css";

const INICIAL: EntrarEstado = { erro: null };

export function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className={`${styles.field} flex flex-col gap-1.5`}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          autoFocus
        />
      </div>
      <div className={`${styles.field} flex flex-col gap-1.5`}>
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {estado.erro && (
        <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        className={`${styles.btn} ${styles["btn--primary"]}`}
        disabled={pendente}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `app/login/page.tsx`**

Create `apps/studiold/app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getUserOpcional } from "@/lib/supabase/auth";
import { LoginForm } from "./LoginForm";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUserOpcional()) redirect("/agenda");

  return (
    <div className={styles.shell}>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img
          src="/studiold-logo.svg"
          alt="StudiOLD"
          className="mb-8 h-10 w-auto self-start"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <h1 className="mb-1 text-lg font-semibold">Entrar</h1>
        <p className={`${styles.slip__meta} mb-6`}>Acesso restrito à equipe.</p>
        <LoginForm />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: limpos. Build agora lista `/login` entre as rotas (7 no total com `_not-found`).

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/login
git commit -m "feat: rota /login (form nativo + Server Action entrar)"
```

---

### Task 3: `proxy.ts` — gate de rota + refresh de sessão

**Files:**
- Create: `apps/studiold/proxy.ts`

**Interfaces:**
- Consumes: `@supabase/ssr` `createServerClient` (Task 1 instalou o pacote). Não importa `lib/supabase/auth.ts` (o proxy roda no edge/isolado — cria seu próprio client com os cookies da `NextRequest`).
- Produces: nada importável. Efeito: toda request sem sessão fora de `/login` vira 307 `/login`; com sessão em `/login` vira 307 `/agenda`.

- [ ] **Step 1: Criar `apps/studiold/proxy.ts`**

Create `apps/studiold/proxy.ts`:

```ts
// Gate de autenticação do StudiOLD. Next 16: este arquivo era middleware.ts.
// Renova o cookie de sessão e redireciona não-autenticado para /login.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "proxy: faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emLogin = request.nextUrl.pathname === "/login";

  if (!user && !emLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    const r = NextResponse.redirect(destino);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  if (user && emLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/agenda";
    const r = NextResponse.redirect(destino);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
```

- [ ] **Step 2: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: limpos. O build reconhece `proxy.ts` (não aparece na lista de rotas; se o build logar algo como "Proxy" / "Middleware" compilado, é esperado).

- [ ] **Step 3: Conferência manual (anotar no report, não bloqueia)**

Descrever no report: `pnpm --filter studiold dev`, abrir `http://localhost:3000/agenda` sem cookie de sessão → deve redirecionar pra `/login`. Abrir `/login` → renderiza o form. (Sem usuário criado ainda, não dá pra testar o caminho autenticado aqui — fica pra Task 6.)

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/proxy.ts
git commit -m "feat: proxy.ts — gate de auth + refresh de sessão em toda rota"
```

---

### Task 4: `requireUser()` nas páginas protegidas

**Files:**
- Modify: `apps/studiold/app/page.tsx`
- Modify: `apps/studiold/app/agenda/page.tsx`
- Modify: `apps/studiold/app/clientes/page.tsx`
- Modify: `apps/studiold/app/financeiro/page.tsx`
- Modify: `apps/studiold/app/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `requireUser` de `@/lib/supabase/auth` (Task 1).
- Produces: nada.

São 5 edições da mesma forma: adicionar o import e `await requireUser()` como primeira instrução do componente. Um único dispatch cobre as 5.

- [ ] **Step 1: `app/page.tsx`**

Arquivo hoje:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/agenda");
}
```
Passa a:
```tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";

export default async function Home() {
  await requireUser();
  redirect("/agenda");
}
```

- [ ] **Step 2: `app/agenda/page.tsx`**

Adicionar ao bloco de imports do topo:
```ts
import { requireUser } from "@/lib/supabase/auth";
```
E `await requireUser();` como **primeira linha do corpo** de `export default async function AgendaPage()` (a função já é `async`), antes de qualquer `loadAgendaData()` / cálculo de data.

- [ ] **Step 3: `app/clientes/page.tsx`**

Adicionar ao bloco de imports:
```ts
import { requireUser } from "@/lib/supabase/auth";
```
E `await requireUser();` como primeira linha do corpo de `export default async function ClientesPage()`, antes de `const db = tenantDb();`.

- [ ] **Step 4: `app/financeiro/page.tsx`**

Adicionar ao bloco de imports:
```ts
import { requireUser } from "@/lib/supabase/auth";
```
E `await requireUser();` como primeira linha do corpo do componente `export default async function` da página, antes de qualquer acesso a `searchParams` / `tenantDb()`.

- [ ] **Step 5: `app/configuracoes/page.tsx`**

Adicionar ao bloco de imports:
```ts
import { requireUser } from "@/lib/supabase/auth";
```
E `await requireUser();` como primeira linha do corpo de `export default async function ConfiguracoesPage()`, antes de `const db = tenantDb();`.

- [ ] **Step 6: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: limpos, `agenda.check: OK`, mesma lista de rotas (`/`, `/agenda`, `/clientes`, `/configuracoes`, `/financeiro`, `/login`, `_not-found`).

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/app/page.tsx apps/studiold/app/agenda/page.tsx apps/studiold/app/clientes/page.tsx apps/studiold/app/financeiro/page.tsx apps/studiold/app/configuracoes/page.tsx
git commit -m "feat: requireUser() no topo de cada página protegida"
```

---

### Task 5: Botão de sair no drawer de navegação

**Files:**
- Create: `apps/studiold/components/LogoutButton.tsx`
- Modify: `apps/studiold/components/Topbar.tsx`

**Interfaces:**
- Consumes: `browserSupabase` de `@/lib/supabase/client` (Task 1); `Icon` de `@/components/agenda/Icon` (glyph `lock` existe); `useRouter` de `next/navigation`.
- Produces:
  ```ts
  export function LogoutButton(): JSX.Element
  ```

- [ ] **Step 1: `components/LogoutButton.tsx`**

Create `apps/studiold/components/LogoutButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/client";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    try {
      await browserSupabase().auth.signOut();
    } catch {
      // mesmo que o signOut falhe no servidor, o cookie local é limpo;
      // seguimos pro /login e o proxy resolve o resto.
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      className={`${styles.navItem} w-full`}
      onClick={sair}
      disabled={saindo}
    >
      <Icon name="lock" size={17} /> {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
```

- [ ] **Step 2: Ligar no `Topbar.tsx`**

Em `apps/studiold/components/Topbar.tsx`:

2a. Adicionar ao bloco de imports do topo:
```ts
import { LogoutButton } from "@/components/LogoutButton";
```

2b. Dentro do `NavDrawer`, no fim do `<div className={styles.navList}>` — depois do `.map` de `GERENCIAR` e antes de fechar a `</div>` — inserir:
```tsx
          <div className={styles.navDivider} role="separator" />
          <LogoutButton />
```

- [ ] **Step 3: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: limpos.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/components/LogoutButton.tsx apps/studiold/components/Topbar.tsx
git commit -m "feat: botão Sair no drawer de navegação"
```

---

### Task 6: Checklist de aceitação manual + doc

**Files:**
- Modify: `apps/studiold/CLAUDE.md` (seção "Lições aprendidas" — 1 linha)

**Interfaces:** nenhuma.

Esta task não tem código de produção. É a verificação de ponta a ponta com um usuário real e o registro da armadilha do Next 16.

- [ ] **Step 1: Criar o usuário do barbeiro**

No report, registrar (o admin faz à mão, não é código): no dashboard do Supabase do projeto → Authentication → Users → "Add user" → e-mail + senha, "Auto Confirm User" ligado. Se o executor não tiver acesso ao dashboard, anotar como pendência para o usuário e seguir para o Step 3 com o que der para verificar.

- [ ] **Step 2: Rodar os fluxos (browser, `pnpm --filter studiold dev`)**

Registrar no report o resultado de cada item:
1. `/agenda` sem estar logado → redireciona pra `/login`.
2. `/login` com senha errada → mostra "E-mail ou senha incorretos.", continua em `/login`.
3. `/login` com credencial certa → vai pra `/agenda`.
4. Recarregar o browser em `/agenda` → continua logado (não volta pro `/login`).
5. Abrir o drawer (hambúrguer) → "Sair" no rodapé → volta pra `/login`; abrir `/agenda` de novo → redireciona pra `/login`.
6. Logado, abrir `/login` na mão → redireciona pra `/agenda`.
7. `/financeiro`, `/clientes`, `/configuracoes` diretos sem sessão → cada um redireciona pra `/login`.
8. Assets: o `/studiold-logo.svg` e o CSS carregam na tela de login (o `matcher` não os bloqueia).

- [ ] **Step 3: Registrar a lição do Next 16**

Em `apps/studiold/CLAUDE.md`, na seção "Lições aprendidas" (criar a linha se a seção estiver vazia):
```md
- Next 16 renomeou `middleware.ts` → `proxy.ts` (export `proxy`, mesmo `config.matcher`). O gate de auth vive em `apps/studiold/proxy.ts`. `cookies()` de `next/headers` é async.
```

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/CLAUDE.md
git commit -m "docs: checklist de aceitação de auth + nota do proxy.ts (Next 16)"
```

---

## Self-Review

**1. Cobertura da spec:**
- Login `/login` e-mail + senha → Task 2 (page + LoginForm + `entrar`).
- Todas as outras rotas redirecionam pra `/login` se não autenticado → Task 3 (proxy, gate primário) + Task 4 (`requireUser` por página, recheck).
- Depois do login → `/agenda` → Task 2 (`entrar` faz `redirect("/agenda")`).
- Botão de logout no drawer → Task 5.
- Sessão sobrevive a refresh → Task 1 (`@supabase/ssr` usa cookie) + Task 3 (proxy renova o token).
- Um usuário só, admin cria no dashboard → Task 6 Step 1 (sem fluxo de signup em lugar nenhum).
- Design "A Estação do Barbeiro" na tela de login → Task 2 Step 3 (`.shell` + classes existentes).
- Proxy Next → Task 3 (`proxy.ts`, não `middleware.ts`).
- Cookie-based session, Supabase Auth SSR → Task 1 (`@supabase/ssr`), Task 3.
- Sem gaps.

**2. Placeholder scan:** sem "TBD/TODO"; cada step de código tem o bloco real. Task 4 dá o código dos dois arquivos que mudam de forma não-óbvia (`app/page.tsx` inteiro) e instrução exata (import + primeira linha) para os 4 `page.tsx` async que já existem.

**3. Consistência de tipos:**
- `browserSupabase(): SupabaseClient` — Task 1 define, Task 5 consome (`browserSupabase().auth.signOut()`).
- `authServer(): Promise<SupabaseClient>` — Task 1 define, Task 2 consome (`await authServer()` → `.auth.signInWithPassword`).
- `requireUser(): Promise<User>` — Task 1 define, Task 4 consome (`await requireUser()`).
- `getUserOpcional(): Promise<User | null>` — Task 1 define, Task 2 Step 3 consome (`if (await getUserOpcional())`).
- `EntrarEstado = { erro: string | null }` e `entrar(prev, fd)` — Task 2 Step 1 define, Task 2 Step 2 consome via `useActionState(entrar, INICIAL)`.
- `proxy` + `config.matcher` — Task 3, nome de export exigido pelo Next 16 (verificado em `node_modules/next/dist/docs/.../proxy.md`).
- `Icon name="lock"` — glyph confirmado em `components/agenda/Icon.tsx`.
- Classes `.shell` / `.field` / `.btn` / `.btn--primary` / `.slip__meta` / `.navItem` / `.navDivider` / `.navList` — já em `agenda.module.css`, já usadas.
- Env `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — já em `.env.local`; nomes idênticos em `client.ts`, `auth.ts`, `proxy.ts`.
