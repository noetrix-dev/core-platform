# Meus Agendamentos `/agendar/meus-agendamentos` (Spec C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Área do cliente da StudiOLD para ver os agendamentos e cancelar ou remarcar os futuros, com a identidade vinda só do cookie `agendar_sessao`.

**Architecture:**
- A página `/agendar/meus-agendamentos` é um Server Component. Lê a sessão, carrega a lista por `lib/agendar/meus.ts` (service-role, só servidor) e entrega a lista a componentes cliente para cancelar com confirmação inline.
- Remarcar reaproveita o wizard da Spec B via `/agendar?remarcar=<id>`. A página do wizard passa a ler a sessão no servidor e abre direto em Serviços.
- `confirmarAgendamento` cria o novo agendamento e só depois cancela o antigo.
- Toda action confere o dono do agendamento antes de chamar `fn_cancelar_agendamento_v2`, que não confere.

**Tech Stack:** Next 16.3 (App Router, RSC, Server Actions, `searchParams` como Promise, `cookies()` async), React 19.2, `@supabase/supabase-js` 2 (service-role), CSS Modules + Tailwind 4 utilitário, check sem framework (`node --experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-10-04-meus-agendamentos-design.md` (ler junto). Contexto: `docs/superpowers/specs/2026-10-04-agendamento-agendar-design.md` (Spec B).

## Global Constraints

- **Direto em `main`, sem branch** (pedido do usuário). Sem migration: `fn_cancelar_agendamento_v2(p_agendamento_id uuid, p_motivo text, p_descricao text, p_origem text)` já existe, não valida origem e `motivo_cancelamento` não tem CHECK (conferido ao vivo).
- **Nunca editar** `infra/supabase/migrations/**` nem `.env*`. Há arquivos sujos não relacionados em `docs/migrations-draft/` e `infra/supabase/migrations/`: `git add` só os arquivos da task.
- **Sem `requireUser()`** em `/agendar/**` (intencional). A identidade vem **só** de `lerSessao()`. Telefone ou `clienteId` vindos da UI nunca são aceitos.
- **`fn_cancelar_agendamento_v2` não confere o dono.** Antes de cancelar ou remarcar, ler o agendamento filtrando por `cliente_id = sessao.clienteId` e exigir `ehRemarcavel` (status `agendado`/`confirmado` e horário no futuro). Se falhar, a resposta é sempre "Agendamento não encontrado." (não revela se o id existe).
- **Cancelar:** `p_motivo 'cliente'`, `p_origem 'site'`. **Remarcar:** `p_motivo 'remarcado'`, `p_origem 'site'`, e o antigo só é cancelado **depois** de o novo ser criado.
- `confirmarAgendamento` **não apaga mais** o cookie de sessão.
- **Erros:** de DB/API passam por `erroInterno(tag, mensagem)` (detalhe só no log, mensagem fixa pt-BR).
- **UI:**
  - Toda em pt-BR, mobile-first a 375px.
  - Todo controle com label ou `aria-label`; alvos de 44px ou mais.
  - Botões ganham altura por `css.cta` (`app/agendar/agendar.module.css`), porque o `py-*` do Tailwind é anulado pelo padding do `.btn`.
  - Sem CSS global novo. Estilo novo só em `app/agendar/agendar.module.css`, usando os tokens do `.shell` (`--matte`, `--matte-ink`, `--oxblood`, `--ink`, `--ink-2`, `--chrome`, `--chrome-dark`, `--enamel-hi`, `--enamel-lo`, `--steel`, `--sage`, `--ochre`, `--r`).
  - Reusar `.btn`, `.btn--primary`, `.btn--danger`, `.pageTitle`, `.msgQuiet` de `app/agenda/agenda.module.css`.
- **Imports:** relativos entre arquivos de `lib/` usam extensão `.ts`; componentes e actions usam o alias `@/`.
- **Gate por task:** `pnpm --filter studiold typecheck`, `pnpm --filter studiold lint`, `pnpm --filter studiold check`. O gate final adiciona `pnpm --filter studiold build`. O `pnpm build` da raiz falha por ambiente: os outros apps não têm `node_modules`.
- **Desvios conscientes da spec:**
  - Sem `revalidatePath`, porque as duas páginas são `force-dynamic` e o `router.refresh()` já re-renderiza.
  - Sem o botão "Agendar" no estado vazio, porque "Novo agendamento" já fica no topo da página.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/agendar/formato.ts` | modificar | puros: `ItemAgendamento`, `ehUuid`, `ehRemarcavel`, `separarAgendamentos`, `rotuloStatus` |
| `lib/agenda/agenda.check.ts` | modificar | asserts dos puros novos |
| `lib/agendar/meus.ts` | criar | leitura server-only: lista do cliente, um agendamento do cliente, nome do cliente |
| `app/agendar/actions.ts` | modificar | `cancelarAgendamento`; `confirmarAgendamento` com `remarcarId` e sem apagar sessão; `ResumoAgendamento` e `FalhaAgendar` estendidos |
| `app/agendar/agendar.module.css` | modificar | classes de cartão, selo, ações, anteriores, faixa remarcando, link discreto |
| `app/agendar/meus-agendamentos/page.tsx` | criar | RSC: sessão → redirect ou lista |
| `app/agendar/meus-agendamentos/MeusAgendamentos.tsx` | criar | página cliente: topo, Próximos, Anteriores |
| `app/agendar/meus-agendamentos/CartaoAgendamento.tsx` | criar | cartão futuro com Remarcar e Cancelar (confirmação inline) |
| `app/agendar/page.tsx` | modificar | lê sessão, `remarcar` e `destino`; monta `inicial` |
| `app/agendar/AgendarWizard.tsx` | modificar | `inicial`/`destino`/`remarcar`; faixa Remarcando; sucesso volta para Serviços |
| `app/agendar/EtapaServicos.tsx` | modificar | link "Meus agendamentos" |
| `app/agendar/EtapaConfirmacao.tsx` | modificar | "Novo horário" e "Antes" riscado |
| `app/agendar/EtapaSucesso.tsx` | modificar | "Remarcado!", aviso de falha, link "Ver meus agendamentos" |

---

### Task 1: Helpers puros da lista

**Files:**
- Modify: `apps/studiold/lib/agendar/formato.ts` (append no fim do arquivo)
- Modify: `apps/studiold/lib/agenda/agenda.check.ts` (import + bloco antes de `console.log("agenda.check: OK")`)

**Interfaces:**
- Produces:
  - `export type ItemAgendamento = { id: string; inicio: string; data: string; hora: string; servicos: string[]; valorTotal: number; status: string }`
  - `export function ehUuid(s: unknown): s is string`
  - `export function ehRemarcavel(a: { status: string; inicio: string }, agora: number): boolean`
  - `export function separarAgendamentos<T extends { status: string; inicio: string }>(itens: T[], agora: number): { futuros: T[]; passados: T[] }`
  - `export function rotuloStatus(status: string): string`

- [ ] **Step 1: Write the failing test.** Em `lib/agenda/agenda.check.ts`, acrescente ao import existente de `"../agendar/formato.ts"` os nomes `ehUuid`, `ehRemarcavel`, `separarAgendamentos` e `rotuloStatus`. Antes de `console.log("agenda.check: OK");`, adicione:

```ts
// --- meus agendamentos -----------------------------------------------------
{
  const agora = Date.parse("2026-10-04T12:00:00Z");
  const mk = (id: string, inicio: string, status: string) => ({ id, inicio, status });
  const itens = [
    mk("f2", "2026-10-10T12:00:00Z", "agendado"),
    mk("f1", "2026-10-05T12:00:00Z", "confirmado"),
    mk("agendado-passado", "2026-10-01T12:00:00Z", "agendado"),
    mk("cancelado-futuro", "2026-10-20T12:00:00Z", "cancelado"),
    ...Array.from({ length: 12 }, (_, i) =>
      mk(`c${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`, "concluido"),
    ),
  ];
  const { futuros, passados } = separarAgendamentos(itens, agora);
  assert.deepEqual(futuros.map((f) => f.id), ["f1", "f2"], "futuros: só agendado/confirmado no futuro, crescente");
  assert.equal(passados.length, 10, "passados limitados a 10");
  assert.equal(passados[0].id, "cancelado-futuro", "cancelado com horário futuro vai pra passados, mais recente primeiro");
  assert.equal(passados[1].id, "agendado-passado", "agendado que já passou vai pra passados");
  assert.equal(passados[2].id, "c11", "passados em ordem decrescente");

  assert.equal(ehRemarcavel(mk("x", "2026-10-05T12:00:00Z", "agendado"), agora), true);
  assert.equal(ehRemarcavel(mk("x", "2026-10-05T12:00:00Z", "confirmado"), agora), true);
  assert.equal(ehRemarcavel(mk("x", "2026-10-05T12:00:00Z", "cancelado"), agora), false, "status final");
  assert.equal(ehRemarcavel(mk("x", "2026-10-03T12:00:00Z", "confirmado"), agora), false, "já passou");

  assert.equal(rotuloStatus("agendado"), "Agendado");
  assert.equal(rotuloStatus("confirmado"), "Confirmado");
  assert.equal(rotuloStatus("concluido"), "Concluído");
  assert.equal(rotuloStatus("cancelado"), "Cancelado");
  assert.equal(rotuloStatus("nao_compareceu"), "Não realizado");

  assert.equal(ehUuid("8f14e45f-ceea-4e7a-8d6b-0b5f0a3c9a11"), true);
  assert.equal(ehUuid("8F14E45F-CEEA-4E7A-8D6B-0B5F0A3C9A11"), true, "maiúsculas");
  assert.equal(ehUuid("nao-e-uuid"), false);
  assert.equal(ehUuid(42), false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter studiold check`
Expected: FAIL. Node acusa os exports ausentes de `formato.ts` (`SyntaxError: The requested module ... does not provide an export named 'ehUuid'`).

- [ ] **Step 3: Write minimal implementation.** Append em `lib/agendar/formato.ts`:

```ts
// --- Meus agendamentos (Spec C) ----------------------------------------------

export type ItemAgendamento = {
  id: string;
  inicio: string; // ISO (slots.data_hora)
  data: string; // YYYY-MM-DD em São Paulo
  hora: string; // HH:MM em São Paulo
  servicos: string[];
  valorTotal: number;
  status: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

// Pode cancelar/remarcar: ainda ativo e ainda não começou.
export function ehRemarcavel(a: { status: string; inicio: string }, agora: number): boolean {
  return (a.status === "agendado" || a.status === "confirmado") && Date.parse(a.inicio) > agora;
}

// Separa pelo horário, não só pelo status: um "agendado" que já passou é
// passado. Futuros em ordem crescente; passados decrescentes, no máximo 10.
export function separarAgendamentos<T extends { status: string; inicio: string }>(
  itens: T[],
  agora: number,
): { futuros: T[]; passados: T[] } {
  const futuros = itens
    .filter((i) => ehRemarcavel(i, agora))
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const passados = itens
    .filter((i) => !ehRemarcavel(i, agora))
    .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))
    .slice(0, 10);
  return { futuros, passados };
}

const ROTULO_STATUS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não realizado",
};

export function rotuloStatus(status: string): string {
  return ROTULO_STATUS[status] ?? status;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter studiold check && pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: `agenda.check: OK`, typecheck e lint sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/lib/agendar/formato.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat(studiold): helpers puros de Meus Agendamentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Leitura server-only dos agendamentos do cliente

**Files:**
- Create: `apps/studiold/lib/agendar/meus.ts`

**Interfaces:**
- Consumes: `ItemAgendamento`, `ehUuid`, `separarAgendamentos`, `partesSaoPaulo` (Task 1 / `formato.ts`); `tenantDb` de `@/lib/supabase/server`.
- Produces:
  - `export type AgendamentoDoCliente = { id: string; status: string; inicio: string; data: string; hora: string; servicoIds: string[] }`
  - `export async function carregarMeusAgendamentos(clienteId: string): Promise<{ futuros: ItemAgendamento[]; passados: ItemAgendamento[] } | null>` (`null` = erro de DB, já logado)
  - `export async function lerAgendamentoDoCliente(clienteId: string, id: string): Promise<AgendamentoDoCliente | null>` (`null` = id inválido, de outro cliente, inexistente ou erro)
  - `export async function nomeDoCliente(clienteId: string): Promise<string | null>`

- [ ] **Step 1: Create `lib/agendar/meus.ts`**

```ts
// Leitura dos agendamentos do cliente da sessão de /agendar (Spec C).
// Só servidor (service-role). Todo filtro é por cliente_id vindo do cookie
// assinado — nunca por id que a UI mandou sem esse filtro junto.
import "server-only";
import { tenantDb } from "@/lib/supabase/server";
import {
  ehUuid,
  partesSaoPaulo,
  separarAgendamentos,
  type ItemAgendamento,
} from "./formato.ts";

export type AgendamentoDoCliente = {
  id: string;
  status: string;
  inicio: string;
  data: string;
  hora: string;
  servicoIds: string[];
};

type Linha = {
  id: string;
  status: string;
  valor_total: number | string | null;
  slots: { data_hora: string } | { data_hora: string }[];
  agendamento_servicos:
    | { ordem: number; servico_id: string; servicos: { nome: string } | { nome: string }[] | null }[]
    | null;
};

const SELECT =
  "id, status, valor_total, slots!inner(data_hora), agendamento_servicos(ordem, servico_id, servicos(nome))";

function um<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function itensOrdenados(l: Linha) {
  return [...(l.agendamento_servicos ?? [])].sort((a, b) => a.ordem - b.ordem);
}

function paraItem(l: Linha): ItemAgendamento {
  const inicio = um(l.slots)?.data_hora ?? "";
  const { data, hora } = partesSaoPaulo(inicio);
  const itens = itensOrdenados(l);
  return {
    id: l.id,
    inicio,
    data,
    hora,
    status: l.status,
    valorTotal: Number(l.valor_total ?? 0),
    // ponytail: agendamento sem linhas em agendamento_servicos (ex.: criado fora das RPCs v2) mostra "Serviço"; join no servico_id principal se aparecer na prática.
    servicos: itens.length ? itens.map((i) => um(i.servicos)?.nome ?? "Serviço") : ["Serviço"],
  };
}

// ponytail: últimos 50 por criado_em (PostgREST não ordena o pai por coluna
// embutida); cliente com mais que isso perde os mais antigos, que já ficariam
// fora dos 10 anteriores exibidos.
export async function carregarMeusAgendamentos(
  clienteId: string,
): Promise<{ futuros: ItemAgendamento[]; passados: ItemAgendamento[] } | null> {
  const r = await tenantDb()
    .from("agendamentos")
    .select(SELECT)
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (r.error) {
    console.error("[agendar/meus/lista]", r.error.message);
    return null;
  }
  return separarAgendamentos(((r.data ?? []) as Linha[]).map(paraItem), Date.now());
}

export async function lerAgendamentoDoCliente(
  clienteId: string,
  id: string,
): Promise<AgendamentoDoCliente | null> {
  if (!ehUuid(id)) return null;
  const r = await tenantDb()
    .from("agendamentos")
    .select(SELECT)
    .eq("id", id)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (r.error) {
    console.error("[agendar/meus/um]", r.error.message);
    return null;
  }
  if (!r.data) return null;
  const l = r.data as Linha;
  const item = paraItem(l);
  return {
    id: item.id,
    status: item.status,
    inicio: item.inicio,
    data: item.data,
    hora: item.hora,
    servicoIds: itensOrdenados(l).map((i) => i.servico_id),
  };
}

export async function nomeDoCliente(clienteId: string): Promise<string | null> {
  const r = await tenantDb()
    .from("clientes")
    .select("nome")
    .eq("id", clienteId)
    .eq("ativo", true)
    .maybeSingle();
  if (r.error) {
    console.error("[agendar/meus/nome]", r.error.message);
    return null;
  }
  return (r.data as { nome: string } | null)?.nome ?? null;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros (o módulo ainda não é usado; tudo bem).

- [ ] **Step 3: Commit**

```bash
git add apps/studiold/lib/agendar/meus.ts
git commit -m "feat(studiold): leitura server-only dos agendamentos do cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Actions — cancelar e remarcar

**Files:**
- Modify: `apps/studiold/app/agendar/actions.ts`

**Interfaces:**
- Consumes: `lerAgendamentoDoCliente`, `AgendamentoDoCliente` (Task 2); `ehUuid`, `ehRemarcavel` (Task 1).
- Produces:
  - `FalhaAgendar.motivo` passa a ser `"horario" | "cortesia" | "estilo" | "remarcar"`.
  - `ResumoAgendamento` ganha `remarcado: boolean` e `antigoNaoCancelado: boolean`.
  - `confirmarAgendamento(p: { servicoIds: string[]; inicio: string; cortesiaId: string | null; estiloId: string | null; remarcarId?: string | null })`
  - `export async function cancelarAgendamento(id: string): Promise<{ ok: true } | FalhaAgendar>`

- [ ] **Step 1: Imports and types.** No topo de `app/agendar/actions.ts`:
  - acrescente `ehUuid, ehRemarcavel` ao import de `@/lib/agendar/formato`;
  - adicione `import { lerAgendamentoDoCliente, type AgendamentoDoCliente } from "@/lib/agendar/meus";`.

  No bloco de tipos da Spec B:
  - troque `motivo?: "horario" | "cortesia" | "estilo";` por `motivo?: "horario" | "cortesia" | "estilo" | "remarcar";`;
  - em `ResumoAgendamento`, depois de `emailMascarado: string | null;`, adicione:

```ts
  remarcado: boolean;
  antigoNaoCancelado: boolean; // novo criado, mas o antigo não foi liberado
```

- [ ] **Step 2: Reuse `ehUuid`.** Apague a constante `const UUID = /^[0-9a-f]{8}-.../i;` de `actions.ts`. Em `servicoIdsValidos` troque `typeof x === "string" && UUID.test(x)` por `ehUuid(x)`; em `idOpcionalValido` troque `(typeof id === "string" && UUID.test(id))` por `ehUuid(id)`. Depois disso, `grep -n "UUID" apps/studiold/app/agendar/actions.ts` não pode retornar nada.

- [ ] **Step 3: Add the `NAO_ENCONTRADO` constant**, logo abaixo de `SEM_SESSAO`:

```ts
// Mesma resposta para id de outro cliente, inexistente ou malformado — não
// revela quais ids existem.
const NAO_ENCONTRADO: FalhaAgendar = { ok: false, error: "Agendamento não encontrado." };
```

- [ ] **Step 4: Change `confirmarAgendamento`.**

  (a) Assinatura:

```ts
export async function confirmarAgendamento(p: {
  servicoIds: string[];
  inicio: string;
  cortesiaId: string | null;
  estiloId: string | null;
  remarcarId?: string | null;
}): Promise<{ ok: true; resumo: ResumoAgendamento } | FalhaAgendar> {
```

  (b) Logo após a linha `const db = tenantDb();`, insira:

```ts
  // Remarcar: confere dono e status ANTES de criar qualquer coisa
  // (fn_cancelar_agendamento_v2 não confere o dono).
  let remarcar: AgendamentoDoCliente | null = null;
  if (p.remarcarId) {
    remarcar = await lerAgendamentoDoCliente(sessao.clienteId, p.remarcarId);
    if (!remarcar || !ehRemarcavel(remarcar, Date.now())) {
      return {
        ok: false,
        motivo: "remarcar",
        error: "Esse agendamento não pode mais ser remarcado. Confirme de novo pra criar um novo horário.",
      };
    }
  }
```

  (c) Troque a consulta do teto:

```ts
  const futuros = await db
    .from("agendamentos")
    .select("id, slots!inner(data_hora)", { count: "exact", head: true })
    .eq("cliente_id", sessao.clienteId)
    .eq("origem", "site")
    .in("status", ["agendado", "confirmado"])
    .gt("slots.data_hora", new Date().toISOString());
```

  por (o agendamento sendo remarcado não conta no teto):

```ts
  let consultaTeto = db
    .from("agendamentos")
    .select("id, slots!inner(data_hora)", { count: "exact", head: true })
    .eq("cliente_id", sessao.clienteId)
    .eq("origem", "site")
    .in("status", ["agendado", "confirmado"])
    .gt("slots.data_hora", new Date().toISOString());
  if (remarcar) consultaTeto = consultaTeto.neq("id", remarcar.id);
  const futuros = await consultaTeto;
```

  (d) Troque as duas linhas

```ts
  // Agendamento criado: a partir daqui nada desfaz ele. Apaga o cookie no browser (o token é stateless e vale até exp; o teto MAX_AGENDAMENTOS_SITE_FUTUROS limita replay).
  await apagarSessao();
```

  por:

```ts
  // Agendamento criado: a partir daqui nada desfaz ele. A sessão continua
  // valendo até exp (Spec C: "Ver meus agendamentos" e remarcar sem novo
  // código); o teto MAX_AGENDAMENTOS_SITE_FUTUROS limita replay.

  // Remarcar: só agora, com o novo garantido, libera o antigo. Se falhar, o
  // novo vale e o cliente é avisado para cancelar o antigo em Meus agendamentos.
  let antigoNaoCancelado = false;
  if (remarcar) {
    const canc = await db.rpc("fn_cancelar_agendamento_v2", {
      p_agendamento_id: remarcar.id,
      p_motivo: "remarcado",
      p_descricao: null,
      p_origem: "site",
    });
    if (canc.error) {
      antigoNaoCancelado = true;
      console.error("[agendar/confirmarAgendamento/remarcar]", canc.error.message);
    }
  }
```

  (e) No e-mail, troque `subject: \`Agendado: ${rotuloDia(data)} às ${hora} — StudiOLD\`,` por

```ts
      subject: `${remarcar ? "Remarcado" : "Agendado"}: ${rotuloDia(data)} às ${hora} — StudiOLD`,
```

  e a primeira linha do `html` por

```ts
        `<p>Olá, ${escaparHtml(c.nome)}! Seu horário na StudiOLD ${remarcar ? "foi remarcado" : "está marcado"}.</p>` +
```

  (f) Troque o `return` final por:

```ts
  return { ok: true, resumo: { ...resumoBase, emailMascarado, remarcado: !!remarcar, antigoNaoCancelado } };
```

- [ ] **Step 5: Append `cancelarAgendamento`** no fim do arquivo:

```ts
export async function cancelarAgendamento(id: string): Promise<{ ok: true } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;

  // fn_cancelar_agendamento_v2 cancela qualquer id: o dono é conferido aqui.
  const ag = await lerAgendamentoDoCliente(sessao.clienteId, id);
  if (!ag) return NAO_ENCONTRADO;
  if (!ehRemarcavel(ag, Date.now())) {
    return { ok: false, error: "Esse agendamento já não pode ser cancelado." };
  }

  const rpc = await tenantDb().rpc("fn_cancelar_agendamento_v2", {
    p_agendamento_id: ag.id,
    p_motivo: "cliente",
    p_descricao: null,
    p_origem: "site",
  });
  if (rpc.error) {
    // Corrida entre abas: outro pedido já cancelou/concluiu.
    if (rpc.error.message.includes("não pode ser cancelado")) {
      console.error("[agendar/cancelarAgendamento]", rpc.error.message);
      return { ok: false, error: "Esse agendamento já não pode ser cancelado." };
    }
    return erroInterno("cancelarAgendamento", rpc.error.message);
  }
  return { ok: true };
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros.

Note: `EtapaSucesso` e `AgendarWizard` ainda compilam, porque os campos novos de `ResumoAgendamento` só são lidos na Task 5. Se o typecheck acusar construção de `ResumoAgendamento` em outro lugar, reporte NEEDS_CONTEXT.

Run: `grep -n "apagarSessao()" apps/studiold/app/agendar/actions.ts`
Expected: 1 linha só (dentro de `encerrarSessao`).

Run: `grep -n "lerAgendamentoDoCliente" apps/studiold/app/agendar/actions.ts`
Expected: 2 chamadas (em `confirmarAgendamento` e `cancelarAgendamento`), mais o import.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/app/agendar/actions.ts
git commit -m "feat(studiold): cancelar e remarcar em /agendar (dono conferido, novo antes do antigo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Página Meus Agendamentos

**Files:**
- Modify: `apps/studiold/app/agendar/agendar.module.css` (append)
- Create: `apps/studiold/app/agendar/meus-agendamentos/page.tsx`
- Create: `apps/studiold/app/agendar/meus-agendamentos/MeusAgendamentos.tsx`
- Create: `apps/studiold/app/agendar/meus-agendamentos/CartaoAgendamento.tsx`

**Interfaces:**
- Consumes:
  - `lerSessao`, `segredoConfigurado` de `@/lib/agendar/sessao`;
  - `carregarMeusAgendamentos`, `nomeDoCliente` (Task 2);
  - `ItemAgendamento`, `rotuloDia`, `rotuloStatus` (formato);
  - `cancelarAgendamento`, `FalhaAgendar` (Task 3);
  - `AgendarCabecalho({ etapa, onVoltar? })`;
  - `fmtPreco` de `@/lib/agenda/time`.
- Produces: classes CSS usadas também na Task 5: `faixaRemarcando`, `antes`, `linkDiscreto`, `servicosTopo`.

- [ ] **Step 1: Append to `app/agendar/agendar.module.css`**

```css
/* ---- Meus agendamentos (Spec C) ------------------------------------------ */
.secao {
  margin-top: 1.75rem;
}
.cartoes {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cartaoTopo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}
/* selo de status: aço = agendado, sálvia = confirmado (contraste AA sobre --enamel-hi) */
.selo {
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  padding-top: 0.35rem;
  color: var(--steel);
}
.selo[data-status="confirmado"] {
  color: var(--sage);
}
.acoes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.confirmaCancelar {
  margin-top: 0.9rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--chrome-dark);
}
.confirmaCancelar .acoes {
  margin-top: 0.6rem;
}
.anterior {
  padding: 0.65rem 0.85rem;
}
.anterior + .anterior {
  border-top: 1px solid var(--chrome);
}
.anteriorTopo {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-variant-numeric: tabular-nums;
}
.statusTexto {
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-2);
}
.statusTexto[data-status="concluido"] {
  color: var(--ink);
}

/* ---- remarcar no wizard --------------------------------------------------- */
.faixaRemarcando {
  background: var(--enamel-lo);
  border-left: 3px solid var(--ochre);
  border-radius: var(--r);
  padding: 0.6rem 0.75rem;
  margin-bottom: 1rem;
}
.antes {
  color: var(--ink-2);
  font-size: 0.85rem;
  margin: -0.4rem 0 0.6rem;
}
.servicosTopo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.linkDiscreto {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  white-space: nowrap;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

- [ ] **Step 2: Create `app/agendar/meus-agendamentos/page.tsx`**

```tsx
// Rota pública /agendar/meus-agendamentos (Spec C). Sem requireUser() —
// identidade só pelo cookie agendar_sessao (ver app/agendar/actions.ts).
import { redirect } from "next/navigation";
import { lerSessao, segredoConfigurado } from "@/lib/agendar/sessao";
import { carregarMeusAgendamentos, nomeDoCliente } from "@/lib/agendar/meus";
import { MeusAgendamentos } from "./MeusAgendamentos";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus agendamentos — StudiOLD" };

const ENTRAR = "/agendar?destino=meus-agendamentos";

export default async function MeusAgendamentosPage() {
  const sessao = segredoConfigurado() ? await lerSessao() : null;
  if (!sessao) redirect(ENTRAR);

  const [nome, lista] = await Promise.all([
    nomeDoCliente(sessao.clienteId),
    carregarMeusAgendamentos(sessao.clienteId),
  ]);
  if (!nome) redirect(ENTRAR); // cliente desativado depois da verificação

  return (
    <div className={styles.shell}>
      <MeusAgendamentos nome={nome} lista={lista} />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/agendar/meus-agendamentos/CartaoAgendamento.tsx`**

```tsx
"use client";

// Cartão de um agendamento futuro: Remarcar (link pro wizard) e Cancelar com
// confirmação inline — sem modal, sem confirm() do navegador.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rotuloDia, rotuloStatus, type ItemAgendamento } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import { cancelarAgendamento, type FalhaAgendar } from "../actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "../agendar.module.css";

const FALHA_CONEXAO: FalhaAgendar = { ok: false, error: "Falha de conexão. Tente de novo." };

export function CartaoAgendamento({ agendamento: a }: { agendamento: ItemAgendamento }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const manterRef = useRef<HTMLButtonElement>(null);

  // Foco na escolha segura ao abrir a confirmação.
  useEffect(() => {
    if (confirmando) manterRef.current?.focus();
  }, [confirmando]);

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const r = await cancelarAgendamento(a.id).catch(() => FALHA_CONEXAO);
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.sessaoExpirada) {
        router.push("/agendar?destino=meus-agendamentos");
        return;
      }
      setConfirmando(false);
      setErro(r.error);
    });
  }

  const quando = `${rotuloDia(a.data)} às ${a.hora}`;

  return (
    <article className={css.comanda} aria-label={quando}>
      <div className={css.cartaoTopo}>
        <p className={css.comandaDestaque}>{quando}</p>
        <span className={css.selo} data-status={a.status}>
          {rotuloStatus(a.status)}
        </span>
      </div>
      {a.servicos.map((s, i) => (
        <div key={`${s}-${i}`} className={css.comandaLinha}>
          <span>{s}</span>
        </div>
      ))}
      <div className={css.comandaTotal}>
        <span>Total</span>
        <span>{fmtPreco(a.valorTotal)}</span>
      </div>

      {erro && (
        <p role="alert" className={`${styles.msgQuiet} mt-3`} data-tom="erro">
          {erro}
        </p>
      )}

      {confirmando ? (
        <div
          className={css.confirmaCancelar}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pendente) setConfirmando(false);
          }}
        >
          <p className={styles.msgQuiet}>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className={css.acoes}>
            <button
              ref={manterRef}
              type="button"
              className={`${styles.btn} ${css.cta}`}
              disabled={pendente}
              onClick={() => setConfirmando(false)}
            >
              Manter
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]} ${css.cta}`}
              disabled={pendente}
              onClick={cancelar}
            >
              {pendente ? "Cancelando…" : "Sim, cancelar"}
            </button>
          </div>
        </div>
      ) : (
        <div className={css.acoes}>
          <Link href={`/agendar?remarcar=${a.id}`} className={`${styles.btn} ${css.cta}`}>
            Remarcar
          </Link>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--danger"]} ${css.cta}`}
            onClick={() => setConfirmando(true)}
          >
            Cancelar
          </button>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Create `app/agendar/meus-agendamentos/MeusAgendamentos.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { rotuloDia, rotuloStatus, type ItemAgendamento } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import { AgendarCabecalho } from "../AgendarCabecalho";
import { CartaoAgendamento } from "./CartaoAgendamento";
import styles from "@/app/agenda/agenda.module.css";
import css from "../agendar.module.css";

type Props = {
  nome: string;
  lista: { futuros: ItemAgendamento[]; passados: ItemAgendamento[] } | null; // null = falha ao carregar
};

export function MeusAgendamentos({ nome, lista }: Props) {
  const router = useRouter();

  return (
    <>
      <AgendarCabecalho etapa="Meus agendamentos" onVoltar={() => router.push("/agendar")} />
      <main className={css.corpo}>
        <h1 className={styles.pageTitle}>Olá, {nome}!</h1>
        <Link
          href="/agendar"
          className={`${styles.btn} ${styles["btn--primary"]} ${css.cta} mt-4 w-full`}
        >
          Novo agendamento
        </Link>

        {lista === null ? (
          <div className="mt-6">
            <p role="alert" className={styles.msgQuiet} data-tom="erro">
              Não foi possível carregar seus agendamentos.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${css.cta} mt-3 w-full`}
              onClick={() => router.refresh()}
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            <section className={css.secao} aria-labelledby="proximos-titulo">
              <h2 id="proximos-titulo" className={css.grupoTitulo}>
                Próximos
              </h2>
              {lista.futuros.length === 0 ? (
                <p className={styles.msgQuiet}>Nenhum horário marcado.</p>
              ) : (
                <div className={css.cartoes}>
                  {lista.futuros.map((a) => (
                    <CartaoAgendamento key={a.id} agendamento={a} />
                  ))}
                </div>
              )}
            </section>

            {lista.passados.length > 0 && (
              <section className={css.secao} aria-labelledby="anteriores-titulo">
                <h2 id="anteriores-titulo" className={css.grupoTitulo}>
                  Anteriores
                </h2>
                <ul className={css.lista}>
                  {lista.passados.map((a) => (
                    <li key={a.id} className={css.anterior}>
                      <div className={css.anteriorTopo}>
                        <span>
                          {rotuloDia(a.data)} · {a.hora}
                        </span>
                        <span className={css.statusTexto} data-status={a.status}>
                          {rotuloStatus(a.status)}
                        </span>
                      </div>
                      <p className={css.linhaMeta}>
                        {a.servicos.join(", ")} · {fmtPreco(a.valorTotal)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check && pnpm --filter studiold build`
Expected: sem erros; o build lista `/agendar/meus-agendamentos` (dinâmica, `ƒ`).

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/app/agendar/agendar.module.css apps/studiold/app/agendar/meus-agendamentos
git commit -m "feat(studiold): página Meus agendamentos com cancelar inline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wizard — entrar com sessão, remarcar, sucesso

**Files:**
- Modify: `apps/studiold/app/agendar/page.tsx` (substituir)
- Modify: `apps/studiold/app/agendar/AgendarWizard.tsx`
- Modify: `apps/studiold/app/agendar/EtapaServicos.tsx`
- Modify: `apps/studiold/app/agendar/EtapaConfirmacao.tsx`
- Modify: `apps/studiold/app/agendar/EtapaSucesso.tsx`

**Interfaces:**
- Consumes:
  - `lerAgendamentoDoCliente`, `nomeDoCliente` (Task 2);
  - `ehRemarcavel`, `rotuloDia` (formato);
  - `confirmarAgendamento({... remarcarId})`, `ResumoAgendamento.remarcado/antigoNaoCancelado`, `FalhaAgendar.motivo "remarcar"` (Task 3);
  - classes `faixaRemarcando`, `antes`, `linkDiscreto`, `servicosTopo` (Task 4).
- Produces:
  - `export type InicialWizard = { nome: string; servicoIds: string[]; remarcar: { id: string; data: string; hora: string } | null; aviso: string | null }`
  - `AgendarWizard({ inicial, destino }: { inicial: InicialWizard | null; destino: "meus-agendamentos" | null })`

- [ ] **Step 1: Replace `app/agendar/page.tsx`**

```tsx
// Rota pública /agendar. Sem requireUser() — ver comentário no topo de
// ./actions.ts (intencional, não esquecido). Com sessão válida (cookie
// agendar_sessao) o wizard abre direto em Serviços; ?remarcar=<id> pré-marca
// os serviços do agendamento (dono e status conferidos aqui, no servidor);
// ?destino=meus-agendamentos manda a identificação de volta pra lá.
import { lerSessao, segredoConfigurado } from "@/lib/agendar/sessao";
import { lerAgendamentoDoCliente, nomeDoCliente } from "@/lib/agendar/meus";
import { ehRemarcavel } from "@/lib/agendar/formato";
import { AgendarWizard, type InicialWizard } from "./AgendarWizard";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agendar — StudiOLD" };

type Busca = { remarcar?: string | string[]; destino?: string | string[] };

export default async function AgendarPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const destino = busca.destino === "meus-agendamentos" ? "meus-agendamentos" : null;
  const remarcarId = typeof busca.remarcar === "string" ? busca.remarcar : null;

  const sessao = segredoConfigurado() ? await lerSessao() : null;
  let inicial: InicialWizard | null = null;
  if (sessao) {
    const nome = await nomeDoCliente(sessao.clienteId);
    if (nome) {
      inicial = { nome, servicoIds: [], remarcar: null, aviso: null };
      if (remarcarId) {
        // id de outro cliente / inexistente / malformado → null → ignorado em silêncio
        const ag = await lerAgendamentoDoCliente(sessao.clienteId, remarcarId);
        if (ag && ehRemarcavel(ag, Date.now())) {
          inicial = { ...inicial, servicoIds: ag.servicoIds, remarcar: { id: ag.id, data: ag.data, hora: ag.hora } };
        } else if (ag) {
          inicial = { ...inicial, aviso: "Esse agendamento não pode mais ser remarcado. Escolha um novo horário." };
        }
      }
    }
  }

  return (
    <div className={styles.shell}>
      <AgendarWizard inicial={inicial} destino={destino} />
    </div>
  );
}
```

- [ ] **Step 2: Change `app/agendar/AgendarWizard.tsx`.**

  (a) Atualize o comentário do topo para:

```ts
// Wizard de /agendar: identificação (Spec A) → serviços → data e hora →
// confirmação → sucesso. Com sessão válida (lida no servidor por page.tsx) o
// wizard começa em Serviços; `inicial.remarcar` liga o modo remarcar (Spec C):
// o antigo só é cancelado no servidor depois de o novo ser criado.
```

  (b) Imports: troque `import { proximoDia } from "@/lib/agendar/formato";` por `import { proximoDia, rotuloDia } from "@/lib/agendar/formato";` e adicione `import { useRouter } from "next/navigation";`.

  (c) Antes de `export function AgendarWizard`, adicione:

```ts
export type InicialWizard = {
  nome: string;
  servicoIds: string[];
  remarcar: { id: string; data: string; hora: string } | null;
  aviso: string | null;
};
```

  (d) Troque a assinatura e o estado inicial:

```ts
export function AgendarWizard({
  inicial,
  destino,
}: {
  inicial: InicialWizard | null;
  destino: "meus-agendamentos" | null;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>(inicial ? "servicos" : "identificacao");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>(inicial?.servicoIds ?? []);
  const [remarcar, setRemarcar] = useState<InicialWizard["remarcar"]>(inicial?.remarcar ?? null);
```

  Os demais `useState` continuam como estão, exceto `aviso`: troque `useState<string | null>(null)` por `useState<string | null>(inicial?.aviso ?? null)`.

  (e) Divida `abrirServicos`. Substitua a função inteira por:

```ts
  // Carrega o catálogo (sem mexer na seleção). Usado ao entrar com sessão e
  // por abrirServicos.
  function carregarServicos() {
    iniciar(async () => {
      const r = await carregarCatalogo().catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) setAviso(r.error);
        return;
      }
      setCatalogo(r.catalogo);
      setCortesiaId(r.catalogo.cortesiaFavoritaId);
      setEstiloId(r.catalogo.estiloFavoritoId);
    });
  }

  // Vai pra Serviços e (re)carrega o catálogo. Também é o caminho de volta
  // quando a busca de horários falha (serviço desativado no meio do fluxo).
  function abrirServicos(mensagem: string | null) {
    setAviso(mensagem);
    setCatalogo(null);
    setSelecionados([]);
    setPasso("servicos");
    carregarServicos();
  }

  // Entrou com sessão (page.tsx): carrega o catálogo uma vez, mantendo a
  // pré-seleção do remarcar. setState só dentro da transição assíncrona.
  const carregouInicial = useRef(false);
  useEffect(() => {
    if (!inicial || carregouInicial.current) return;
    carregouInicial.current = true;
    carregarServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só na montagem
  }, []);
```

  Se o lint reclamar de outra regra nesse efeito, ajuste o mínimo, sem mudar o comportamento, e explique no relatório.

  (f) Em `recomecar`, adicione `setRemarcar(null);` depois de `setResumo(null);`.

  (g) Troque `identificado` por:

```ts
  function identificado(dados: { nome: string }) {
    if (destino === "meus-agendamentos") {
      router.push("/agendar/meus-agendamentos");
      return;
    }
    setNome(dados.nome);
    abrirServicos(null);
  }
```

  (h) Em `confirmar`, troque a chamada por:

```ts
      const r = await confirmarAgendamento({
        servicoIds: selecionados,
        inicio: horario.inicio,
        cortesiaId,
        estiloId,
        remarcarId: remarcar?.id ?? null,
      }).catch(() => FALHA_CONEXAO);
```

  e, logo após `if (tratarSessao(r)) return;`, adicione:

```ts
      if (r.motivo === "remarcar") setRemarcar(null); // vira agendamento novo; cliente confirma de novo
```

  (i) Adicione esta função depois de `confirmar`:

```ts
  function novoAgendamento() {
    setRemarcar(null);
    setResumo(null);
    setHorario(null);
    abrirServicos(null);
  }
```

  (j) No JSX:
  - **Identificação:** troque o par h1/p por:

```tsx
            <h1 tabIndex={-1} className={`${styles.pageTitle} mb-1`}>
              {destino ? "Meus agendamentos" : "Agendar horário"}
            </h1>
            <p className={`${styles.msgQuiet} mb-6`}>
              {destino ? "Confirme seu telefone para ver seus agendamentos." : "Confirme seu telefone pra começar."}
            </p>
```

  - **Faixa Remarcando:** logo depois de `<main ref={mainRef} className={css.corpo}>`, adicione:

```tsx
        {remarcar && (passo === "servicos" || passo === "horario" || passo === "confirmacao") && (
          <p className={`${css.faixaRemarcando} ${styles.msgQuiet}`}>
            Remarcando {rotuloDia(remarcar.data)} às {remarcar.hora}. Seu horário atual só é liberado quando você
            confirmar o novo.
          </p>
        )}
```

  - **`<EtapaConfirmacao ...>`:** adicione a prop `antes={remarcar ? { data: remarcar.data, hora: remarcar.hora } : null}`.
  - **`<EtapaSucesso ...>`:** troque `onNovo={() => recomecar(null)}` por `onNovo={novoAgendamento}`.
  - **Rótulo da faixa no sucesso:** troque `<AgendarCabecalho etapa={ROTULO[passo]} ...` por `<AgendarCabecalho etapa={passo === "sucesso" && resumo?.remarcado ? "Remarcado" : ROTULO[passo]} ...` (o resto igual).

- [ ] **Step 3: Change `app/agendar/EtapaServicos.tsx`.** Adicione `import Link from "next/link";` e troque

```tsx
      <h1 tabIndex={-1} className={styles.pageTitle}>Olá, {nome}!</h1>
```

  por

```tsx
      <div className={css.servicosTopo}>
        <h1 tabIndex={-1} className={styles.pageTitle}>Olá, {nome}!</h1>
        <Link href="/agendar/meus-agendamentos" className={`${styles.msgQuiet} ${css.linkDiscreto}`}>
          Meus agendamentos
        </Link>
      </div>
```

- [ ] **Step 4: Change `app/agendar/EtapaConfirmacao.tsx`.**
  - Em `type Props`, adicione `antes: { data: string; hora: string } | null;`.
  - Troque o bloco do destaque

```tsx
        <p className={css.comandaDestaque}>
          {rotuloDia(p.horario.data)} às {p.horario.hora}
        </p>
```

  por

```tsx
        <p className={css.comandaDestaque}>
          {p.antes ? "Novo horário: " : ""}
          {rotuloDia(p.horario.data)} às {p.horario.hora}
        </p>
        {p.antes && (
          <p className={css.antes}>
            Antes:{" "}
            <s>
              {rotuloDia(p.antes.data)} às {p.antes.hora}
            </s>
          </p>
        )}
```

  - Troque o rótulo do botão `{p.pendente ? "Confirmando…" : "Confirmar agendamento"}` por `{p.pendente ? "Confirmando…" : p.antes ? "Confirmar novo horário" : "Confirmar agendamento"}`.

- [ ] **Step 5: Replace `app/agendar/EtapaSucesso.tsx`**

```tsx
"use client";

import Link from "next/link";
import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { ResumoAgendamento } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

export function EtapaSucesso({ resumo, onNovo }: { resumo: ResumoAgendamento; onNovo: () => void }) {
  return (
    <>
      <h1 tabIndex={-1} className={`${styles.pageTitle} mb-4`}>
        {resumo.remarcado ? "Remarcado!" : "Agendado!"}
      </h1>
      <div className={css.comanda}>
        <p className={css.comandaDestaque}>
          {rotuloDia(resumo.data)} às {resumo.hora}
        </p>
        {resumo.servicos.map((nome, i) => (
          <div key={`${nome}-${i}`} className={css.comandaLinha}>
            <span>{nome}</span>
          </div>
        ))}
        <div className={css.comandaTotal}>
          <span>Total · {resumo.duracaoMin} min</span>
          <span>{fmtPreco(resumo.valorTotal)}</span>
        </div>
      </div>
      {resumo.antigoNaoCancelado && (
        <p role="alert" className={`${styles.msgQuiet} mt-3`} data-tom="erro">
          Não conseguimos liberar seu horário anterior. Cancele em Meus agendamentos.
        </p>
      )}
      {resumo.emailMascarado && (
        <p className={`${styles.msgQuiet} mt-3`}>Enviamos a confirmação para {resumo.emailMascarado}.</p>
      )}
      <Link
        href="/agendar/meus-agendamentos"
        className={`${styles.btn} ${styles["btn--primary"]} mt-6 w-full ${css.cta}`}
      >
        Ver meus agendamentos
      </Link>
      <button type="button" className={`${styles.btn} mt-3 w-full ${css.cta}`} onClick={onNovo}>
        Fazer outro agendamento
      </button>
    </>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check && pnpm --filter studiold build`
Expected: sem erros; `/agendar` agora é dinâmica (`ƒ`) e `/agendar/meus-agendamentos` aparece na lista de rotas.

Run: `grep -n "py-3" apps/studiold/app/agendar/*.tsx apps/studiold/app/agendar/meus-agendamentos/*.tsx`
Expected: nenhuma saída.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/app/agendar/page.tsx apps/studiold/app/agendar/AgendarWizard.tsx apps/studiold/app/agendar/EtapaServicos.tsx apps/studiold/app/agendar/EtapaConfirmacao.tsx apps/studiold/app/agendar/EtapaSucesso.tsx
git commit -m "feat(studiold): remarcar pelo wizard e entrada direta com sessão em /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gate final, integração manual e memória

**Files:**
- Modify: `MEMORY.md` (raiz) — seção "Onde parei"

- [ ] **Step 1: Gate completo**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check && pnpm --filter studiold build`
Expected: tudo verde, `agenda.check: OK`.

- [ ] **Step 2: Integração manual (com o usuário, em produção ou `pnpm --filter studiold dev`)**

Pedir ao usuário, que é quem tem browser e e-mail:
1. Identificar-se e agendar um horário. O sucesso mostra "Ver meus agendamentos", e o link abre a lista sem pedir código.
2. Na lista: o cartão aparece em Próximos, com selo e total. "Cancelar" pede confirmação; "Manter" volta; "Sim, cancelar" move o item para Anteriores como "Cancelado".
3. Agendar de novo e usar "Remarcar". O wizard abre em Serviços com os serviços marcados e a faixa "Remarcando…". Escolher outro horário e confirmar mostra "Remarcado!".
4. Conferir no banco (somente leitura, via MCP):

```sql
select a.id, a.status, a.origem, a.motivo_cancelamento, s.data_hora
from barbearia_001.agendamentos a join barbearia_001.slots s on s.id = a.slot_id
where a.origem = 'site' order by a.criado_em desc limit 4;
```

Esperado: o mais recente `agendado`; o anterior `cancelado` com `motivo_cancelamento = 'remarcado'`.

5. Abandonar uma remarcação no meio, sem confirmar. O agendamento original continua `agendado`.
6. Segurança: chamar `cancelarAgendamento` com o id de um agendamento de outro cliente deve responder "Agendamento não encontrado." e não mudar nada. Se não houver como testar pelo browser, registrar como pendente.

Limpeza: cancelar os agendamentos de teste pela própria página (nunca DELETE por ferramenta).

- [ ] **Step 3: Atualizar `MEMORY.md`.** No topo de "## Onde parei", acrescente um parágrafo no formato dos existentes. Ele deve cobrir:
  - o que foi entregue (Spec C, commits);
  - que a sessão agora sobrevive à confirmação;
  - remarcar como "novo antes do antigo";
  - a checagem de dono antes de `fn_cancelar_agendamento_v2`;
  - as pendências: aceitação a 375px, item 6 da integração se não testado, e o caso de remarcar para um horário que sobrepõe o antigo, que a validação de disponibilidade bloqueia.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs: memória de Meus Agendamentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
