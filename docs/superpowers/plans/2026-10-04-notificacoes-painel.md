# Notificações no painel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sino no `Topbar` do painel do StudiOLD, com contador de não lidas (polling de 30 s) e uma bandeja de notificações de agendamentos, cancelamentos e remarcações feitos pelo site e pelo bot do WhatsApp.

**Architecture:**
- **Banco:** a tabela `barbearia_001.notificacoes` é preenchida por um trigger em `agendamento_eventos`. O draft já existe e é aplicado à mão.
- **Servidor:** o painel lê e marca as notificações por Server Actions com `requireUser()`, via `tenantDb()`.
- **Cliente:** um componente cliente no `Topbar` compartilhado faz o polling e abre a bandeja no padrão `.tray`.

**Tech Stack:** Next 16.3 (App Router, Server Actions), React 19.2, `@supabase/supabase-js` 2 (service-role), CSS Modules (`app/agenda/agenda.module.css`) + Tailwind 4 utilitário, check sem framework (`node --experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-10-04-notificacoes-painel-design.md` (ler junto, incluindo a seção "Brief visual"). Migration: `docs/migrations-draft/2026-10-04-notificacoes.sql`.

## Global Constraints

- **Repositório:**
  - Direto em `main`, sem branch.
  - Nunca editar `infra/supabase/migrations/**` nem `.env*`.
  - Há arquivos sujos e não rastreados não relacionados em `docs/migrations-draft/2026-09-04-*`, `infra/supabase/migrations/` e `supabase/migrations/`: `git add` só os arquivos da task.
- **Banco:** a migration de notificações **não está aplicada**. O código precisa compilar e degradar sem ela: as actions logam o erro, o sino fica sem badge e a bandeja mostra "Não foi possível carregar as notificações.".
- **Segurança:** é painel da equipe, então toda Server Action nova começa com `await requireUser()` (de `@/lib/supabase/auth`), padrão de `app/agenda/actions.ts`. O acesso a dados é só via `tenantDb()`, com o query builder, nunca SQL cru.
- **Interface:**
  - Toda em pt-BR, mobile-first a 375px; controles com `aria-label`; alvos de 44px ou mais.
  - Sem CSS global novo. Classes novas vão em `app/agenda/agenda.module.css`, onde o `Topbar` já vive, usando os tokens do `.shell` (`--matte`, `--oxblood`, `--sage`, `--steel`, `--ink`, `--ink-2`, `--chrome`, `--enamel`, `--enamel-hi`, `--enamel-lo`, `--r`, `--ease`) e reaproveitando `.navbtn`, `.tray__head`, `.tray__count` e `.btn`.
- **Imports:** relativos entre arquivos de `lib/` usam a extensão `.ts`; componentes e actions usam o alias `@/`.
- **Gate por task:** `pnpm --filter studiold typecheck`, `pnpm --filter studiold lint`, `pnpm --filter studiold check`. O gate final adiciona `pnpm --filter studiold build`.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Desvio consciente da spec:** em vez de `marcarTodasLidas(ate)`, existe `marcarLidas(ids)`. Marcar por data cobriria também as não lidas que não couberam nas 30 mostradas, contrariando a regra da própria spec de que só as mostradas viram lidas.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/notificacoes/formato.ts` | criar | puros: `TipoNotificacao`, `CanalNotificacao`, `tempoRelativo`, `rotuloTipo`, `rotuloCanal` |
| `lib/agenda/agenda.check.ts` | modificar | asserts dos puros |
| `app/notificacoes/actions.ts` | criar | `contarNaoLidas`, `listarNotificacoes`, `marcarLidas`, `ItemNotificacao` |
| `app/agenda/agenda.module.css` | modificar (append) | classes `sino*` |
| `components/SinoNotificacoes.tsx` | criar | botão + badge + polling + bandeja |
| `components/Topbar.tsx` | modificar | renderiza o sino sempre no grupo à direita |

---

### Task 1: Formatação pura das notificações

**Files:**
- Create: `apps/studiold/lib/notificacoes/formato.ts`
- Modify: `apps/studiold/lib/agenda/agenda.check.ts` (import + bloco antes de `console.log("agenda.check: OK")`)

**Interfaces:**
- Produces:
  - `export type TipoNotificacao = "agendamento_criado" | "agendamento_cancelado" | "agendamento_remarcado"`
  - `export type CanalNotificacao = "site" | "whatsapp_bot"`
  - `export function tempoRelativo(iso: string, agora: number): string`
  - `export function rotuloTipo(tipo: TipoNotificacao): string`
  - `export function rotuloCanal(canal: CanalNotificacao): string`

- [ ] **Step 1: Write the failing test.** Em `lib/agenda/agenda.check.ts`, adicione aos imports:

```ts
import { tempoRelativo, rotuloTipo, rotuloCanal } from "../notificacoes/formato.ts";
```

e, antes de `console.log("agenda.check: OK");`:

```ts
// --- notificações do painel ------------------------------------------------
{
  const T0 = Date.parse("2026-10-04T12:00:00Z");
  const antes = (ms: number) => new Date(T0 - ms).toISOString();
  const MIN = 60_000;
  const H = 60 * MIN;
  assert.equal(tempoRelativo(antes(30_000), T0), "agora");
  assert.equal(tempoRelativo(antes(-5_000), T0), "agora", "relógio adiantado não vira negativo");
  assert.equal(tempoRelativo("lixo", T0), "agora", "data inválida não vira NaN");
  assert.equal(tempoRelativo(antes(MIN), T0), "há 1 min");
  assert.equal(tempoRelativo(antes(59 * MIN), T0), "há 59 min");
  assert.equal(tempoRelativo(antes(H), T0), "há 1 h");
  assert.equal(tempoRelativo(antes(23 * H + 59 * MIN), T0), "há 23 h");
  assert.equal(tempoRelativo(antes(24 * H), T0), "ontem");
  assert.equal(tempoRelativo(antes(47 * H), T0), "ontem");
  assert.equal(tempoRelativo(antes(48 * H), T0), "há 2 dias");
  assert.equal(rotuloTipo("agendamento_criado"), "Novo agendamento");
  assert.equal(rotuloTipo("agendamento_cancelado"), "Cancelamento");
  assert.equal(rotuloTipo("agendamento_remarcado"), "Remarcação");
  assert.equal(rotuloCanal("site"), "Site");
  assert.equal(rotuloCanal("whatsapp_bot"), "WhatsApp");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter studiold check`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` para `../notificacoes/formato.ts`.

- [ ] **Step 3: Write minimal implementation** — `lib/notificacoes/formato.ts`:

```ts
// Rótulos e tempo relativo do sino de notificações do painel. Puro e testável
// (lib/agenda/agenda.check.ts).

export type TipoNotificacao = "agendamento_criado" | "agendamento_cancelado" | "agendamento_remarcado";
export type CanalNotificacao = "site" | "whatsapp_bot";

export function tempoRelativo(iso: string, agora: number): string {
  const diff = agora - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 60_000) return "agora";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

const TIPO: Record<TipoNotificacao, string> = {
  agendamento_criado: "Novo agendamento",
  agendamento_cancelado: "Cancelamento",
  agendamento_remarcado: "Remarcação",
};

export function rotuloTipo(tipo: TipoNotificacao): string {
  return TIPO[tipo];
}

export function rotuloCanal(canal: CanalNotificacao): string {
  return canal === "whatsapp_bot" ? "WhatsApp" : "Site";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter studiold check && pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: `agenda.check: OK`; sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/lib/notificacoes/formato.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat(studiold): formatação pura das notificações do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server Actions das notificações

**Files:**
- Create: `apps/studiold/app/notificacoes/actions.ts`

**Interfaces:**
- Consumes: `TipoNotificacao`, `CanalNotificacao` (Task 1); `partesSaoPaulo(iso)` → `{ data: "YYYY-MM-DD"; hora: "HH:MM" }` de `@/lib/agendar/formato`; `requireUser` de `@/lib/supabase/auth`; `tenantDb` de `@/lib/supabase/server`.
- Produces:
  - `export type ItemNotificacao = { id: string; tipo: TipoNotificacao; canal: CanalNotificacao; cliente: string | null; servicos: string[]; data: string | null; hora: string | null; anterior: { data: string; hora: string } | null; criadoEm: string; lida: boolean }`
  - `export async function contarNaoLidas(): Promise<number | null>` (`null` = erro, já logado)
  - `export async function listarNotificacoes(): Promise<{ ok: true; itens: ItemNotificacao[] } | { ok: false }>`
  - `export async function marcarLidas(ids: string[]): Promise<void>`

- [ ] **Step 1: Create `app/notificacoes/actions.ts`**

```ts
"use server";

// Notificações do painel (sino no Topbar). Painel da equipe: toda action
// começa com requireUser(), igual a app/agenda/actions.ts. A tabela
// barbearia_001.notificacoes é preenchida por trigger em agendamento_eventos
// (docs/migrations-draft/2026-10-04-notificacoes.sql). Sem a migration, as
// actions logam o erro e o sino degrada (sem badge / mensagem de erro).
// Spec: docs/superpowers/specs/2026-10-04-notificacoes-painel-design.md

import { requireUser } from "@/lib/supabase/auth";
import { tenantDb } from "@/lib/supabase/server";
import { partesSaoPaulo } from "@/lib/agendar/formato";
import type { CanalNotificacao, TipoNotificacao } from "@/lib/notificacoes/formato";

export type ItemNotificacao = {
  id: string;
  tipo: TipoNotificacao;
  canal: CanalNotificacao;
  cliente: string | null; // null = cliente apagado
  servicos: string[];
  data: string | null; // YYYY-MM-DD (São Paulo); null = horário removido
  hora: string | null; // HH:MM (São Paulo)
  anterior: { data: string; hora: string } | null; // remarcação
  criadoEm: string;
  lida: boolean;
};

const LIMITE = 30;
const JANELA_MS = 24 * 60 * 60_000;
const MAX_IDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Um<T> = T | T[] | null;
type Linha = {
  id: string;
  tipo: TipoNotificacao;
  canal: CanalNotificacao;
  lida: boolean;
  criado_em: string;
  inicio_anterior: string | null;
  clientes: Um<{ nome: string }>;
  agendamentos: Um<{
    slots: Um<{ data_hora: string }>;
    agendamento_servicos: { ordem: number; servicos: Um<{ nome: string }> }[] | null;
  }>;
};

const SELECT =
  "id, tipo, canal, lida, criado_em, inicio_anterior, clientes(nome), agendamentos(slots(data_hora), agendamento_servicos(ordem, servicos(nome)))";

function um<T>(v: Um<T> | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function paraItem(l: Linha): ItemNotificacao {
  const ag = um(l.agendamentos);
  const inicio = um(ag?.slots)?.data_hora ?? null;
  const quando = inicio ? partesSaoPaulo(inicio) : null;
  const servicos = [...(ag?.agendamento_servicos ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => um(s.servicos)?.nome ?? "Serviço");
  return {
    id: l.id,
    tipo: l.tipo,
    canal: l.canal,
    cliente: um(l.clientes)?.nome ?? null,
    servicos,
    data: quando?.data ?? null,
    hora: quando?.hora ?? null,
    anterior: l.inicio_anterior ? partesSaoPaulo(l.inicio_anterior) : null,
    criadoEm: l.criado_em,
    lida: l.lida,
  };
}

export async function contarNaoLidas(): Promise<number | null> {
  await requireUser();
  const r = await tenantDb()
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("lida", false);
  if (r.error) {
    console.error("[notificacoes/contar]", r.error.message);
    return null;
  }
  return r.count ?? 0;
}

// Não lidas de qualquer data + lidas das últimas 24h, mais novas primeiro.
export async function listarNotificacoes(): Promise<{ ok: true; itens: ItemNotificacao[] } | { ok: false }> {
  await requireUser();
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const r = await tenantDb()
    .from("notificacoes")
    .select(SELECT)
    .or(`lida.eq.false,criado_em.gte.${desde}`)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (r.error) {
    console.error("[notificacoes/listar]", r.error.message);
    return { ok: false };
  }
  return { ok: true, itens: ((r.data ?? []) as Linha[]).map(paraItem) };
}

// Marca como lidas só as notificações que foram mostradas (ids da lista).
export async function marcarLidas(ids: string[]): Promise<void> {
  await requireUser();
  const validos = Array.isArray(ids)
    ? ids.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, MAX_IDS)
    : [];
  if (validos.length === 0) return;
  const r = await tenantDb().from("notificacoes").update({ lida: true }).in("id", validos);
  if (r.error) console.error("[notificacoes/marcar]", r.error.message);
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros (o módulo ainda não é usado; tudo bem).

Run: `grep -c "await requireUser()" apps/studiold/app/notificacoes/actions.ts`
Expected: `3`.

- [ ] **Step 3: Commit**

```bash
git add apps/studiold/app/notificacoes/actions.ts
git commit -m "feat(studiold): Server Actions das notificações do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sino no Topbar

**Files:**
- Modify: `apps/studiold/app/agenda/agenda.module.css` (append no fim)
- Create: `apps/studiold/components/SinoNotificacoes.tsx`
- Modify: `apps/studiold/components/Topbar.tsx`

**Interfaces:**
- Consumes:
  - `contarNaoLidas`, `listarNotificacoes`, `marcarLidas`, `ItemNotificacao` (Task 2);
  - `tempoRelativo`, `rotuloTipo`, `rotuloCanal` (Task 1);
  - `rotuloDia(ymd)` → "Sáb 10/10", de `@/lib/agendar/formato`;
  - `Icon({ name, size?, className? })` de `@/components/agenda/Icon`, que tem os nomes `bell`, `plus`, `x`, `clock` e `chat`;
  - classes existentes `.navbtn`, `.tray__head`, `.tray__count` e `.btn`.
- Produces: `export function SinoNotificacoes()` (sem props).

- [ ] **Step 1: Append to `app/agenda/agenda.module.css`**

```css
/* ---- sino de notificações (Topbar) -----------------------------------------
   Aviso, não caixa de entrada: badge oxblood sobre o .navbtn; bandeja no
   padrão .tray (cabeçalho preto-fosco + corpo esmalte). Spec:
   docs/superpowers/specs/2026-10-04-notificacoes-painel-design.md */
.sino {
  position: relative;
}
.sinoBtn {
  position: relative;
  width: 2.75rem;
  height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sinoBadge {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--oxblood);
  color: #fff;
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-weight: 700;
  font-size: 0.68rem;
  line-height: 1.125rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px var(--matte);
}
.sinoPainel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.6rem);
  z-index: 60;
  width: 22rem;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--enamel);
  color: var(--ink);
  border-radius: var(--r);
  box-shadow: inset 0 0 0 1px var(--chrome), 0 18px 40px -12px rgba(0, 0, 0, 0.45);
  animation: sinoEntra 0.12s var(--ease) both;
}
@media (max-width: 40rem) {
  .sinoPainel {
    position: fixed;
    left: 1rem;
    right: 1rem;
    width: auto;
    top: calc(env(safe-area-inset-top, 0px) + 4.25rem);
  }
}
@keyframes sinoEntra {
  from {
    opacity: 0;
  }
}
.sinoCorpo {
  overflow-y: auto;
}
.sinoCorpo li + li {
  border-top: 1px solid var(--chrome);
}
.sinoItem {
  display: flex;
  gap: 0.7rem;
  min-height: 3.5rem;
  padding: 0.65rem 0.8rem;
  color: inherit;
  text-decoration: none;
  background: var(--enamel-hi);
  box-shadow: inset 3px 0 0 var(--oxblood);
}
.sinoItem[data-lida="true"] {
  background: transparent;
  box-shadow: none;
}
a.sinoItem:hover {
  background: #fff;
}
.sinoIcone {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  box-shadow: inset 0 0 0 1px var(--chrome);
  color: var(--sage);
}
.sinoIcone[data-tipo="agendamento_cancelado"] {
  color: var(--oxblood);
}
.sinoIcone[data-tipo="agendamento_remarcado"] {
  color: var(--steel);
}
.sinoTexto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.sinoLinha1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.sinoLinha1 strong {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sinoTempo {
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-size: 0.72rem;
  color: var(--ink-2);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sinoMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.sinoVazio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 1rem 0.8rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}
.sinoEsqueleto {
  height: 3.5rem;
  background: linear-gradient(90deg, var(--enamel-lo), var(--enamel-hi), var(--enamel-lo));
  background-size: 200% 100%;
  animation: sinoBrilho 1.2s linear infinite;
}
.sinoEsqueleto + .sinoEsqueleto {
  border-top: 1px solid var(--chrome);
}
@keyframes sinoBrilho {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sinoPainel,
  .sinoEsqueleto {
    animation: none;
  }
}
```

- [ ] **Step 2: Create `components/SinoNotificacoes.tsx`**

```tsx
"use client";

// Sino de notificações do painel: contador de não lidas por polling (30 s,
// só com a aba visível) e bandeja com as notificações (não lidas de qualquer
// data + lidas das últimas 24h). Abrir marca as mostradas como lidas; tocar
// numa linha leva ao dia do horário em /agenda?d=YYYY-MM-DD.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/agenda/Icon";
import {
  contarNaoLidas,
  listarNotificacoes,
  marcarLidas,
  type ItemNotificacao,
} from "@/app/notificacoes/actions";
import { rotuloCanal, rotuloTipo, tempoRelativo } from "@/lib/notificacoes/formato";
import { rotuloDia } from "@/lib/agendar/formato";
import styles from "@/app/agenda/agenda.module.css";

const POLL_MS = 30_000;

const ICONE = {
  agendamento_criado: "plus",
  agendamento_cancelado: "x",
  agendamento_remarcado: "clock",
} as const;

export function SinoNotificacoes() {
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<"carregando" | "erro" | "ok">("carregando");
  const [itens, setItens] = useState<ItemNotificacao[]>([]);
  const [agora, setAgora] = useState(0);
  const [, iniciar] = useTransition();
  const sinoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  // Polling do contador: no mount, a cada 30 s com a aba visível e ao voltar
  // pra aba. Falha mantém o último número (erro já logado no servidor).
  useEffect(() => {
    let vivo = true;
    async function atualizar() {
      if (document.visibilityState !== "visible") return;
      const n = await contarNaoLidas().catch(() => null);
      if (vivo && n !== null) setNaoLidas(n);
    }
    function aoVoltar() {
      if (document.visibilityState === "visible") void atualizar();
    }
    void atualizar();
    const id = setInterval(() => void atualizar(), POLL_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  // Esc fecha e devolve o foco ao sino; toque fora fecha sem roubar o foco.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
        sinoRef.current?.focus();
      }
    }
    function aoTocar(e: PointerEvent) {
      const alvo = e.target as Node;
      if (!painelRef.current?.contains(alvo) && !sinoRef.current?.contains(alvo)) setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocar);
    };
  }, [aberto]);

  function carregar() {
    setEstado("carregando");
    iniciar(async () => {
      const r = await listarNotificacoes().catch(() => ({ ok: false as const }));
      if (!r.ok) {
        setEstado("erro");
        return;
      }
      setAgora(Date.now());
      setItens(r.itens);
      setEstado("ok");
      const ids = r.itens.filter((i) => !i.lida).map((i) => i.id);
      if (ids.length > 0) {
        await marcarLidas(ids).catch(() => undefined);
        const n = await contarNaoLidas().catch(() => null);
        if (n !== null) setNaoLidas(n);
      }
    });
  }

  function alternar() {
    if (aberto) {
      setAberto(false);
      return;
    }
    setAberto(true);
    carregar();
  }

  const novas = itens.filter((i) => !i.lida).length;

  return (
    <div className={styles.sino}>
      <button
        ref={sinoRef}
        type="button"
        className={`${styles.navbtn} ${styles.sinoBtn}`}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={alternar}
      >
        <Icon name="bell" size={18} />
        {naoLidas > 0 && (
          <span className={styles.sinoBadge} aria-hidden="true">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div ref={painelRef} className={styles.sinoPainel} role="dialog" aria-label="Notificações">
          <div className={styles.tray__head}>
            <span>Notificações</span>
            {estado === "ok" && novas > 0 && (
              <span className={styles.tray__count}>
                {novas} {novas === 1 ? "nova" : "novas"}
              </span>
            )}
          </div>
          <div className={styles.sinoCorpo} aria-busy={estado === "carregando"}>
            {estado === "carregando" && [0, 1, 2].map((i) => <div key={i} className={styles.sinoEsqueleto} />)}
            {estado === "erro" && (
              <div className={styles.sinoVazio}>
                <p role="alert">Não foi possível carregar as notificações.</p>
                <button type="button" className={styles.btn} onClick={carregar}>
                  Tentar de novo
                </button>
              </div>
            )}
            {estado === "ok" && itens.length === 0 && (
              <p className={styles.sinoVazio}>Nenhuma notificação nas últimas 24h.</p>
            )}
            {estado === "ok" && itens.length > 0 && (
              <ul>
                {itens.map((i) => (
                  <li key={i.id}>
                    <LinhaNotificacao item={i} agora={agora} onIr={() => setAberto(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function detalhe(i: ItemNotificacao): ReactNode {
  const servicos = i.servicos.join(", ");
  const quando = i.data && i.hora ? `${rotuloDia(i.data)} às ${i.hora}` : "Horário removido";
  if (i.anterior) {
    return (
      <>
        {servicos && <span>{servicos} ·</span>}
        <s>
          {rotuloDia(i.anterior.data)} {i.anterior.hora}
        </s>
        <span>→ {i.data && i.hora ? `${rotuloDia(i.data)} ${i.hora}` : "Horário removido"}</span>
      </>
    );
  }
  return servicos ? `${servicos} · ${quando}` : quando;
}

function LinhaNotificacao({
  item: i,
  agora,
  onIr,
}: {
  item: ItemNotificacao;
  agora: number;
  onIr: () => void;
}) {
  const conteudo = (
    <>
      <span className={styles.sinoIcone} data-tipo={i.tipo} aria-hidden="true">
        <Icon name={ICONE[i.tipo]} size={14} />
      </span>
      <span className={styles.sinoTexto}>
        <span className={styles.sinoLinha1}>
          <strong>{i.cliente ?? "Cliente"}</strong>
          <span className={styles.sinoTempo}>{tempoRelativo(i.criadoEm, agora)}</span>
        </span>
        <span className={styles.sinoMeta}>
          {rotuloTipo(i.tipo)} ·{i.canal === "whatsapp_bot" && <Icon name="chat" size={12} />}
          {rotuloCanal(i.canal)}
        </span>
        <span className={styles.sinoMeta}>{detalhe(i)}</span>
      </span>
    </>
  );
  const lida = i.lida ? "true" : undefined;
  return i.data ? (
    <Link href={`/agenda?d=${i.data}`} className={styles.sinoItem} data-lida={lida} onClick={onIr}>
      {conteudo}
    </Link>
  ) : (
    <div className={styles.sinoItem} data-lida={lida}>
      {conteudo}
    </div>
  );
}
```

Nota: se `Icon` não aceitar algum dos nomes `bell`, `plus`, `x`, `clock` ou `chat` no tipo da prop `name`, reporte NEEDS_CONTEXT em vez de inventar ícone. Os cinco existem em `components/agenda/Icon.tsx`.

- [ ] **Step 3: Wire into `components/Topbar.tsx`.** Adicione o import `import { SinoNotificacoes } from "@/components/SinoNotificacoes";`. Depois troque o bloco

```tsx
          {children && (
            <div className="ml-auto flex items-center gap-1.5">{children}</div>
          )}
```

por

```tsx
          <div className="ml-auto flex items-center gap-1.5">
            <SinoNotificacoes />
            {children}
          </div>
```

e atualize o comentário do topo do arquivo, acrescentando: "O sino de notificações (SinoNotificacoes) fica sempre no grupo à direita, antes dos controles da página."

- [ ] **Step 4: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check && pnpm --filter studiold build`
Expected: sem erros; o build passa (o sino entra em `/agenda`, `/clientes`, `/financeiro` e `/configuracoes/*`).

Sem a migration aplicada, a action loga `relation "barbearia_001.notificacoes" does not exist` em runtime. Isso é esperado e não aparece no build.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/agenda/agenda.module.css apps/studiold/components/SinoNotificacoes.tsx apps/studiold/components/Topbar.tsx
git commit -m "feat(studiold): sino de notificações no topbar do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gate final, integração manual e memória

**Files:**
- Modify: `MEMORY.md` (raiz) — seção "Onde parei"

- [ ] **Step 1: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check && pnpm --filter studiold build`
Expected: tudo verde, `agenda.check: OK`.

- [ ] **Step 2: Integração manual.** Depende de o usuário aplicar a migration. Se ela não estiver aplicada, registre o passo como pendente e não contorne.

Confirme (somente leitura, via MCP Supabase):

```sql
select to_regclass('barbearia_001.notificacoes') is not null as tabela,
       exists (select 1 from pg_trigger where tgname = 'trg_notificar_evento') as trigger;
```

Com tudo aplicado, peça ao usuário para:
1. Agendar pelo `/agendar`. Em até 30 s o badge mostra 1. Abrir o sino mostra "Novo agendamento · Site" e zera o badge. Tocar na linha leva ao dia em `/agenda`.
2. Remarcar esse agendamento em Meus agendamentos. Aparece 1 notificação "Remarcação", com o antes riscado, e não duas.
3. Cancelar pelo site. Aparece "Cancelamento · Site".
4. Cancelar outro agendamento pelo painel. Não aparece nenhuma notificação.

Confira com:

```sql
select tipo, canal, lida, inicio_anterior, criado_em
from barbearia_001.notificacoes order by criado_em desc limit 5;
```

- [ ] **Step 3: Atualizar `MEMORY.md`.** No topo de "## Onde parei", acrescente um parágrafo no formato dos existentes. Ele deve cobrir:
  - o que foi entregue (sino, actions, trigger em `agendamento_eventos`, commits);
  - por que o trigger lê `agendamento_eventos` e não `agendamentos`;
  - a fusão da remarcação do site;
  - as pendências: migration a aplicar, integração manual, aceitação a 375px.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs: memória das notificações do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
