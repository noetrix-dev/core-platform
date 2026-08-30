# /configuracoes em rotas separadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar `/configuracoes` (uma página de 558 linhas com âncoras) em 5 rotas — `/configuracoes/{cortesias,estilos,servicos,produtos,horarios}` — sob um `layout.tsx` compartilhado com secondary nav; `/configuracoes` redireciona pra `cortesias`.

**Architecture:** Um `configuracoes/layout.tsx` (RSC) faz `requireUser()` uma vez e renderiza a moldura (`shell` + `Topbar` + `SecondaryNav` + `<main>`). Cada seção vira um `page.tsx` `force-dynamic` que faz seu próprio fetch estreito e renderiza só a sua `<section>` (o `<section>` existente movido de `page.tsx`, sem o `id`/`scroll-mt-20`). Sem Server Action nova; as actions passam a revalidar `revalidatePath("/configuracoes", "layout")` pra atingir o segmento inteiro.

**Tech Stack:** Next.js 16 (App Router, RSC, layout de segmento, `redirect`, `usePathname`), React 19, Supabase `tenantDb()` schema `barbearia_001`, CSS Modules `@/app/agenda/agenda.module.css`.

**Spec:** `docs/superpowers/specs/2026-08-30-configuracoes-rotas-separadas-design.md`

## Global Constraints

- Toda a UI em pt-BR.
- `apps/studiold/app/globals.css` intocado. NENHUM CSS novo — `SecondaryNav` reusa `.chip`/`.chips`/`.navItem` + utilitários Tailwind (`overflow-x-auto`, `flex`, `gap-*`). Sem `id`/`scroll-mt-20` novos (viram inúteis com rotas).
- `requireUser()` (de `@/lib/supabase/auth`) SÓ no `configuracoes/layout.tsx`, uma vez. NÃO repetir nas 5 `page.tsx`. `configuracoes/page.tsx` (redirect) também NÃO chama `requireUser()`.
- Sem Server Action nova. `configuracoes/actions.ts` só muda o alvo do `revalidatePath` (16 chamadas: `revalidatePath(ROTA)` → `revalidatePath(ROTA, "layout")`; `ROTA` continua `"/configuracoes"`).
- Sub-componentes client (`EstoqueEditavel`, `EstoqueProdutoEditavel`, `HorariosForm`) reusados como estão — exceto tirar `id="horarios"` + `scroll-mt-20` da `<section>` externa do `HorariosForm`.
- Cada nova `page.tsx`: `export const dynamic = "force-dynamic";`. Guard de erro `if (res.error) throw new Error(\`configuracoes/<x>: ${res.error.message}\`)`.
- Tipos (`Cortesia`/`Estilo`/`Servico`/`Produto`) inline em cada rota (cada um usado numa só). Sem `configuracoes/types.ts`.
- Sem schema, sem migration, sem dependência nova. `agenda.check.ts` não muda.
- Ordem das seções (no `SecondaryNav` E no `GERENCIAR` do Topbar): Cortesias, Estilos de música, Serviços, Produtos, Horário de funcionamento.

---

### Task 1: Layout + SecondaryNav + `/configuracoes/cortesias` + redirect da raiz

Prova o padrão: a moldura compartilhada e a primeira seção extraída. As outras 4 seguem na Task 2.

**Files:**
- Create: `apps/studiold/app/configuracoes/layout.tsx`
- Create: `apps/studiold/app/configuracoes/SecondaryNav.tsx`
- Create: `apps/studiold/app/configuracoes/cortesias/page.tsx`
- Modify: `apps/studiold/app/configuracoes/page.tsx` (558 linhas → 4)

**Interfaces:**
- Consumes: `requireUser` de `@/lib/supabase/auth`; `Topbar` de `@/components/Topbar`; `tenantDb` de `@/lib/supabase/server`; `EstoqueEditavel` de `../EstoqueEditavel`; `* as A` de `../actions`; `Icon` de `@/components/agenda/Icon`; `styles` de `@/app/agenda/agenda.module.css`.
- Produces:
  ```tsx
  // layout.tsx (default export) — envolve todas as rotas /configuracoes/*
  export default async function ConfiguracoesLayout(props: { children: React.ReactNode }): Promise<JSX.Element>
  // SecondaryNav.tsx
  export function SecondaryNav(): JSX.Element
  ```

- [ ] **Step 1: `SecondaryNav.tsx`**

Create `apps/studiold/app/configuracoes/SecondaryNav.tsx`:

```tsx
"use client";

// Abas horizontais de /configuracoes/*. Marca a ativa por usePathname.
// Rola horizontal no mobile. Piso visual: .chip; refino pelo /impeccable shape.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/agenda/agenda.module.css";

const SECOES = [
  { href: "/configuracoes/cortesias", label: "Cortesias" },
  { href: "/configuracoes/estilos", label: "Estilos de música" },
  { href: "/configuracoes/servicos", label: "Serviços" },
  { href: "/configuracoes/produtos", label: "Produtos" },
  { href: "/configuracoes/horarios", label: "Horário de funcionamento" },
];

export function SecondaryNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções de configurações"
      className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3 sm:px-6"
    >
      {SECOES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={styles.chip}
          data-on={pathname === s.href}
          aria-current={pathname === s.href ? "page" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: `layout.tsx`**

Create `apps/studiold/app/configuracoes/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Topbar } from "@/components/Topbar";
import { requireUser } from "@/lib/supabase/auth";
import styles from "@/app/agenda/agenda.module.css";
import { SecondaryNav } from "./SecondaryNav";

export default async function ConfiguracoesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <div className={styles.shell}>
      <Topbar titulo="Configurações" />
      <SecondaryNav />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: `cortesias/page.tsx`**

Create `apps/studiold/app/configuracoes/cortesias/page.tsx`. Cabeçalho do arquivo:

```tsx
import { tenantDb } from "@/lib/supabase/server";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";
import { EstoqueEditavel } from "../EstoqueEditavel";

export const dynamic = "force-dynamic";

type Cortesia = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  quantidade_estoque: number;
};

export default async function CortesiasPage() {
  const res = await tenantDb()
    .from("cortesias")
    .select("id, nome, descricao, ativo, quantidade_estoque")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/cortesias: ${res.error.message}`);
  const cortesias = (res.data ?? []) as Cortesia[];

  return (
    <section className={styles.cfgSection}>
      {/* corpo da seção — ver Step 4 */}
    </section>
  );
}
```

- [ ] **Step 4: Mover o corpo da seção Cortesias**

Do arquivo atual `apps/studiold/app/configuracoes/page.tsx`, copiar o **conteúdo interno** da seção Cortesias — as linhas 113 a 229 inclusive (do `<header>` até o fechamento do `))}` do `.map`), SEM a tag `<section ...>` da linha 112 nem o `</section>` da linha 230 — e colar dentro do `<section className={styles.cfgSection}>` do `cortesias/page.tsx` (substituindo o comentário `{/* corpo da seção — ver Step 4 */}`).

O conteúdo referencia `A.criarCortesia`, `A.adicionarEstoque`, `A.toggleCortesiaAtivo`, `A.editarCortesia`, `<EstoqueEditavel>`, `<Icon>`, `cortesias`, `styles` — todos já importados/no escopo pelo Step 3. Nenhuma outra mudança no corpo.

- [ ] **Step 5: `page.tsx` → redirect**

Substituir TODO o conteúdo de `apps/studiold/app/configuracoes/page.tsx` por:

```tsx
import { redirect } from "next/navigation";

export default function ConfiguracoesPage() {
  redirect("/configuracoes/cortesias");
}
```

- [ ] **Step 6: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`. Build agora lista `/configuracoes` (redirect) e `/configuracoes/cortesias` — **as rotas `/configuracoes/estilos|servicos|produtos|horarios` ainda NÃO existem** (Task 2). Contagem de rotas sobe de 7 pra 8 (`/configuracoes` continua listada + `/configuracoes/cortesias` nova; o `page.tsx` de raiz vira estático).

- [ ] **Step 7: Conferência manual (anotar no report, não bloqueia)**

`pnpm --filter studiold dev`: abrir `/configuracoes` → redireciona pra `/configuracoes/cortesias`; a página mostra o Topbar, a faixa de abas (Cortesias ativa), e a seção de Cortesias funcionando (adicionar/editar/toggle/estoque). As outras abas ainda 404 (Task 2).

- [ ] **Step 8: Commit**

```bash
git add apps/studiold/app/configuracoes/layout.tsx apps/studiold/app/configuracoes/SecondaryNav.tsx apps/studiold/app/configuracoes/cortesias/page.tsx apps/studiold/app/configuracoes/page.tsx
git commit -m "feat: /configuracoes/layout + secondary nav + rota cortesias + redirect da raiz"
```

---

### Task 2: As outras 4 rotas de seção + limpeza do `HorariosForm`

Mesmo padrão da Task 1 Step 3–4, aplicado a Estilos, Serviços, Produtos, Horários. Batched — 4 arquivos novos + 1 edição.

**Files:**
- Create: `apps/studiold/app/configuracoes/estilos/page.tsx`
- Create: `apps/studiold/app/configuracoes/servicos/page.tsx`
- Create: `apps/studiold/app/configuracoes/produtos/page.tsx`
- Create: `apps/studiold/app/configuracoes/horarios/page.tsx`
- Modify: `apps/studiold/app/configuracoes/HorariosForm.tsx`

**Interfaces:**
- Consumes: os mesmos de Task 1 + `fmtPreco` de `@/lib/agenda/time` (servicos, produtos); `EstoqueProdutoEditavel` de `../EstoqueProdutoEditavel` (produtos); `HorariosForm` de `../HorariosForm` (horarios).
- Produces: as 5 rotas `/configuracoes/<secao>` completas.

- [ ] **Step 1: `estilos/page.tsx`**

Create `apps/studiold/app/configuracoes/estilos/page.tsx`:

```tsx
import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";

export const dynamic = "force-dynamic";

type Estilo = { id: string; nome: string; ativo: boolean };

export default async function EstilosPage() {
  const res = await tenantDb()
    .from("estilos_musica")
    .select("id, nome, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/estilos: ${res.error.message}`);
  const estilos = (res.data ?? []) as Estilo[];

  return (
    <section className={styles.cfgSection}>
      {/* corpo: linhas 234–305 de app/configuracoes/page.tsx (do <header> ao fim do .map), sem a <section>/</section> */}
    </section>
  );
}
```
Colar o **conteúdo interno** da seção Estilos de música do `page.tsx` atual — linhas **234 a 305** (o `<section ... id="estilos">` abre na 233, fecha na 306). Sem a tag `<section>` nem `</section>`. Referencia `A.criarEstilo`, `A.editarEstilo`, `A.toggleEstiloAtivo`, `estilos`, `Icon`, `styles`.

- [ ] **Step 2: `servicos/page.tsx`**

Create `apps/studiold/app/configuracoes/servicos/page.tsx`:

```tsx
import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";

export const dynamic = "force-dynamic";

type Servico = {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
};

export default async function ServicosPage() {
  const res = await tenantDb()
    .from("servicos")
    .select("id, nome, preco, duracao_minutos, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/servicos: ${res.error.message}`);
  const servicos = ((res.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    preco: Number(s.preco),
    duracao_minutos: s.duracao_minutos as number,
    ativo: s.ativo as boolean,
  })) satisfies Servico[];

  return (
    <section className={styles.cfgSection}>
      {/* corpo: linhas 310–422 de app/configuracoes/page.tsx, sem a <section>/</section> */}
    </section>
  );
}
```
Colar o conteúdo interno da seção Serviços — linhas **310 a 422** (abre 309, fecha 423). Referencia `A.criarServico`, `A.editarServico`, `A.toggleServicoAtivo`, `servicos`, `fmtPreco`, `Icon`, `styles`.

- [ ] **Step 3: `produtos/page.tsx`**

Create `apps/studiold/app/configuracoes/produtos/page.tsx`:

```tsx
import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";
import { EstoqueProdutoEditavel } from "../EstoqueProdutoEditavel";

export const dynamic = "force-dynamic";

type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_venda: number;
  quantidade_estoque: number;
  ativo: boolean;
};

export default async function ProdutosPage() {
  const res = await tenantDb()
    .from("produtos")
    .select("id, nome, descricao, preco_venda, quantidade_estoque, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/produtos: ${res.error.message}`);
  const produtos = ((res.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    descricao: (p.descricao as string) ?? null,
    preco_venda: Number(p.preco_venda),
    quantidade_estoque: (p.quantidade_estoque as number) ?? 0,
    ativo: p.ativo as boolean,
  })) satisfies Produto[];

  return (
    <section className={styles.cfgSection}>
      {/* corpo: linhas 427–551 de app/configuracoes/page.tsx, sem a <section>/</section> */}
    </section>
  );
}
```
Colar o conteúdo interno da seção Produtos — linhas **427 a 551** (abre 426, fecha 552). Referencia `A.criarProduto`, `A.editarProduto`, `A.toggleProdutoAtivo`, `<EstoqueProdutoEditavel>`, `produtos`, `fmtPreco`, `Icon`, `styles`.

- [ ] **Step 4: `horarios/page.tsx`**

Create `apps/studiold/app/configuracoes/horarios/page.tsx`:

```tsx
import { tenantDb } from "@/lib/supabase/server";
import { HorariosForm } from "../HorariosForm";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const db = tenantDb();
  const [hRes, bRes] = await Promise.all([
    db
      .from("horarios_funcionamento")
      .select("dia_semana, aberto, hora_abertura, hora_fechamento")
      .order("dia_semana"),
    db
      .from("bloqueios_fixos")
      .select("id, hora_inicio, hora_fim")
      .eq("tipo", "suave")
      .eq("ativo", true)
      .is("dia_semana", null)
      .limit(1),
  ]);
  if (hRes.error) throw new Error(`configuracoes/horarios: ${hRes.error.message}`);
  if (bRes.error) throw new Error(`configuracoes/bloqueios: ${bRes.error.message}`);

  const dias = ((hRes.data ?? []) as Array<Record<string, unknown>>).map((h) => ({
    dia_semana: h.dia_semana as number,
    aberto: (h.aberto as boolean) ?? false,
    hora_abertura: ((h.hora_abertura as string) ?? "").slice(0, 5),
    hora_fechamento: ((h.hora_fechamento as string) ?? "").slice(0, 5),
  }));
  const b0 = ((bRes.data ?? []) as Array<Record<string, unknown>>)[0];
  const almoco = b0
    ? {
        id: b0.id as string,
        hora_inicio: (b0.hora_inicio as string).slice(0, 5),
        hora_fim: (b0.hora_fim as string).slice(0, 5),
      }
    : null;

  return <HorariosForm key={JSON.stringify(dias)} dias={dias} almoco={almoco} />;
}
```

- [ ] **Step 5: Limpar o `HorariosForm.tsx`**

Em `apps/studiold/app/configuracoes/HorariosForm.tsx`, a `<section>` externa (linha ~53):
```tsx
    <section className={`${styles.cfgSection} scroll-mt-20`} id="horarios">
```
vira:
```tsx
    <section className={styles.cfgSection}>
```

- [ ] **Step 6: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`. Build lista as 6 rotas de `/configuracoes`: `/configuracoes` (redirect), `/configuracoes/cortesias`, `/estilos`, `/servicos`, `/produtos`, `/horarios`. Total: 12 rotas (7 antigas − 0 + 5 novas de configuracoes; `/configuracoes` já contava).

- [ ] **Step 7: Conferência manual (anotar no report)**

Cada aba (`/configuracoes/estilos`, `/servicos`, `/produtos`, `/horarios`) carrega e mostra sua seção; o `SecondaryNav` marca a certa; `HorariosForm` funciona (toggle dia, editar horário, salvar).

- [ ] **Step 8: Commit**

```bash
git add apps/studiold/app/configuracoes/estilos apps/studiold/app/configuracoes/servicos apps/studiold/app/configuracoes/produtos apps/studiold/app/configuracoes/horarios apps/studiold/app/configuracoes/HorariosForm.tsx
git commit -m "feat: rotas /configuracoes/{estilos,servicos,produtos,horarios}"
```

---

### Task 3: Links do drawer + `revalidatePath` no segmento

**Files:**
- Modify: `apps/studiold/components/Topbar.tsx`
- Modify: `apps/studiold/app/configuracoes/actions.ts`

**Interfaces:**
- Consumes: as 5 rotas da Task 1+2.
- Produces: nada.

- [ ] **Step 1: `Topbar.tsx` — `GERENCIAR` pras rotas reais**

Substituir o array `GERENCIAR` por:
```ts
const GERENCIAR: ItemNav[] = [
  { href: "/configuracoes/cortesias", label: "Cortesias", icone: "cup" },
  { href: "/configuracoes/estilos", label: "Estilos de música", icone: "music" },
  { href: "/configuracoes/servicos", label: "Serviços", icone: "scissors" },
  { href: "/configuracoes/produtos", label: "Produtos", icone: "box" },
  { href: "/configuracoes/horarios", label: "Horário de funcionamento", icone: "clock" },
];
```

- [ ] **Step 2: `Topbar.tsx` — limpar `ativo`**

A função `ativo` no `NavDrawer` (linha ~86), hoje:
```ts
  const ativo = (href: string) =>
    !href.includes("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));
```
vira:
```ts
  const ativo = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
```

- [ ] **Step 3: `actions.ts` — revalidar o segmento**

Em `apps/studiold/app/configuracoes/actions.ts`, trocar TODAS as 16 ocorrências de:
```ts
  revalidatePath(ROTA);
```
por:
```ts
  revalidatePath(ROTA, "layout");
```
(`ROTA` continua `const ROTA = "/configuracoes";`. O segundo argumento `"layout"` faz o Next revalidar o layout do segmento e todas as rotas abaixo — `/configuracoes/produtos` etc.)

- [ ] **Step 4: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`, 12 rotas.

- [ ] **Step 5: Conferência manual (anotar no report)**

Abrir o drawer → os 5 links de "Gerenciar" vão pras rotas (não âncoras); o link da rota atual fica marcado ativo. Fazer um `criarProduto` em `/configuracoes/produtos` → o novo produto aparece sem reload manual (revalidação do segmento). Idem `criarCortesia` em `/configuracoes/cortesias`.

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/components/Topbar.tsx apps/studiold/app/configuracoes/actions.ts
git commit -m "feat: drawer Gerenciar aponta pras rotas + revalidatePath do segmento"
```

---

## Self-Review

**1. Cobertura da spec:**
- `layout.tsx` (`requireUser` uma vez + moldura) → Task 1 Step 2.
- `SecondaryNav` (abas, `usePathname`, scroll mobile) → Task 1 Step 1.
- 5 rotas `page.tsx` `force-dynamic` + fetch estreito + `<section>` sem `id`/`scroll-mt-20` → cortesias Task 1 Step 3–4; estilos/servicos/produtos/horarios Task 2 Step 1–4.
- `/configuracoes` → `redirect("/configuracoes/cortesias")` → Task 1 Step 5.
- `HorariosForm` sem `id="horarios"`/`scroll-mt-20` → Task 2 Step 5.
- `Topbar` `GERENCIAR` pras rotas + `ativo()` limpo → Task 3 Step 1–2.
- `actions.ts` `revalidatePath(ROTA, "layout")` ×16 → Task 3 Step 3.
- Sem gap.

**2. Placeholder scan:** os `page.tsx` de seção têm o cabeçalho (imports/fetch/tipo/wrapper) verbatim; o corpo da `<section>` é "mover as linhas X–Y de `page.tsx`" com o número exato e a única mudança (tirar a tag `<section id=...>`). Isso é extração mecânica de código existente num arquivo/linha conhecidos, não um placeholder. Cortesias tem o cabeçalho completo no plano; as outras 3 (estilos/servicos/produtos) têm cabeçalho completo + range de linhas; horarios tem o arquivo inteiro (é curto).

**3. Consistência de tipos:**
- `Cortesia`/`Estilo`/`Servico`/`Produto` — cada um definido inline na sua rota, com os mesmos campos das defs atuais em `page.tsx` (linhas 14–28 pra Cortesia/Estilo/Servico; a de Produto está inline no corpo hoje, linhas 74–81). `servicos`/`produtos` usam o mesmo `.map(...) satisfies` de hoje.
- `layout.tsx` default export `async ({ children }: { children: ReactNode })` — assinatura padrão de layout do App Router.
- `SecondaryNav` sem props; `SECOES` alinhado com `GERENCIAR` (Task 3) — mesma ordem, mesmos hrefs (`/configuracoes/<secao>`), mesmos labels.
- `revalidatePath(ROTA, "layout")` — assinatura `revalidatePath(path: string, type?: "page" | "layout")` do `next/cache`.
- `HorariosForm` props (`dias`, `almoco`, `key`) inalteradas — `horarios/page.tsx` monta `dias`/`almoco` com a mesma lógica das linhas 91–105 de `page.tsx`.
- Nenhum símbolo referenciado que não exista: `A.*` (todas as actions já exportadas), `EstoqueEditavel`/`EstoqueProdutoEditavel`/`HorariosForm`/`fmtPreco`/`Icon`/`Topbar`/`requireUser`/`tenantDb` — todos já existentes.
