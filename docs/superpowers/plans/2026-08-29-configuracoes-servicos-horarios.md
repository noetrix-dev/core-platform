# /configuracoes — Serviços e Horários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar duas seções à rota `/configuracoes`: gestão de serviços (listar, editar nome/preço/duração num form por linha, ativar/desativar, adicionar — sem excluir) e gestão de horário de funcionamento (7 dias + bloqueio de almoço, editados num form único com um botão "Salvar horários").

**Architecture:** Segue o padrão já firmado em `/configuracoes`: a `page.tsx` é RSC `force-dynamic` que busca via `tenantDb()` e renderiza seções; mutações via Server Actions em `app/configuracoes/actions.ts` com `revalidatePath("/configuracoes")`. Serviços usa o mesmo padrão server-component + `<form action={serverAction}>` + `<details>` "Editar" das cortesias. Horários é um client component (`HorariosForm.tsx`, `useState` + `useTransition`) porque tem estado de form (7 dias) e um único Save; chama a Server Action `salvarHorarios(dias, almoco)` com payload estruturado. Um parser puro de preço pt-BR (`lib/dinheiro.ts`) é extraído e testado.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), React 19, `@supabase/supabase-js` (service-role server-only, schema `barbearia_001`), CSS Modules escopados (`agenda.module.css`), `node --experimental-strip-types` para o check de lógica pura.

**Spec:** Design aprovado no chat de brainstorming (bounded; sem arquivo de spec separado). Decisões:
- Serviços: editar via `<details>` "Editar" + form com nome/preço/duração + botão Salvar → `editarServico(fd)`. Não é edição campo-a-campo inline.
- Horários: um form pra seção inteira, um botão "Salvar horários" → `salvarHorarios(dias, almoco)`.
- Sem migration — `barbearia_001.servicos`, `horarios_funcionamento`, `bloqueios_fixos` já existem.
- Nav do `/configuracoes` no Topbar: "Cortesias e Músicas" → **"Ajustes"**.

## Global Constraints

- Toda a UI, labels, mensagens em **pt-BR**.
- `apps/studiold/app/globals.css` fica **como está**. Estilo novo só em `agenda.module.css` (CSS Module escopado), antes do bloco `@media (prefers-reduced-motion: reduce) {`.
- Server Actions em `app/configuracoes/actions.ts` são `"use server"` (o arquivo já tem a diretiva no topo), usam `tenantDb()` de `@/lib/supabase/server`. Validação no servidor (`.claude/rules/security.md`): `nome` trim ≤ 120; `preco` via `parsePrecoBRL` (≥ 0, 2 casas); `duracao_minutos` inteiro 1–600; ids batem `/^[0-9a-f-]{36}$/i`; horas batem `/^([01]\d|2[0-3]):[0-5]\d$/`; `hora_abertura < hora_fechamento` (comparação lexical de "HH:MM"); `hora_inicio < hora_fim` no almoço.
- `mudança de schema = nenhuma`. As tabelas e colunas usadas já existem.
- Colunas `TIME` do Postgres voltam do PostgREST como `"HH:MM:SS"` — no read fazer `.slice(0, 5)`; no write mandar `"HH:MM"` (PostgREST aceita).
- Coluna `NUMERIC` (`servicos.preco`) volta como **string** — no read fazer `Number(...)`.
- Seguir os padrões existentes: `EstoqueEditavel.tsx` (client, `useTransition`, co-locado em `app/configuracoes/`); a seção Cortesias da `page.tsx` (server component, `<form action>` nativo, `<details className={styles.cfgEdit}>` "Editar", `.cfgSwitch` toggle via `<form>` com valor invertido, `.cfgAddbar` no topo); `fmtPreco` / `DIAS_SEMANA_LONGO` de `@/lib/agenda/time`; classes `.cfgSection/.cfgRow/.cfgRow__nome/.cfgRow__meta/.cfgRow__acoes/.cfgAddbar/.cfgEdit/.cfgSummary/.cfgSwitch/.field/.btn/.btn--primary/.btn--ghost`.
- Sem framework de teste de componente. Lógica pura testada em `apps/studiold/lib/agenda/agenda.check.ts` (`node:assert/strict`, `pnpm --filter studiold check`). Server Actions / seções de página / componentes verificados por `pnpm --filter studiold typecheck` + `lint` + `build`.
- `agenda.check.ts` roda com `--experimental-strip-types` — `lib/dinheiro.ts` não pode ter `enum`/`namespace`, e o import no check leva `.ts`.
- Comandos rodam da raiz do monorepo; `pnpm --filter studiold <script>` mira o app.

---

## File Structure

**Criar:**
- `apps/studiold/lib/dinheiro.ts` — `parsePrecoBRL(s: string): number | null`. Pura, sem imports. Testável.
- `apps/studiold/app/configuracoes/HorariosForm.tsx` — client component da seção de horários (form dos 7 dias + almoço, um Save).

**Modificar:**
- `apps/studiold/lib/agenda/agenda.check.ts` — asserts para `parsePrecoBRL`.
- `apps/studiold/app/configuracoes/actions.ts` — helper `inteiro`; Server Actions `criarServico`, `editarServico`, `toggleServicoAtivo`, `salvarHorarios`; imports de `parsePrecoBRL` e `DIAS_SEMANA_LONGO`.
- `apps/studiold/app/configuracoes/page.tsx` — tipos `Servico`/`DiaHorario`/`Almoco`; fetch de `servicos` + `horarios_funcionamento` + `bloqueios_fixos` (suave); seção "Serviços" (server); `<HorariosForm>` na seção "Horário de funcionamento".
- `apps/studiold/app/agenda/agenda.module.css` — `.cfgHorario*`.
- `apps/studiold/components/Topbar.tsx` — label do item `/configuracoes`: `"Cortesias e Músicas"` → `"Ajustes"`.

**Sem mudança:** `lib/supabase/server.ts`, `EstoqueEditavel.tsx`, `Drawer.tsx`, `lib/agenda/time.ts`.

---

## Task 1: Parser puro de preço (`lib/dinheiro.ts`)

**Files:**
- Create: `apps/studiold/lib/dinheiro.ts`
- Test: `apps/studiold/lib/agenda/agenda.check.ts` (adiciona bloco)

**Interfaces:**
- Consumes: nada.
- Produces: `export function parsePrecoBRL(s: string): number | null` — `"55"→55`, `"55,50"→55.5`, `"1.234,56"→1234.56`, `"55.50"→55.5` (ponto = decimal quando não há vírgula), `""` / não-numérico / negativo → `null`; arredonda para 2 casas.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar o import junto dos outros imports do topo:

```ts
import { parsePrecoBRL } from "../dinheiro.ts";
```

E adicionar este bloco logo antes de `console.log("agenda.check: OK");`:

```ts
// --- parsePrecoBRL --------------------------------------------------
{
  assert.equal(parsePrecoBRL("55"), 55);
  assert.equal(parsePrecoBRL("55,50"), 55.5);
  assert.equal(parsePrecoBRL("1.234,56"), 1234.56);
  assert.equal(parsePrecoBRL("55.50"), 55.5, "ponto = decimal quando não há vírgula");
  assert.equal(parsePrecoBRL("  80,00  "), 80, "trim");
  assert.equal(parsePrecoBRL("10,999"), 11, "arredonda para 2 casas");
  assert.equal(parsePrecoBRL(""), null);
  assert.equal(parsePrecoBRL("abc"), null);
  assert.equal(parsePrecoBRL("-3"), null);
  assert.equal(parsePrecoBRL("R$ 55"), null, "sem limpeza de símbolo — entrada tem que ser numérica");
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — `Cannot find module '../dinheiro.ts'`.

- [ ] **Step 3: Criar `lib/dinheiro.ts`**

Create `apps/studiold/lib/dinheiro.ts`:

```ts
// Parse de valor em reais digitado por humano.
// "55" -> 55 ; "55,50" -> 55.5 ; "1.234,56" -> 1234.56 ;
// "55.50" -> 55.5 (ponto tratado como decimal quando não há vírgula).
// Vazio / não-numérico / negativo -> null. Arredonda para 2 casas.
export function parsePrecoBRL(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
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
git add apps/studiold/lib/dinheiro.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat: parsePrecoBRL — parser puro de preço pt-BR + testes"
```

---

## Task 2: Server Actions de serviços e horários

**Files:**
- Modify: `apps/studiold/app/configuracoes/actions.ts`

**Interfaces:**
- Consumes: `parsePrecoBRL` de `@/lib/dinheiro` (Task 1); `DIAS_SEMANA_LONGO` de `@/lib/agenda/time`; helpers já no arquivo (`texto`, `idDe`, `ROTA`, `tenantDb`, `revalidatePath`).
- Produces:
  ```ts
  export async function criarServico(fd: FormData): Promise<void>
  export async function editarServico(fd: FormData): Promise<void>
  export async function toggleServicoAtivo(fd: FormData): Promise<void>

  type DiaPayload = { dia_semana: number; aberto: boolean; hora_abertura: string; hora_fechamento: string };
  type AlmocoPayload = { id: string; hora_inicio: string; hora_fim: string } | null;
  export async function salvarHorarios(
    dias: DiaPayload[],
    almoco: AlmocoPayload,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Imports e helper**

Em `apps/studiold/app/configuracoes/actions.ts`, adicionar aos imports (depois da linha `import { tenantDb } from "@/lib/supabase/server";`):

```ts
import { parsePrecoBRL } from "@/lib/dinheiro";
import { DIAS_SEMANA_LONGO } from "@/lib/agenda/time";
```

E adicionar este helper logo depois da função `idDe`:

```ts
function inteiro(fd: FormData, campo: string): number | null {
  const n = Number(fd.get(campo));
  return Number.isInteger(n) ? n : null;
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
```

- [ ] **Step 2: Actions de serviço**

Adicionar ao final de `apps/studiold/app/configuracoes/actions.ts`:

```ts
// --- serviços ---------------------------------------------------------

export async function criarServico(fd: FormData): Promise<void> {
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco") ?? "").toString());
  const dur = inteiro(fd, "duracao_minutos");
  if (!nome || preco == null || dur == null || dur < 1 || dur > 600) return;
  const { error } = await tenantDb()
    .from("servicos")
    .insert({ nome, preco, duracao_minutos: dur });
  if (error) throw new Error(`criarServico: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarServico(fd: FormData): Promise<void> {
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco") ?? "").toString());
  const dur = inteiro(fd, "duracao_minutos");
  if (!nome || preco == null || dur == null || dur < 1 || dur > 600) return;
  const { error } = await tenantDb()
    .from("servicos")
    .update({ nome, preco, duracao_minutos: dur })
    .eq("id", id);
  if (error) throw new Error(`editarServico: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleServicoAtivo(fd: FormData): Promise<void> {
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("servicos")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleServicoAtivo: ${error.message}`);
  revalidatePath(ROTA);
}
```

- [ ] **Step 3: Action de horários**

Adicionar ao final de `apps/studiold/app/configuracoes/actions.ts`:

```ts
// --- horário de funcionamento --------------------------------------

type DiaPayload = {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};
type AlmocoPayload = { id: string; hora_inicio: string; hora_fim: string } | null;

export async function salvarHorarios(
  dias: DiaPayload[],
  almoco: AlmocoPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(dias) || dias.length !== 7) {
    return { ok: false, error: "payload inválido" };
  }
  for (const d of dias) {
    if (!Number.isInteger(d.dia_semana) || d.dia_semana < 0 || d.dia_semana > 6) {
      return { ok: false, error: "dia da semana inválido" };
    }
    if (d.aberto) {
      if (!HM.test(d.hora_abertura) || !HM.test(d.hora_fechamento)) {
        return {
          ok: false,
          error: `Preencha os horários de ${DIAS_SEMANA_LONGO[d.dia_semana]}.`,
        };
      }
      if (d.hora_abertura >= d.hora_fechamento) {
        return {
          ok: false,
          error: `Em ${DIAS_SEMANA_LONGO[d.dia_semana]}, a abertura deve ser antes do fechamento.`,
        };
      }
    }
  }
  if (almoco) {
    if (!/^[0-9a-f-]{36}$/i.test(almoco.id)) {
      return { ok: false, error: "id do almoço inválido" };
    }
    if (
      !HM.test(almoco.hora_inicio) ||
      !HM.test(almoco.hora_fim) ||
      almoco.hora_inicio >= almoco.hora_fim
    ) {
      return { ok: false, error: "Horário do almoço inválido." };
    }
  }

  const db = tenantDb();
  for (const d of dias) {
    const { error } = await db
      .from("horarios_funcionamento")
      .update({
        aberto: d.aberto,
        hora_abertura: d.aberto ? d.hora_abertura : null,
        hora_fechamento: d.aberto ? d.hora_fechamento : null,
      })
      .eq("dia_semana", d.dia_semana);
    if (error) {
      return { ok: false, error: `salvarHorarios/dia ${d.dia_semana}: ${error.message}` };
    }
  }
  if (almoco) {
    const { error } = await db
      .from("bloqueios_fixos")
      .update({ hora_inicio: almoco.hora_inicio, hora_fim: almoco.hora_fim })
      .eq("id", almoco.id);
    if (error) {
      return { ok: false, error: `salvarHorarios/almoço: ${error.message}` };
    }
  }
  revalidatePath(ROTA);
  return { ok: true };
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos. Build ainda 6 rotas (nenhuma rota nova). Se `lint` reclamar de `criarServico`/`editarServico`/etc. "não usados" — não reclama: são exports de um `"use server"`, tratados como usados.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/configuracoes/actions.ts
git commit -m "feat: Server Actions de serviços e horários em /configuracoes"
```

---

## Task 3: Seção "Serviços" na page

**Files:**
- Modify: `apps/studiold/app/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `criarServico`, `editarServico`, `toggleServicoAtivo` (via `A.*`, Task 2); `fmtPreco` de `@/lib/agenda/time`.
- Produces: nada consumido por task posterior (a Task 4 adiciona OUTRA seção no mesmo arquivo, em região distinta).

- [ ] **Step 1: Import e tipo**

Em `apps/studiold/app/configuracoes/page.tsx`:

1a. Adicionar `fmtPreco` ao import de `@/lib/agenda/time` (o arquivo ainda não importa de lá — adicionar a linha após o import de `Topbar`):
```ts
import { fmtPreco } from "@/lib/agenda/time";
```

1b. Adicionar o tipo junto de `Cortesia`/`Estilo`:
```ts
type Servico = {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
};
```

- [ ] **Step 2: Fetch**

Em `ConfiguracoesPage`, trocar o `Promise.all` de duas queries por três, e adicionar o guard + o mapeamento:

```ts
  const db = tenantDb();
  const [cRes, eRes, sRes] = await Promise.all([
    db
      .from("cortesias")
      .select("id, nome, descricao, ativo, quantidade_estoque")
      .order("nome"),
    db.from("estilos_musica").select("id, nome, ativo").order("nome"),
    db
      .from("servicos")
      .select("id, nome, preco, duracao_minutos, ativo")
      .order("nome"),
  ]);
  if (cRes.error) throw new Error(`configuracoes/cortesias: ${cRes.error.message}`);
  if (eRes.error) throw new Error(`configuracoes/estilos: ${eRes.error.message}`);
  if (sRes.error) throw new Error(`configuracoes/servicos: ${sRes.error.message}`);
  const cortesias = (cRes.data ?? []) as Cortesia[];
  const estilos = (eRes.data ?? []) as Estilo[];
  const servicos = ((sRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    preco: Number(s.preco),
    duracao_minutos: s.duracao_minutos as number,
    ativo: s.ativo as boolean,
  })) satisfies Servico[];
```

- [ ] **Step 3: Renderizar a seção**

Em `apps/studiold/app/configuracoes/page.tsx`, adicionar esta `<section>` dentro do `<main>`, logo APÓS o fechamento da seção `{/* ---- ESTILOS DE MÚSICA ---- */}` (o `</section>` dela) e ANTES do `</main>`:

```tsx
        {/* ---- SERVIÇOS ---- */}
        <section className={styles.cfgSection}>
          <header>
            <Icon name="scissors" size={15} /> Serviços
          </header>

          <form action={A.criarServico} className={styles.cfgAddbar}>
            <input
              name="nome"
              placeholder="Novo serviço"
              aria-label="Nome do novo serviço"
              required
              maxLength={120}
            />
            <input
              name="preco"
              inputMode="decimal"
              placeholder="Preço (R$)"
              aria-label="Preço do novo serviço"
              required
            />
            <input
              type="number"
              name="duracao_minutos"
              min={1}
              max={600}
              placeholder="min"
              aria-label="Duração em minutos do novo serviço"
              required
            />
            <button
              type="submit"
              className={`${styles.btn} ${styles["btn--primary"]}`}
            >
              <Icon name="plus" size={14} /> Adicionar
            </button>
          </form>

          {servicos.length === 0 && (
            <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
              Nenhum serviço cadastrado.
            </p>
          )}

          {servicos.map((s) => (
            <div
              key={s.id}
              className={styles.cfgRow}
              data-inativo={s.ativo ? undefined : "true"}
            >
              <div>
                <p className={styles.cfgRow__nome}>{s.nome}</p>
                <p className={styles.cfgRow__meta}>
                  {fmtPreco(s.preco)} · {s.duracao_minutos} min
                </p>
              </div>

              <div className={styles.cfgRow__acoes}>
                <form action={A.toggleServicoAtivo}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="ativo" value={String(!s.ativo)} />
                  <button
                    type="submit"
                    className={styles.cfgSwitch}
                    data-on={s.ativo}
                    aria-label={`${s.ativo ? "Desativar" : "Ativar"} ${s.nome}`}
                  />
                </form>
              </div>

              <details className={styles.cfgEdit}>
                <summary
                  className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
                >
                  Editar
                </summary>
                <form action={A.editarServico}>
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="nome"
                    defaultValue={s.nome}
                    aria-label={`Nome de ${s.nome}`}
                    required
                    maxLength={120}
                  />
                  <input
                    name="preco"
                    inputMode="decimal"
                    defaultValue={String(s.preco).replace(".", ",")}
                    aria-label={`Preço de ${s.nome}`}
                    required
                  />
                  <input
                    type="number"
                    name="duracao_minutos"
                    defaultValue={s.duracao_minutos}
                    min={1}
                    max={600}
                    aria-label={`Duração de ${s.nome}`}
                    required
                  />
                  <button
                    type="submit"
                    className={`${styles.btn} ${styles["btn--primary"]}`}
                  >
                    Salvar
                  </button>
                </form>
              </details>
            </div>
          ))}
        </section>
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos, 6 rotas.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/configuracoes/page.tsx
git commit -m "feat: seção Serviços em /configuracoes (listar, editar, ativar, adicionar)"
```

---

## Task 4: Seção "Horário de funcionamento"

**Files:**
- Create: `apps/studiold/app/configuracoes/HorariosForm.tsx`
- Modify: `apps/studiold/app/configuracoes/page.tsx`
- Modify: `apps/studiold/app/agenda/agenda.module.css`

**Interfaces:**
- Consumes: `salvarHorarios` (via `./actions`, Task 2); `DIAS_SEMANA_LONGO` de `@/lib/agenda/time`; `Icon` de `@/components/agenda/Icon`.
- Produces:
  ```ts
  export function HorariosForm(props: {
    dias: { dia_semana: number; aberto: boolean; hora_abertura: string; hora_fechamento: string }[];
    almoco: { id: string; hora_inicio: string; hora_fim: string } | null;
  }): JSX.Element
  ```

- [ ] **Step 1: CSS**

Em `apps/studiold/app/agenda/agenda.module.css`, imediatamente antes de `@media (prefers-reduced-motion: reduce) {`:

```css
/* ---- /configuracoes: horário de funcionamento -------------------- */
.cfgHorarioRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.45rem 0.75rem;
  align-items: center;
  padding: 0.6rem 0.85rem;
  box-shadow: inset 0 -1px 0 0 var(--chrome);
}
.cfgHorarioRow[data-fechado="true"] {
  opacity: 0.55;
}
.cfgHorarioDia {
  font-family: var(--font-barlow-cond), sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  text-transform: capitalize;
}
.cfgHorarioTimes {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.cfgHorarioTimes span {
  color: var(--ink-2);
  font-size: 0.82rem;
}
.cfgHorarioTimes input {
  background: #fbfaf6;
  box-shadow: inset 0 0 0 1px var(--chrome);
  border-radius: var(--r);
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.cfgHorarioTimes input:disabled {
  opacity: 0.4;
}
.cfgHorarioTimes input:focus {
  outline: 2px solid var(--oxblood);
  outline-offset: 1px;
}
.cfgHorarioSalvar {
  padding: 0.85rem;
}
```

- [ ] **Step 2: Criar `HorariosForm.tsx`**

Create `apps/studiold/app/configuracoes/HorariosForm.tsx`:

```tsx
"use client";

// Form da seção de horários: 7 dias + bloqueio de almoço, um botão Salvar.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarHorarios } from "./actions";
import { DIAS_SEMANA_LONGO } from "@/lib/agenda/time";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";

type Dia = {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};
type Almoco = { id: string; hora_inicio: string; hora_fim: string } | null;

export function HorariosForm({
  dias: diasIniciais,
  almoco: almocoInicial,
}: {
  dias: Dia[];
  almoco: Almoco;
}) {
  const router = useRouter();
  const [dias, setDias] = useState(diasIniciais);
  const [almoco, setAlmoco] = useState(almocoInicial);
  const [salvando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  const patchDia = (i: number, p: Partial<Dia>) =>
    setDias((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const salvar = () => {
    setAviso(null);
    iniciar(async () => {
      const r = await salvarHorarios(dias, almoco).catch(() => ({
        ok: false as const,
        error: "Falha de conexão. Tente de novo.",
      }));
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="clock" size={15} /> Horário de funcionamento
      </header>

      {dias.map((d, i) => (
        <div
          key={d.dia_semana}
          className={styles.cfgHorarioRow}
          data-fechado={d.aberto ? undefined : "true"}
        >
          <span className={styles.cfgHorarioDia}>
            {DIAS_SEMANA_LONGO[d.dia_semana]}
          </span>
          <button
            type="button"
            className={styles.cfgSwitch}
            data-on={d.aberto}
            aria-label={`${d.aberto ? "Fechar" : "Abrir"} ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
            onClick={() => patchDia(i, { aberto: !d.aberto })}
          />
          <div className={styles.cfgHorarioTimes}>
            <input
              type="time"
              step={900}
              value={d.hora_abertura}
              disabled={!d.aberto}
              aria-label={`Abertura de ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
              onChange={(e) => patchDia(i, { hora_abertura: e.target.value })}
            />
            <span>até</span>
            <input
              type="time"
              step={900}
              value={d.hora_fechamento}
              disabled={!d.aberto}
              aria-label={`Fechamento de ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
              onChange={(e) => patchDia(i, { hora_fechamento: e.target.value })}
            />
          </div>
        </div>
      ))}

      <div className={styles.cfgHorarioRow}>
        <span className={styles.cfgHorarioDia}>Almoço</span>
        {almoco ? (
          <div className={styles.cfgHorarioTimes} style={{ gridColumn: "1 / -1" }}>
            <input
              type="time"
              step={900}
              value={almoco.hora_inicio}
              aria-label="Início do almoço"
              onChange={(e) =>
                setAlmoco((a) => (a ? { ...a, hora_inicio: e.target.value } : a))
              }
            />
            <span>até</span>
            <input
              type="time"
              step={900}
              value={almoco.hora_fim}
              aria-label="Fim do almoço"
              onChange={(e) =>
                setAlmoco((a) => (a ? { ...a, hora_fim: e.target.value } : a))
              }
            />
          </div>
        ) : (
          <span
            className={styles.cfgHorarioTimes}
            style={{ gridColumn: "1 / -1", color: "var(--ink-2)" }}
          >
            Nenhum bloqueio de almoço configurado.
          </span>
        )}
      </div>

      {aviso && (
        <p
          className="px-3.5 pt-3 text-sm"
          style={{ color: "var(--oxblood)" }}
        >
          {aviso}
        </p>
      )}

      <div className={styles.cfgHorarioSalvar}>
        <button
          type="button"
          className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center`}
          disabled={salvando}
          onClick={salvar}
        >
          {salvando ? "Salvando…" : "Salvar horários"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Fetch + render na page**

Em `apps/studiold/app/configuracoes/page.tsx`:

3a. Adicionar o import:
```ts
import { HorariosForm } from "./HorariosForm";
```

3b. Adicionar as duas queries ao `Promise.all` (agora 5) e o mapeamento. O bloco final do fetch fica:

```ts
  const db = tenantDb();
  const [cRes, eRes, sRes, hRes, bRes] = await Promise.all([
    db
      .from("cortesias")
      .select("id, nome, descricao, ativo, quantidade_estoque")
      .order("nome"),
    db.from("estilos_musica").select("id, nome, ativo").order("nome"),
    db
      .from("servicos")
      .select("id, nome, preco, duracao_minutos, ativo")
      .order("nome"),
    db
      .from("horarios_funcionamento")
      .select("dia_semana, aberto, hora_abertura, hora_fechamento")
      .order("dia_semana"),
    db
      .from("bloqueios_fixos")
      .select("id, hora_inicio, hora_fim")
      .eq("tipo", "suave")
      .order("id")
      .limit(1),
  ]);
  if (cRes.error) throw new Error(`configuracoes/cortesias: ${cRes.error.message}`);
  if (eRes.error) throw new Error(`configuracoes/estilos: ${eRes.error.message}`);
  if (sRes.error) throw new Error(`configuracoes/servicos: ${sRes.error.message}`);
  if (hRes.error) throw new Error(`configuracoes/horarios: ${hRes.error.message}`);
  if (bRes.error) throw new Error(`configuracoes/bloqueios: ${bRes.error.message}`);

  const cortesias = (cRes.data ?? []) as Cortesia[];
  const estilos = (eRes.data ?? []) as Estilo[];
  const servicos = ((sRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    preco: Number(s.preco),
    duracao_minutos: s.duracao_minutos as number,
    ativo: s.ativo as boolean,
  })) satisfies Servico[];
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
```

3c. Adicionar `<HorariosForm>` dentro do `<main>`, logo após o `</section>` da seção Serviços (Task 3), antes do `</main>`:

```tsx
        <HorariosForm dias={dias} almoco={almoco} />
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos, 6 rotas.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/configuracoes/HorariosForm.tsx apps/studiold/app/configuracoes/page.tsx apps/studiold/app/agenda/agenda.module.css
git commit -m "feat: seção Horário de funcionamento em /configuracoes (7 dias + almoço, um Salvar)"
```

---

## Task 5: Rename do nav + gate final + push

**Files:**
- Modify: `apps/studiold/components/Topbar.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Rename**

Em `apps/studiold/components/Topbar.tsx`, no array `GERENCIAR`, trocar:
```ts
  { href: "/configuracoes", label: "Cortesias e Músicas", icone: "music" },
```
por:
```ts
  { href: "/configuracoes", label: "Ajustes", icone: "gear" },
```
(o ícone `"gear"` já existe em `Icon.tsx` e casa melhor com "Ajustes"; o tipo `ItemNav.icone` já aceita `"gear"`? — verificar: se o union não tem `"gear"`, adicionar. `Icon.tsx` tem o glyph `gear`.)

Se `ItemNav.icone` não incluir `"gear"`, estender o union:
```ts
type ItemNav = {
  href: string;
  label: string;
  icone: "calendar" | "cash" | "music" | "user" | "gear";
};
```

- [ ] **Step 2: Gate completo**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos. `agenda.check: OK`. Build lista 6 rotas (`/`, `/agenda`, `/clientes`, `/configuracoes`, `/financeiro`, `_not-found`).

- [ ] **Step 3: Conferir o diff**

Run: `git status --porcelain && git diff --stat`
Confirmar: só arquivos de `apps/studiold/**`; nada de `.env*`; nada em `infra/supabase/migrations/**`.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/components/Topbar.tsx
git commit -m "chore: nav /configuracoes → 'Ajustes'"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Notas de edge cases (referência)

- **`servicos.preco` NUMERIC → string:** `Number(s.preco)` no read; `parsePrecoBRL` no write; o form de editar pré-preenche com `String(s.preco).replace(".", ",")` (ex.: `55` → `"55"`, `55.5` → `"55,5"`).
- **Preço/duração inválidos no submit:** as Server Actions `criarServico`/`editarServico` fazem `return` silencioso (mesmo padrão de `criarCortesia` com nome vazio). O `required` + `inputMode="decimal"` + `type="number"` nos inputs pegam a maioria dos casos no cliente.
- **`horarios_funcionamento` deve ter as 7 linhas** (seed insere; `UNIQUE(dia_semana)`). `salvarHorarios` faz `update ... where dia_semana = N` — se faltar uma linha, aquele `update` afeta 0 linhas sem erro (aceitável; não criar).
- **Dia fechado:** `salvarHorarios` grava `hora_abertura`/`hora_fechamento` como `null`. O form desabilita os `<input type="time">` do dia fechado; ao reabrir, os campos voltam vazios e a validação exige preencher.
- **Bloqueio de almoço:** assume exatamente uma linha `bloqueios_fixos` com `tipo='suave'`. Se houver zero, o form mostra "Nenhum bloqueio de almoço configurado." e o Save pula o almoço. Se houver mais de uma, edita só a primeira (`order("id").limit(1)`); improvável no seed.
- **Comparação de horas:** `"HH:MM"` zero-padded compara lexicalmente igual a numericamente (`"09:00" < "17:00"`). Válido para todos os horários de um dia.
- **Fuso:** `TIME` não tem fuso; a agenda (`load.ts`) já lê `hora_abertura`/`hora_fechamento` como `"HH:MM"` e converte com `hmToMin`. Nada a fazer aqui.
- **Propagação pro `/agenda`:** `/agenda` é `force-dynamic`; a próxima navegação relê `horarios_funcionamento`/`bloqueios_fixos`/`servicos`. `revalidatePath("/configuracoes")` só afeta a própria rota, o que basta.

## Self-Review

**Spec coverage:**
- Serviços: listar (Task 3 fetch + map); editar nome/preço/duração num form (`<details>` "Editar" → `editarServico`, Task 2+3); toggle ativo (`toggleServicoAtivo`, Task 2+3); adicionar (`criarServico` + `.cfgAddbar`, Task 2+3); sem excluir (nenhuma action de delete). "same pattern as EstoqueEditavel" foi respondido no brainstorming como `<details>`+form (decisão B).
- Horários: mostrar as 7 linhas (Task 4 fetch + `HorariosForm` map); toggle aberto/fechado por dia (`.cfgSwitch` → `patchDia`); editar abertura/fechamento quando aberto (`<input type="time">` `disabled={!d.aberto}`); bloco de almoço editável (`bloqueios_fixos` `tipo='suave'` → `salvarHorarios` almoço). Um botão "Salvar horários" (decisão B).
- Padrão de Server Actions: mesmo `"use server"` + `tenantDb()` + `revalidatePath` (Task 2). Design da Estação: só classes `.cfg*` + `.field`/`.btn` + 1 bloco `.cfgHorario*` (Task 4). Mobile-first: `.cfgAddbar` já quebra; `.cfgHorarioTimes` é `grid-column: 1/-1` (empilha embaixo do dia+toggle); Save `w-full`. pt-BR em tudo.
- Nav rename (Task 5).
- Sem lacunas.

**Placeholder scan:** sem "TBD/TODO"; todo passo tem o código real. A checagem condicional na Task 5 Step 1 ("se `ItemNav.icone` não incluir `gear`") vem com o código dos dois caminhos.

**Type consistency:**
- `parsePrecoBRL(s: string): number | null` — definido Task 1, consumido Task 2 (`criarServico`/`editarServico`).
- `Servico = { id, nome, preco: number, duracao_minutos: number, ativo: boolean }` — Task 3 define e monta campo a campo; usado só na Task 3.
- `DiaPayload`/`AlmocoPayload` (Task 2, em `actions.ts`) e `Dia`/`Almoco` (Task 4, em `HorariosForm.tsx`) têm a MESMA forma de campo: `{ dia_semana, aberto, hora_abertura, hora_fechamento }` e `{ id, hora_inicio, hora_fim } | null`. `HorariosForm` passa `dias`/`almoco` direto pra `salvarHorarios(dias, almoco)` — batem.
- `salvarHorarios(dias, almoco): Promise<{ ok: true } | { ok: false; error: string }>` — assinatura idêntica na definição (Task 2 Step 3) e na chamada (Task 4 `HorariosForm`).
- `page.tsx` monta `dias`/`almoco` (Task 4 Step 3b) com exatamente os campos que `HorariosForm` espera (Task 4 Step 2 props).
- `Icon` names usados: `scissors` (Task 3), `clock` (Task 4), `gear`/`plus` (Task 5 / existentes) — todos já em `Icon.tsx`.
