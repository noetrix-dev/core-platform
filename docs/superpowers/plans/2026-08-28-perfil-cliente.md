# Perfil de Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um painel deslizante de perfil de cliente (nome, telefone, agregados de gasto/visitas, serviço mais frequente, preferências editáveis, histórico das últimas 10 visitas), aberto de duas entradas: clicando o nome do cliente numa ficha da agenda, e de uma rota nova `/clientes` com lista buscável.

**Architecture:** Um Server Action `getPerfilCliente(clienteId)` busca tudo no servidor (`tenantDb()`), agrega em JS os `atendimentos` do cliente, e devolve um `PerfilCliente`. Um client component auto-contido `PerfilClienteDrawer` (dentro do `Drawer` existente) chama esse action no mount via `useTransition`, mostra o perfil, e edita as 3 preferências num bloco com botão "Salvar" → `atualizarPreferencias` → re-fetch. O painel é `position: fixed`, renderizado com estado local em cada host (cada `Ficha`/`HeroFicha` e a lista de `/clientes`) — sem contexto novo, sem mudança de rota nem de URL. A agregação pura vive em `lib/clientes/resumo.ts` e é testada no check de node.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), React 19, `@supabase/supabase-js` (service-role, server-only, schema `barbearia_001`), CSS Modules escopados (`agenda.module.css`), `node --experimental-strip-types` para o check de lógica pura.

**Spec:** Design aprovado no chat de brainstorming (architectural; sem arquivo de spec separado). Decisões:
- Busca do painel: **Server Action** `getPerfilCliente` (não search param, não rota interceptada).
- Agregados **em JS** dentro do action (reduce sobre os `atendimentos` do cliente), não RPC/view — sem migration nova. `clientes.cortesia_favorita_id`/`estilo_musica_id`/`observacoes_fixas` já existem (migration de cortesias, aplicada).
- Edição das preferências: **um bloco "Preferências" com os 3 campos + botão "Salvar"** → um Server Action `atualizarPreferencias`. Depois do save, o painel re-chama `getPerfilCliente`.
- `/clientes`: RSC busca todos os clientes ativos + deriva visitas de `atendimentos`; filtro **client-side** por nome/telefone (sem debounce). Sem "adicionar/editar cliente" nesta feature.
- Painel = `Drawer.tsx` (desliza da direita, `min(30rem, 100vw)`, Esc/scrim). Estado de abertura local em cada host (padrão do `PagamentoDrawer`).
- Painel renderizado **fora** do `<article>`/`<section>` da ficha (a classe `.stamped` deixa `transform` residual → viraria containing block de `position: fixed`; lição do review final da feature anterior).

## Global Constraints

- Toda a UI, labels, mensagens em **pt-BR**.
- `apps/studiold/app/globals.css` fica **como está**. Estilo novo só em `agenda.module.css` (CSS Module escopado), antes do bloco `@media (prefers-reduced-motion: reduce) {`.
- Server-only: `getPerfilCliente` / `atualizarPreferencias` são Server Actions (`"use server"`), usam `tenantDb()` de `@/lib/supabase/server`. Nunca importar `tenantDb` de client component.
- Validação no servidor (`.claude/rules/security.md`): `clienteId` e ids de preferência batem `/^[0-9a-f-]{36}$/i` ou viram `null`; `observacoes_fixas` cortado em 500 chars.
- Nada de mudança de schema. As colunas e tabelas usadas (`clientes`, `atendimentos`, `servicos`, `cortesias`, `estilos_musica`) já existem no banco.
- Sem framework de teste de componente. Lógica pura testada em `apps/studiold/lib/agenda/agenda.check.ts` (`node:assert/strict`, `pnpm --filter studiold check`). Server Actions / componentes / rotas verificados por `pnpm --filter studiold typecheck` + `lint` + `build`.
- Padrões a seguir: `Drawer.tsx` (prop `titulo` + `onClose`), `EstoqueEditavel.tsx` (`useTransition` para pending), `/financeiro/page.tsx` (RSC `force-dynamic` + `tenantDb()` + reduce em JS, `.finBadge[data-m]` para forma de pagamento), `Topbar.tsx` (item de nav no `NavDrawer`).
- Comandos rodam da raiz do monorepo (`/home/ewerton/projects/core-platform`); `pnpm --filter studiold <script>` mira o app.
- `agenda.check.ts` roda com `--experimental-strip-types` — arquivos importados por ele não podem ter `enum`/`namespace`; imports relativos levam `.ts`.

---

## File Structure

**Criar:**
- `apps/studiold/lib/clientes/resumo.ts` — agregação pura dos atendimentos de um cliente + contagem de visitas por cliente para a lista. Sem I/O. Testável.
- `apps/studiold/lib/clientes/types.ts` — tipos da camada de action (`PerfilCliente`, `PerfilResultado`, `PreferenciasPatch`).
- `apps/studiold/app/clientes/actions.ts` — Server Actions `getPerfilCliente`, `atualizarPreferencias`.
- `apps/studiold/components/PerfilClienteDrawer.tsx` — o painel compartilhado (client).
- `apps/studiold/components/ListaClientes.tsx` — lista buscável + host do painel (client).
- `apps/studiold/app/clientes/page.tsx` — RSC `force-dynamic` da rota `/clientes`.

**Modificar:**
- `apps/studiold/lib/agenda/agenda.check.ts` — asserts para `resumo.ts`.
- `apps/studiold/components/Topbar.tsx` — item "Clientes" no `PRINCIPAIS`; `ItemNav.icone` ganha `"user"`.
- `apps/studiold/components/agenda/Ficha.tsx` — nome do cliente vira `<button>`; estado `verPerfil`; painel renderizado depois de `</article>`.
- `apps/studiold/components/agenda/HeroFicha.tsx` — idem, painel depois de `</section>` (fragmento no return).
- `apps/studiold/app/agenda/agenda.module.css` — classes `.perfil*` e `.clientesLista*`.

**Sem mudança:** `lib/supabase/server.ts`, `lib/agenda/load.ts`, `Drawer.tsx`, `Icon.tsx` (o ícone `user` já existe).

---

## Task 1: Agregação pura (`lib/clientes/resumo.ts`)

**Files:**
- Create: `apps/studiold/lib/clientes/resumo.ts`
- Test: `apps/studiold/lib/agenda/agenda.check.ts` (adiciona bloco)

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export interface AtendimentoRow {
    realizado_em: string;
    valor_cobrado: number;
    forma_pagamento: string;
    servico_id: string;
    servico_nome: string;
  }
  export interface VisitaHistorico {
    data: string;            // realizado_em ISO
    servico: string;
    valor: number;
    forma_pagamento: string;
  }
  export interface ResumoCliente {
    total_gasto: number;
    total_visitas: number;
    ultima_visita: string | null;
    servico_mais_frequente: string | null;
    historico: VisitaHistorico[];   // <= 10, mais recente primeiro
  }
  export function resumirAtendimentos(rows: AtendimentoRow[]): ResumoCliente
  export function visitasPorCliente(
    rows: { cliente_id: string; realizado_em: string }[],
  ): Map<string, { total: number; ultima: string }>
  ```

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar o import no topo (depois dos imports existentes):

```ts
import { resumirAtendimentos, visitasPorCliente } from "../clientes/resumo.ts";
```

E adicionar este bloco logo antes de `console.log("agenda.check: OK");`:

```ts
// --- resumo de cliente -------------------------------------------------
{
  const r0 = resumirAtendimentos([]);
  assert.equal(r0.total_gasto, 0);
  assert.equal(r0.total_visitas, 0);
  assert.equal(r0.ultima_visita, null);
  assert.equal(r0.servico_mais_frequente, null);
  assert.deepEqual(r0.historico, []);

  const rows = [
    { realizado_em: "2026-08-01T13:00:00.000Z", valor_cobrado: 55, forma_pagamento: "pix", servico_id: "s1", servico_nome: "Corte" },
    { realizado_em: "2026-08-20T13:00:00.000Z", valor_cobrado: 100, forma_pagamento: "dinheiro", servico_id: "s2", servico_nome: "Corte + Barba" },
    { realizado_em: "2026-08-10T13:00:00.000Z", valor_cobrado: 55, forma_pagamento: "pix", servico_id: "s1", servico_nome: "Corte" },
  ];
  const r = resumirAtendimentos(rows);
  assert.equal(r.total_gasto, 210);
  assert.equal(r.total_visitas, 3);
  assert.equal(r.ultima_visita, "2026-08-20T13:00:00.000Z");
  assert.equal(r.servico_mais_frequente, "Corte", "moda do serviço");
  assert.equal(r.historico.length, 3);
  assert.equal(r.historico[0].data, "2026-08-20T13:00:00.000Z", "histórico ordenado desc");
  assert.equal(r.historico[0].servico, "Corte + Barba");
  assert.equal(r.historico[2].data, "2026-08-01T13:00:00.000Z");

  const muitos = Array.from({ length: 12 }, (_, i) => ({
    realizado_em: `2026-08-${String(i + 1).padStart(2, "0")}T13:00:00.000Z`,
    valor_cobrado: 10,
    forma_pagamento: "pix",
    servico_id: "s1",
    servico_nome: "Corte",
  }));
  assert.equal(resumirAtendimentos(muitos).historico.length, 10, "histórico capado em 10");

  const vpc = visitasPorCliente([
    { cliente_id: "a", realizado_em: "2026-08-01T00:00:00.000Z" },
    { cliente_id: "a", realizado_em: "2026-08-05T00:00:00.000Z" },
    { cliente_id: "b", realizado_em: "2026-08-03T00:00:00.000Z" },
  ]);
  assert.equal(vpc.get("a")?.total, 2);
  assert.equal(vpc.get("a")?.ultima, "2026-08-05T00:00:00.000Z");
  assert.equal(vpc.get("b")?.total, 1);
  assert.equal(vpc.get("c"), undefined);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — `Cannot find module '../clientes/resumo.ts'` (o arquivo não existe).

- [ ] **Step 3: Criar `lib/clientes/resumo.ts`**

Create `apps/studiold/lib/clientes/resumo.ts`:

```ts
// Agregação pura dos atendimentos de um cliente. Sem I/O — testada no
// check de node.

export interface AtendimentoRow {
  realizado_em: string;
  valor_cobrado: number;
  forma_pagamento: string;
  servico_id: string;
  servico_nome: string;
}

export interface VisitaHistorico {
  data: string; // realizado_em ISO
  servico: string;
  valor: number;
  forma_pagamento: string;
}

export interface ResumoCliente {
  total_gasto: number;
  total_visitas: number;
  ultima_visita: string | null;
  servico_mais_frequente: string | null;
  historico: VisitaHistorico[]; // <= 10, mais recente primeiro
}

export function resumirAtendimentos(rows: AtendimentoRow[]): ResumoCliente {
  const total_gasto = rows.reduce((s, r) => s + (Number(r.valor_cobrado) || 0), 0);
  const total_visitas = rows.length;

  let ultima_visita: string | null = null;
  for (const r of rows) {
    if (!ultima_visita || r.realizado_em > ultima_visita) ultima_visita = r.realizado_em;
  }

  // moda do nome do serviço; empate → primeiro visto
  const contagem = new Map<string, number>();
  for (const r of rows) {
    contagem.set(r.servico_nome, (contagem.get(r.servico_nome) ?? 0) + 1);
  }
  let servico_mais_frequente: string | null = null;
  let maior = 0;
  for (const [nome, n] of contagem) {
    if (n > maior) {
      maior = n;
      servico_mais_frequente = nome;
    }
  }

  const historico: VisitaHistorico[] = [...rows]
    .sort((a, b) => (a.realizado_em < b.realizado_em ? 1 : a.realizado_em > b.realizado_em ? -1 : 0))
    .slice(0, 10)
    .map((r) => ({
      data: r.realizado_em,
      servico: r.servico_nome,
      valor: Number(r.valor_cobrado) || 0,
      forma_pagamento: r.forma_pagamento,
    }));

  return { total_gasto, total_visitas, ultima_visita, servico_mais_frequente, historico };
}

export function visitasPorCliente(
  rows: { cliente_id: string; realizado_em: string }[],
): Map<string, { total: number; ultima: string }> {
  const m = new Map<string, { total: number; ultima: string }>();
  for (const r of rows) {
    const cur = m.get(r.cliente_id);
    if (!cur) {
      m.set(r.cliente_id, { total: 1, ultima: r.realizado_em });
    } else {
      cur.total += 1;
      if (r.realizado_em > cur.ultima) cur.ultima = r.realizado_em;
    }
  }
  return m;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter studiold check`
Expected: PASS — `agenda.check: OK`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter studiold typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/lib/clientes/resumo.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat: resumo puro de atendimentos por cliente (agregação + testes)"
```

---

## Task 2: Server Actions (`app/clientes/actions.ts`)

**Files:**
- Create: `apps/studiold/lib/clientes/types.ts`
- Create: `apps/studiold/app/clientes/actions.ts`

**Interfaces:**
- Consumes: `resumirAtendimentos`, `ResumoCliente`, `AtendimentoRow` de `lib/clientes/resumo.ts` (Task 1). `tenantDb` de `@/lib/supabase/server`.
- Produces:
  ```ts
  // lib/clientes/types.ts
  export interface PerfilCliente {
    id: string;
    nome: string;
    telefone: string;
    cortesia_favorita_id: string | null;
    estilo_musica_id: string | null;
    observacoes_fixas: string | null;
    resumo: import("./resumo.ts").ResumoCliente;
    cortesias_ativas: { id: string; nome: string }[];
    estilos_ativos: { id: string; nome: string }[];
  }
  export type PerfilResultado =
    | { ok: true; perfil: PerfilCliente }
    | { ok: false; error: string };
  export interface PreferenciasPatch {
    cortesiaFavoritaId: string | null;
    estiloMusicaId: string | null;
    observacoesFixas: string | null;
  }

  // app/clientes/actions.ts
  export async function getPerfilCliente(clienteId: string): Promise<PerfilResultado>
  export async function atualizarPreferencias(
    clienteId: string,
    patch: PreferenciasPatch,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Criar `lib/clientes/types.ts`**

Create `apps/studiold/lib/clientes/types.ts`:

```ts
import type { ResumoCliente } from "./resumo";

export interface PerfilCliente {
  id: string;
  nome: string;
  telefone: string;
  cortesia_favorita_id: string | null;
  estilo_musica_id: string | null;
  observacoes_fixas: string | null;
  resumo: ResumoCliente;
  cortesias_ativas: { id: string; nome: string }[];
  estilos_ativos: { id: string; nome: string }[];
}

export type PerfilResultado =
  | { ok: true; perfil: PerfilCliente }
  | { ok: false; error: string };

export interface PreferenciasPatch {
  cortesiaFavoritaId: string | null;
  estiloMusicaId: string | null;
  observacoesFixas: string | null;
}
```

- [ ] **Step 2: Criar `app/clientes/actions.ts`**

Create `apps/studiold/app/clientes/actions.ts`:

```ts
"use server";

// Server Actions do perfil de cliente. tenantDb() = schema do tenant,
// service-role, só servidor.

import { tenantDb } from "@/lib/supabase/server";
import { resumirAtendimentos, type AtendimentoRow } from "@/lib/clientes/resumo";
import type { PerfilResultado, PreferenciasPatch } from "@/lib/clientes/types";

const UUID = /^[0-9a-f-]{36}$/i;
const uuidOrNull = (v: string | null): string | null =>
  v && UUID.test(v) ? v : null;

type Row = Record<string, unknown>;
function embNome(v: unknown): string {
  const o = Array.isArray(v) ? v[0] : v;
  return ((o as { nome?: string } | null)?.nome ?? "Serviço") as string;
}

export async function getPerfilCliente(
  clienteId: string,
): Promise<PerfilResultado> {
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const db = tenantDb();

  const [cliRes, atendRes, cortRes, estRes] = await Promise.all([
    db
      .from("clientes")
      .select(
        "id, nome, telefone, cortesia_favorita_id, estilo_musica_id, observacoes_fixas",
      )
      .eq("id", clienteId)
      .maybeSingle(),
    db
      .from("atendimentos")
      .select("realizado_em, valor_cobrado, forma_pagamento, servico_id, servicos(nome)")
      .eq("cliente_id", clienteId)
      .order("realizado_em", { ascending: false }),
    db.from("cortesias").select("id, nome").eq("ativo", true).order("nome"),
    db.from("estilos_musica").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  if (cliRes.error) return { ok: false, error: `perfil/cliente: ${cliRes.error.message}` };
  if (!cliRes.data) return { ok: false, error: "Cliente não encontrado." };
  if (atendRes.error) return { ok: false, error: `perfil/atendimentos: ${atendRes.error.message}` };
  if (cortRes.error) return { ok: false, error: `perfil/cortesias: ${cortRes.error.message}` };
  if (estRes.error) return { ok: false, error: `perfil/estilos: ${estRes.error.message}` };

  const rows: AtendimentoRow[] = ((atendRes.data ?? []) as Row[]).map((a) => ({
    realizado_em: a.realizado_em as string,
    valor_cobrado: Number(a.valor_cobrado) || 0,
    forma_pagamento: (a.forma_pagamento as string) ?? "",
    servico_id: (a.servico_id as string) ?? "",
    servico_nome: embNome(a.servicos),
  }));

  const c = cliRes.data as Row;
  return {
    ok: true,
    perfil: {
      id: c.id as string,
      nome: c.nome as string,
      telefone: c.telefone as string,
      cortesia_favorita_id: (c.cortesia_favorita_id as string) ?? null,
      estilo_musica_id: (c.estilo_musica_id as string) ?? null,
      observacoes_fixas: (c.observacoes_fixas as string) ?? null,
      resumo: resumirAtendimentos(rows),
      cortesias_ativas: ((cortRes.data ?? []) as Row[]).map((x) => ({
        id: x.id as string,
        nome: x.nome as string,
      })),
      estilos_ativos: ((estRes.data ?? []) as Row[]).map((x) => ({
        id: x.id as string,
        nome: x.nome as string,
      })),
    },
  };
}

export async function atualizarPreferencias(
  clienteId: string,
  patch: PreferenciasPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const obs = (patch.observacoesFixas ?? "").trim().slice(0, 500) || null;
  const { error } = await tenantDb()
    .from("clientes")
    .update({
      cortesia_favorita_id: uuidOrNull(patch.cortesiaFavoritaId),
      estilo_musica_id: uuidOrNull(patch.estiloMusicaId),
      observacoes_fixas: obs,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", clienteId);
  return error
    ? { ok: false, error: `atualizarPreferencias: ${error.message}` }
    : { ok: true };
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos. Build ainda 5 rotas (a rota `/clientes/page.tsx` só entra na Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/lib/clientes/types.ts apps/studiold/app/clientes/actions.ts
git commit -m "feat: Server Actions getPerfilCliente e atualizarPreferencias"
```

---

## Task 3: Painel compartilhado (`PerfilClienteDrawer.tsx` + CSS)

**Files:**
- Create: `apps/studiold/components/PerfilClienteDrawer.tsx`
- Modify: `apps/studiold/app/agenda/agenda.module.css` (adiciona `.perfil*`)

**Interfaces:**
- Consumes: `getPerfilCliente`, `atualizarPreferencias` de `@/app/clientes/actions` (Task 2); `PerfilCliente` de `@/lib/clientes/types`; `Drawer` de `@/components/agenda/Drawer`; `Icon` de `@/components/agenda/Icon`; `fmtPreco` de `@/lib/agenda/time`; classes `styles.field`, `styles.btn`, `styles["btn--primary"]`, `styles.tray`, `styles.tray__head`, `styles.finBadge`, `styles.slip__meta`.
- Produces:
  ```ts
  export function PerfilClienteDrawer(props: {
    clienteId: string;
    onClose: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Adicionar CSS**

Em `apps/studiold/app/agenda/agenda.module.css`, imediatamente antes de `@media (prefers-reduced-motion: reduce) {`:

```css
/* ---- painel de perfil de cliente ---------------------------------- */
.perfilResumo {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.6rem;
}
@media (min-width: 26rem) {
  .perfilResumo {
    grid-template-columns: repeat(3, 1fr);
  }
}
.perfilBloco {
  background: var(--enamel-hi);
  border-radius: var(--r);
  box-shadow: inset 0 0 0 1px var(--chrome);
  padding: 0.7rem 0.8rem;
}
.perfilBloco__k {
  font-family: var(--font-barlow-cond), sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.66rem;
  color: var(--ink-2);
}
.perfilBloco__v {
  margin-top: 0.3rem;
  font-family: var(--font-barlow-cond), sans-serif;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
  line-height: 1.1;
}
.perfilBloco[data-tom="gasto"] .perfilBloco__v {
  color: var(--oxblood);
}
.perfilHistRow {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 0.3rem 0.7rem;
  padding: 0.55rem 0.85rem;
  box-shadow: inset 0 -1px 0 0 var(--chrome);
}
.perfilHistRow:last-child {
  box-shadow: none;
}
.perfilHistRow__data {
  font-family: var(--font-barlow-cond), sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.82rem;
  color: var(--ink-2);
}
.perfilHistRow__svc {
  font-size: 0.9rem;
}
.perfilHistRow__val {
  font-family: var(--font-barlow-cond), sans-serif;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.9rem;
  text-align: right;
}
.perfilSkel {
  height: 3.5rem;
  border-radius: var(--r);
  background: linear-gradient(
    90deg,
    var(--enamel-lo) 25%,
    var(--enamel-hi) 50%,
    var(--enamel-lo) 75%
  );
  background-size: 200% 100%;
  animation: perfilSkel 1.2s ease-in-out infinite;
}
@keyframes perfilSkel {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
```

- [ ] **Step 2: Criar o componente**

Create `apps/studiold/components/PerfilClienteDrawer.tsx`:

```tsx
"use client";

// Painel de perfil de cliente. Auto-contido: chama getPerfilCliente no
// mount (e a cada troca de clienteId), edita as 3 preferências num bloco
// com botão Salvar, re-busca no sucesso.

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { getPerfilCliente, atualizarPreferencias } from "@/app/clientes/actions";
import type { PerfilCliente } from "@/lib/clientes/types";
import { Drawer } from "@/components/agenda/Drawer";
import { Icon } from "@/components/agenda/Icon";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";

const BADGE_CURTO: Record<string, string> = {
  pix: "Pix",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
  dinheiro: "Dinheiro",
};

function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

export function PerfilClienteDrawer({
  clienteId,
  onClose,
}: {
  clienteId: string;
  onClose: () => void;
}) {
  const [perfil, setPerfil] = useState<PerfilCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciarCarga] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  // form de preferências (controlado)
  const [cortesiaId, setCortesiaId] = useState("");
  const [estiloId, setEstiloId] = useState("");
  const [obs, setObs] = useState("");
  const [avisoPref, setAvisoPref] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    iniciarCarga(async () => {
      const r = await getPerfilCliente(clienteId);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setPerfil(r.perfil);
      setCortesiaId(r.perfil.cortesia_favorita_id ?? "");
      setEstiloId(r.perfil.estilo_musica_id ?? "");
      setObs(r.perfil.observacoes_fixas ?? "");
      setAvisoPref(null);
    });
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const dirty =
    perfil != null &&
    (cortesiaId !== (perfil.cortesia_favorita_id ?? "") ||
      estiloId !== (perfil.estilo_musica_id ?? "") ||
      obs !== (perfil.observacoes_fixas ?? ""));

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || salvando) return;
    setAvisoPref(null);
    iniciarSalvar(async () => {
      const r = await atualizarPreferencias(clienteId, {
        cortesiaFavoritaId: cortesiaId || null,
        estiloMusicaId: estiloId || null,
        observacoesFixas: obs || null,
      });
      if (!r.ok) {
        setAvisoPref("Não deu para salvar. Tente de novo.");
        return;
      }
      carregar();
    });
  };

  return (
    <Drawer titulo={perfil?.nome ?? "Cliente"} onClose={onClose}>
      {erro ? (
        <div className="flex flex-col gap-3">
          <p className={styles.slip__meta}>{erro}</p>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--ghost"]}`}
            onClick={carregar}
          >
            Tentar de novo
          </button>
        </div>
      ) : carregando && !perfil ? (
        <div className="flex flex-col gap-3">
          <div className={styles.perfilSkel} />
          <div className={styles.perfilSkel} />
          <div className={styles.perfilSkel} />
        </div>
      ) : perfil ? (
        <div className="flex flex-col gap-5">
          <p
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--ink-2)" }}
          >
            <Icon name="phone" size={14} />
            <span className={styles.tnum}>{perfil.telefone}</span>
          </p>

          <div className={styles.perfilResumo}>
            <div className={styles.perfilBloco}>
              <p className={styles.perfilBloco__k}>Visitas</p>
              <p className={styles.perfilBloco__v}>{perfil.resumo.total_visitas}</p>
              <p className={styles.slip__meta}>
                {perfil.resumo.ultima_visita
                  ? `última ${fmtData(perfil.resumo.ultima_visita)}`
                  : "sem visitas"}
              </p>
            </div>
            <div className={styles.perfilBloco} data-tom="gasto">
              <p className={styles.perfilBloco__k}>Total gasto</p>
              <p className={styles.perfilBloco__v}>
                {fmtPreco(perfil.resumo.total_gasto)}
              </p>
            </div>
            <div className={styles.perfilBloco}>
              <p className={styles.perfilBloco__k}>Serviço frequente</p>
              <p className={styles.perfilBloco__v}>
                {perfil.resumo.servico_mais_frequente ?? "—"}
              </p>
            </div>
          </div>

          <form onSubmit={salvar} className="flex flex-col gap-3">
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-cortesia">Cortesia favorita</label>
              <select
                id="pref-cortesia"
                value={cortesiaId}
                onChange={(e) => setCortesiaId(e.target.value)}
              >
                <option value="">— nenhuma —</option>
                {perfil.cortesias_ativas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-estilo">Estilo musical</label>
              <select
                id="pref-estilo"
                value={estiloId}
                onChange={(e) => setEstiloId(e.target.value)}
              >
                <option value="">— sem preferência —</option>
                {perfil.estilos_ativos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-obs">Observações fixas</label>
              <textarea
                id="pref-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            {avisoPref && (
              <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
                {avisoPref}
              </p>
            )}
            <button
              type="submit"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              disabled={!dirty || salvando}
            >
              Salvar preferências
            </button>
          </form>

          <div className={styles.tray}>
            <div className={styles.tray__head}>
              <span>Últimas visitas</span>
            </div>
            {perfil.resumo.historico.length === 0 ? (
              <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
                Nenhuma visita registrada.
              </p>
            ) : (
              perfil.resumo.historico.map((v, i) => (
                <div key={i} className={styles.perfilHistRow}>
                  <span className={styles.perfilHistRow__data}>
                    {fmtData(v.data)}
                  </span>
                  <span className={styles.perfilHistRow__svc}>
                    {v.servico}{" "}
                    <span
                      className={styles.finBadge}
                      data-m={v.forma_pagamento}
                      style={{ marginLeft: "0.25rem" }}
                    >
                      {BADGE_CURTO[v.forma_pagamento] ?? v.forma_pagamento}
                    </span>
                  </span>
                  <span className={styles.perfilHistRow__val}>
                    {fmtPreco(v.valor)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos. `PerfilClienteDrawer` ainda não é usado por ninguém — ok, Next não reclama de componente não referenciado.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/components/PerfilClienteDrawer.tsx apps/studiold/app/agenda/agenda.module.css
git commit -m "feat: PerfilClienteDrawer — resumo, preferências editáveis, histórico"
```

---

## Task 4: Rota `/clientes` + item de nav

**Files:**
- Create: `apps/studiold/app/clientes/page.tsx`
- Create: `apps/studiold/components/ListaClientes.tsx`
- Modify: `apps/studiold/components/Topbar.tsx` (item "Clientes")
- Modify: `apps/studiold/app/agenda/agenda.module.css` (`.clientesLista*`)

**Interfaces:**
- Consumes: `PerfilClienteDrawer` (Task 3); `visitasPorCliente` de `@/lib/clientes/resumo` (Task 1); `Topbar` de `@/components/Topbar`; `tenantDb` de `@/lib/supabase/server`; `desde` de `@/lib/agenda/time`.
- Produces:
  ```ts
  // components/ListaClientes.tsx
  export function ListaClientes(props: {
    clientes: { id: string; nome: string; telefone: string; total_visitas: number; ultima_visita: string | null }[];
  }): JSX.Element
  ```

- [ ] **Step 1: CSS da lista**

Em `apps/studiold/app/agenda/agenda.module.css`, logo depois do bloco `.perfilSkel`/`@keyframes perfilSkel` da Task 3 (ainda antes do `@media (prefers-reduced-motion: reduce)`):

```css
/* ---- /clientes: lista buscável ---------------------------------- */
.clientesBusca {
  width: 100%;
  background: #fbfaf6;
  box-shadow: inset 0 0 0 1px var(--chrome);
  border-radius: var(--r);
  padding: 0.6rem 0.7rem;
  font: inherit;
  color: var(--ink);
}
.clientesBusca:focus {
  outline: 2px solid var(--oxblood);
  outline-offset: 1px;
}
.clientesRow {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 0.2rem 0.75rem;
  width: 100%;
  text-align: left;
  padding: 0.7rem 0.85rem;
  box-shadow: inset 0 -1px 0 0 var(--chrome);
  transition: background 0.12s var(--ease);
}
.clientesRow:hover {
  background: rgba(28, 26, 23, 0.04);
}
.clientesRow__nome {
  font-family: var(--font-barlow-cond), sans-serif;
  font-weight: 600;
  font-size: 1rem;
}
.clientesRow__tel {
  font-variant-numeric: tabular-nums;
  font-size: 0.82rem;
  color: var(--ink-2);
}
.clientesRow__visitas {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-family: var(--font-barlow-cond), sans-serif;
  font-size: 0.78rem;
  color: var(--muted);
  text-align: right;
  white-space: nowrap;
}
```

- [ ] **Step 2: Criar `components/ListaClientes.tsx`**

Create `apps/studiold/components/ListaClientes.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
import { desde } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";

type ClienteLista = {
  id: string;
  nome: string;
  telefone: string;
  total_visitas: number;
  ultima_visita: string | null;
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ListaClientes({ clientes }: { clientes: ClienteLista[] }) {
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) =>
        normalizar(c.nome).includes(q) ||
        (qDigitos.length > 0 && c.telefone.replace(/\D/g, "").includes(qDigitos)),
    );
  }, [clientes, busca]);

  return (
    <div className="flex flex-col gap-3">
      <input
        className={styles.clientesBusca}
        placeholder="Buscar por nome ou telefone"
        aria-label="Buscar cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoComplete="off"
      />

      <div className={styles.tray}>
        {clientes.length === 0 ? (
          <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
            Nenhum cliente cadastrado.
          </p>
        ) : filtrados.length === 0 ? (
          <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
            Nenhum cliente encontrado.
          </p>
        ) : (
          filtrados.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.clientesRow}
              onClick={() => setSelecionado(c.id)}
            >
              <span className={styles.clientesRow__nome}>{c.nome}</span>
              <span className={`${styles.clientesRow__tel} ${styles.tnum}`}>
                {c.telefone}
              </span>
              <span className={styles.clientesRow__visitas}>
                {c.total_visitas === 0
                  ? "sem visitas"
                  : `${c.total_visitas} visita${c.total_visitas === 1 ? "" : "s"}` +
                    (c.ultima_visita ? ` · ${desde(c.ultima_visita)}` : "")}
              </span>
            </button>
          ))
        )}
      </div>

      {selecionado && (
        <PerfilClienteDrawer
          clienteId={selecionado}
          onClose={() => setSelecionado(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Criar `app/clientes/page.tsx`**

Create `apps/studiold/app/clientes/page.tsx` (mesmo shape do `app/financeiro/page.tsx`: RSC `force-dynamic`, `styles.shell`, `<Topbar>`, `<main class="mx-auto max-w-3xl …">`):

```tsx
import { tenantDb } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { visitasPorCliente } from "@/lib/clientes/resumo";
import { ListaClientes } from "@/components/ListaClientes";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function ClientesPage() {
  const db = tenantDb();
  const [cliRes, atendRes] = await Promise.all([
    db.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome"),
    db.from("atendimentos").select("cliente_id, realizado_em"),
  ]);
  if (cliRes.error) throw new Error(`clientes: ${cliRes.error.message}`);
  if (atendRes.error) throw new Error(`clientes/atendimentos: ${atendRes.error.message}`);

  const vpc = visitasPorCliente(
    ((atendRes.data ?? []) as Row[]).map((a) => ({
      cliente_id: a.cliente_id as string,
      realizado_em: a.realizado_em as string,
    })),
  );

  const clientes = ((cliRes.data ?? []) as Row[]).map((c) => {
    const v = vpc.get(c.id as string);
    return {
      id: c.id as string,
      nome: c.nome as string,
      telefone: c.telefone as string,
      total_visitas: v?.total ?? 0,
      ultima_visita: v?.ultima ?? null,
    };
  });

  return (
    <div className={styles.shell}>
      <Topbar titulo="Clientes" />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <ListaClientes clientes={clientes} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Item "Clientes" no NavDrawer**

Em `apps/studiold/components/Topbar.tsx`:

4a. `ItemNav.icone` — trocar o tipo para incluir `"user"`:
```ts
type ItemNav = {
  href: string;
  label: string;
  icone: "calendar" | "cash" | "music" | "user";
};
```

4b. `PRINCIPAIS` — adicionar Clientes depois de Agenda:
```ts
const PRINCIPAIS: ItemNav[] = [
  { href: "/agenda", label: "Agenda", icone: "calendar" },
  { href: "/clientes", label: "Clientes", icone: "user" },
  { href: "/financeiro", label: "Caixa", icone: "cash" },
];
```
(O ícone `user` já existe em `Icon.tsx`.)

- [ ] **Step 5: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: limpos. Build agora lista **6 rotas**: `/`, `/_not-found`, `/agenda`, `/clientes`, `/configuracoes`, `/financeiro`.

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/app/clientes apps/studiold/components/ListaClientes.tsx apps/studiold/components/Topbar.tsx apps/studiold/app/agenda/agenda.module.css
git commit -m "feat: rota /clientes — lista buscável + item de nav"
```

---

## Task 5: Abrir o painel pela ficha da agenda

**Files:**
- Modify: `apps/studiold/components/agenda/Ficha.tsx`
- Modify: `apps/studiold/components/agenda/HeroFicha.tsx`

**Interfaces:**
- Consumes: `PerfilClienteDrawer` (Task 3). `ag.cliente_id` (já disponível em ambos os componentes via `item.agendamento`).
- Produces: comportamento — clicar o nome do cliente abre o `PerfilClienteDrawer`.

- [ ] **Step 1: `Ficha.tsx` — import + estado + nome vira botão**

Em `apps/studiold/components/agenda/Ficha.tsx`:

1a. Adicionar ao topo, junto dos outros imports de componente:
```ts
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
```

1b. Junto do `const [pagando, setPagando] = useState(false);` já existente, adicionar:
```ts
const [verPerfil, setVerPerfil] = useState(false);
```

1c. Trocar a linha do nome:
```tsx
<h3 className={styles.ficha__name}>{nome}</h3>
```
por:
```tsx
<h3 className={styles.ficha__name}>
  <button
    type="button"
    onClick={() => setVerPerfil(true)}
    className="text-left underline decoration-transparent underline-offset-2 hover:decoration-inherit"
    aria-label={`Ver perfil de ${nome}`}
  >
    {nome}
  </button>
</h3>
```

- [ ] **Step 2: `Ficha.tsx` — renderizar o painel fora do `<article>`**

O bloco `{pagando && (<PagamentoDrawer ... />)}` já está DEPOIS de `</article>` (dentro de `<div className={styles.row}>`), da feature anterior. Adicionar o painel de perfil ao lado dele, também depois de `</article>`:

```tsx
      </article>

      {pagando && (
        <PagamentoDrawer
          valorSugerido={servico?.preco ?? 0}
          cortesiaIdInicial={ag.cortesia_id}
          onConfirmar={confirmarPagamento}
          onClose={() => setPagando(false)}
        />
      )}

      {verPerfil && (
        <PerfilClienteDrawer
          clienteId={ag.cliente_id}
          onClose={() => setVerPerfil(false)}
        />
      )}
    </div>
  );
```

(Se na sua árvore o `{pagando && …}` ainda estiver ANTES de `</article>`, mova-o para depois primeiro — mesma razão da lição da feature anterior: `.stamped` deixa `transform` residual.)

- [ ] **Step 3: `HeroFicha.tsx` — import + estado + nome vira botão**

Em `apps/studiold/components/agenda/HeroFicha.tsx`:

3a. Adicionar:
```ts
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
```

3b. Junto do `const [pagando, setPagando] = useState(false);`:
```ts
const [verPerfil, setVerPerfil] = useState(false);
```

3c. Trocar:
```tsx
<h2 className={styles.hero__name}>{cliente?.nome}</h2>
```
por:
```tsx
<h2 className={styles.hero__name}>
  <button
    type="button"
    onClick={() => setVerPerfil(true)}
    className="text-left underline decoration-transparent underline-offset-2 hover:decoration-inherit"
    aria-label={`Ver perfil de ${cliente?.nome ?? "cliente"}`}
  >
    {cliente?.nome}
  </button>
</h2>
```

- [ ] **Step 4: `HeroFicha.tsx` — renderizar o painel fora do `<section>`**

O return já está embrulhado num fragmento `<>...</>` com `{pagando && <PagamentoDrawer .../>}` depois de `</section>` (feature anterior). Adicionar o painel de perfil ao lado:

```tsx
      </section>

      {pagando && (
        <PagamentoDrawer
          valorSugerido={servico?.preco ?? 0}
          cortesiaIdInicial={ag.cortesia_id}
          onConfirmar={confirmarPagamento}
          onClose={() => setPagando(false)}
        />
      )}

      {verPerfil && (
        <PerfilClienteDrawer
          clienteId={ag.cliente_id}
          onClose={() => setVerPerfil(false)}
        />
      )}
    </>
  );
```

- [ ] **Step 5: Checklist completo**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos. `agenda.check: OK`. Build lista 6 rotas.

- [ ] **Step 6: Revisar o diff e conferir secrets**

Run: `git status --porcelain && git diff --stat`
Confirmar: só `apps/studiold/**`; nada de `.env*`; nada em `infra/supabase/migrations/**`.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/components/agenda/Ficha.tsx apps/studiold/components/agenda/HeroFicha.tsx
git commit -m "feat: nome do cliente na ficha abre o painel de perfil"
```

- [ ] **Step 8: Push**

```bash
git push origin main
```

---

## Notas de edge cases (referência)

- **Troca de cliente sem fechar o painel** (só acontece se algum host reusar a mesma instância com `clienteId` diferente — hoje não acontece, cada host desmonta ao fechar): o `useEffect([clienteId])` re-busca. Coberto.
- **Editar preferência e falhar:** `avisoPref` mostra "Não deu para salvar. Tente de novo."; o form mantém os valores digitados; `dirty` continua true. Sem `router.refresh()` — o painel é client e se re-busca sozinho no sucesso.
- **Cliente sem atendimentos:** `resumo` vem zerado (`total_gasto` 0, `total_visitas` 0, `ultima_visita` null, `servico_mais_frequente` null, `historico` []). O painel mostra "sem visitas", "—" no serviço frequente, e "Nenhuma visita registrada." no histórico.
- **`getPerfilCliente` com id que não existe:** `{ ok: false, error: "Cliente não encontrado." }` → o painel mostra a mensagem + "Tentar de novo".
- **Nome do cliente como `<button>` dentro de `<h3>`/`<h2>`:** semanticamente ok (heading contém um controle); o `<button>` não dispara nada da ficha (os botões de status são elementos irmãos).
- **`fmtData` no fuso de SP:** usa `Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"`, consistente com `/financeiro`.

## Self-Review

**Spec coverage:**
- Entrada 1 (nome na ficha → painel): Task 5.
- Entrada 2 (`/clientes` lista buscável + painel): Task 4.
- Painel: nome/telefone → Task 3 (cabeçalho); total de visitas + última → Task 3 (bloco Visitas) via `resumirAtendimentos` (Task 1); total gasto → bloco Total gasto; serviço mais frequente → bloco Serviço frequente; preferências editáveis (cortesia favorita, estilo musical, observações fixas) num bloco com Salvar → Task 3 form + `atualizarPreferencias` (Task 2); histórico das últimas 10 (data, serviço, valor, forma de pagamento) → Task 3 lista via `resumo.historico` (Task 1).
- Shared component: `PerfilClienteDrawer` (Task 3), usado por Task 4 e Task 5.
- Server vs client fetch: Server Action `getPerfilCliente` (Task 2), chamado do client no mount (Task 3).
- Edit flow: bloco único + Salvar (Task 2 action, Task 3 UI).
- Mobile UX: `Drawer` full-width no mobile; `.perfilResumo` empilha < 26rem; skeleton no loading; `/clientes` `max-w-3xl`.
- Sem lacunas.

**Placeholder scan:** o único trecho "ilustrativo" (o `require(...)` no primeiro bloco da Task 4 Step 3) é imediatamente seguido da versão final completa e de uma instrução explícita de usar a segunda. Sem "TBD/TODO".

**Type consistency:**
- `AtendimentoRow` / `ResumoCliente` / `VisitaHistorico` definidos na Task 1, consumidos na Task 2 (`getPerfilCliente` monta `AtendimentoRow[]`, chama `resumirAtendimentos`) e na Task 3 (`perfil.resumo.historico` é `VisitaHistorico[]`).
- `PerfilCliente` / `PerfilResultado` / `PreferenciasPatch` na Task 2, consumidos na Task 3 (`getPerfilCliente(): Promise<PerfilResultado>`, `atualizarPreferencias(clienteId, patch: PreferenciasPatch)`).
- `ListaClientes` prop `clientes` (Task 4) — a forma `{ id, nome, telefone, total_visitas, ultima_visita }` é montada no `page.tsx` da mesma task, campo a campo.
- `visitasPorCliente` retorna `Map<string, { total: number; ultima: string }>` (Task 1); `page.tsx` (Task 4) lê `v?.total` / `v?.ultima`.
- `PerfilClienteDrawer` prop `{ clienteId: string; onClose: () => void }` (Task 3) — consumido idêntico na Task 4 (`ListaClientes`) e Task 5 (`Ficha`/`HeroFicha`).
- `Icon` name `"user"` já existe (`Icon.tsx:13`); `ItemNav.icone` estendido para aceitá-lo (Task 4 Step 4a).
