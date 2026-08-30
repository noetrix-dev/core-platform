# Autenticação do StudiOLD — Design

## Objetivo

O barbeiro faz login antes de acessar qualquer rota do `apps/studiold`. Um usuário só, criado à mão pelo admin no dashboard do Supabase. Sem signup, sem reset de senha.

## Decisões (aprovadas no chat)

- **Gate:** `proxy.ts` (Next 16 — antigo `middleware.ts`) redireciona não-autenticado → `/login` em toda rota e renova o token; **além disso** `requireUser()` (`getUser()` autoritativo, bate no Auth server) no topo de cada página protegida. Defesa em profundidade.
- **Tenant:** só exige sessão válida. Qualquer usuário Supabase autenticado entra. O app é single-tenant por deploy (`NEXT_PUBLIC_TENANT`). `public.tenant_usuarios` NÃO é consultado nesta fase.
- **Form de login:** Server Action + form nativo. `signInWithPassword` no server client grava os cookies via `next/headers`; sucesso → `redirect('/agenda')`. Mínimo de JS de cliente (só `useActionState` pra mensagem de erro e `useLogout` pro botão de sair).
- **Recheck no layout → recheck por página.** O design inicial usava um route group `app/(app)/` com um `layout.tsx` guardião. Descartado: 18 arquivos importam `@/app/agenda/agenda.module.css`, e mover `app/agenda/` quebraria todos. Em vez disso, `await requireUser()` como primeira linha de cada uma das 5 páginas protegidas.

## Arquitetura

Auth é **aditiva**. `lib/supabase/server.ts` (service-role, path A) não muda — segue sendo todo o acesso a dados de `barbearia_001` via `tenantDb()`. Auth só decide se a request chega no RSC.

Duas linhas:

1. **`apps/studiold/proxy.ts`** — roda antes do render em toda rota (menos assets). Server client `@supabase/ssr` com os cookies da request → `getUser()` (renova o token, reescreve cookie na response). Sem sessão e fora de `/login` → 307 `/login`. Com sessão em `/login` → 307 `/agenda`.
2. **`requireUser()`** no topo de `app/page.tsx`, `app/agenda/page.tsx`, `app/clientes/page.tsx`, `app/financeiro/page.tsx`, `app/configuracoes/page.tsx` — `getUser()` autoritativo; `null` → `redirect('/login')`. Cobre cookie forjado que passe do proxy e qualquer erro de configuração do `matcher`.

## Arquivos

**Novos:**
- `apps/studiold/lib/supabase/client.ts` — `browserSupabase()` via `createBrowserClient` (anon key). Só o botão de logout usa.
- `apps/studiold/lib/supabase/auth.ts` — `authServer()` (`createServerClient` + cookies de `next/headers`), `requireUser(): Promise<User>` (redirect se null), `getUserOpcional(): Promise<User | null>`.
- `apps/studiold/proxy.ts` — gate + refresh. Export nomeado `proxy` + `config.matcher`.
- `apps/studiold/app/login/actions.ts` — `entrar(prev, fd)` Server Action com `useActionState`.
- `apps/studiold/app/login/LoginForm.tsx` — `"use client"`, form nativo (email, senha).
- `apps/studiold/app/login/page.tsx` — RSC. Se já autenticado, `redirect('/agenda')`. Mundo "A Estação do Barbeiro" (`.shell` + classes existentes).
- `apps/studiold/components/LogoutButton.tsx` — `"use client"`, `signOut()` + `router.push('/login')` + `router.refresh()`.

**Modificados:**
- `apps/studiold/app/page.tsx`, `app/agenda/page.tsx`, `app/clientes/page.tsx`, `app/financeiro/page.tsx`, `app/configuracoes/page.tsx` — `await requireUser()` como primeira linha do componente.
- `apps/studiold/components/Topbar.tsx` — `<LogoutButton/>` no rodapé do `NavDrawer`.
- `apps/studiold/package.json` — `+ @supabase/ssr`.

## Fluxo

- **Não logado → `/agenda`:** proxy sem sessão → 307 `/login`.
- **`/login` submit:** `entrar` no server → `signInWithPassword` grava cookies → `redirect('/agenda')`. Credencial errada → form re-renderiza com "E-mail ou senha incorretos."
- **Logado → qualquer rota:** proxy renova o token se perto de expirar (reescreve cookie); `requireUser()` na página confirma; RSC renderiza.
- **Refresh do browser:** `@supabase/ssr` usa cookie, não localStorage → sessão sobrevive.
- **Logout:** `signOut()` limpa cookies no browser → `push('/login')`.

## Erros / edge

- `signInWithPassword` falha → mensagem genérica pt-BR (não distingue e-mail de senha).
- Env faltando (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) → `proxy.ts` e `lib/supabase/auth.ts` lançam erro claro, igual ao `server.ts` hoje.
- Refresh de token falha no proxy → trata como não-logado → `/login`.
- `/login` com sessão válida → `redirect('/agenda')`.
- Loop de redirect: `/login` nunca é coberto pelo redirect do proxy nem por `requireUser`.
- `matcher` exclui `_next/static`, `_next/image`, `favicon.ico`, `*.svg` (o logo).

## Teste

Sem lógica pura nova. `agenda.check.ts` não muda. Aceitação é manual no browser (checklist no plano): login errado → mensagem; login certo → `/agenda`; refresh → continua logado; logout → `/login`; acesso direto a `/financeiro` sem sessão → `/login`; `/login` já logado → `/agenda`.

## Fora de escopo

Signup, reset/esqueci a senha, multi-usuário, checagem de `tenant_usuarios`, RLS em `barbearia_001` (segue path A), rotação customizada de refresh token, rate-limit no login, "lembrar deste dispositivo".
