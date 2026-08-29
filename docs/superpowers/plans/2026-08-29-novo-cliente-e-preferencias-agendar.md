# Novo cliente manual + preferências no AgendarDrawer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar cliente à mão em `/clientes` (botão + drawer) e mostrar as preferências de um cliente já cadastrado dentro do drawer de Walk-in / Novo agendamento.

**Architecture:** Duas peças bounded sobre código existente. Peça 1: uma Server Action `criarCliente` (valida, checa duplicado por telefone, insere, `revalidatePath`) + um `NovoClienteDrawer` client component, ligados no `ListaClientes` já existente — no sucesso, abre o `PerfilClienteDrawer` do novo id. Peça 2: uma Server Action leve `getPreferenciasCliente` (client row + tabelas `cortesias`/`estilos_musica` num `Promise.all`, resolve nomes em JS — mesmo padrão de `getPerfilCliente`) chamada no `onChange` do select de cliente do `AgendarDrawer`; mostra bloco read-only e pré-seleciona o chip da cortesia favorita se estiver disponível.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions, `force-dynamic`), React 19, Supabase service-role client (`tenantDb()`, schema `barbearia_001`), CSS Modules de `@/app/agenda/agenda.module.css`, teste de lógica pura via `lib/agenda/agenda.check.ts` (`node --experimental-strip-types`, `pnpm --filter studiold check`).

**Spec:** nenhum arquivo separado (bounded; design aprovado no chat). Resumo do design:
- **Peça 1:** botão "Novo cliente" no topo de `/clientes` → `NovoClienteDrawer` com `nome` (obrigatório), `telefone` (livre, normalizado no servidor para `+55DDDNÚMERO`), `genero` (`<select>` masculino/feminino/nao_informado). `criarCliente(fd)` valida, pré-checa `UNIQUE(telefone)`. No sucesso a lista revalida e o `PerfilClienteDrawer` do novo id abre por cima. Telefone duplicado → mensagem + abre o perfil do cliente existente (a action devolve `clienteExistenteId`).
- **Peça 2:** ao escolher um cliente cadastrado no select do `AgendarDrawer`, busca `cortesia_favorita_id` / `estilo_musica_id` / `observacoes_fixas`; mostra bloco read-only abaixo do select; se a cortesia favorita estiver ativa e com estoque, marca o chip dela (barbeiro pode desmarcar).
- **Fora de escopo:** sem migration (colunas já existem); sem tocar `lib/agenda/load.ts`, o reducer ou `data.clientes`; `data_nascimento` e a coluna antiga `observacoes` (≠ `observacoes_fixas`) ficam de fora do form; não edita preferências pelo `AgendarDrawer`.

## Global Constraints

- Toda a UI em pt-BR: labels, placeholders, mensagens, erros, estado vazio.
- `apps/studiold/app/globals.css` NÃO pode ser tocado. Nenhum CSS novo — só reuso de classes já em `agenda.module.css` (`.field`, `.btn`, `.btn--primary`, `.btn--ghost`, `.slip__meta`, `.chips`, `.chip`) + utilitários Tailwind.
- Toda validação de entrada é no servidor (Server Action). `required` / `inputMode` no cliente são conveniência de UX, não a barreira.
- `telefone` canônico: `/^\+55\d{10,11}$/` (após normalização). A tabela tem `telefone TEXT NOT NULL UNIQUE`.
- `genero` só aceita `'masculino' | 'feminino' | 'nao_informado'` (CHECK no banco); default `'nao_informado'`.
- Sem schema change. Sem migration. Sem novas dependências.
- Sem testes de componente de framework. Lógica pura nova (normalização de telefone) leva asserts no `agenda.check.ts`.
- Mobile-first (validar a 375px). Todo controle interativo com `<label>` associado ou `aria-label`.
- Imports internos de `lib/**` consumidos pelo `agenda.check.ts` usam extensão `.ts` explícita (regra do `--experimental-strip-types`).
- `tenantDb()` só no servidor. `app/clientes/actions.ts` já é `"use server"`.

---

### Task 1: `normalizarTelefone` — util puro + asserts

**Files:**
- Create: `apps/studiold/lib/clientes/telefone.ts`
- Modify: `apps/studiold/lib/agenda/agenda.check.ts` (adicionar bloco de asserts + 1 import)

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export function normalizarTelefone(raw: string): string | null
  ```
  Devolve `+55` seguido de 10 ou 11 dígitos nacionais, ou `null` se a entrada não for um telefone BR plausível.

- [ ] **Step 1: Escrever os asserts (RED)**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar o import junto aos outros imports de topo (logo abaixo de `import { parsePrecoBRL } from "../dinheiro.ts";`):

```ts
import { normalizarTelefone } from "../clientes/telefone.ts";
```

E adicionar este bloco imediatamente antes da linha final `console.log("agenda.check: OK");`:

```ts
// --- normalizarTelefone --------------------------------------------------
{
  assert.equal(normalizarTelefone("11990001234"), "+5511990001234", "celular 11 dígitos sem código país");
  assert.equal(normalizarTelefone("(11) 99000-1234"), "+5511990001234", "tira máscara");
  assert.equal(normalizarTelefone("+55 11 99000-1234"), "+5511990001234", "já vem com +55");
  assert.equal(normalizarTelefone("5511990001234"), "+5511990001234", "13 dígitos com 55 na frente");
  assert.equal(normalizarTelefone("1132201234"), "+551132201234", "fixo 10 dígitos");
  assert.equal(normalizarTelefone("0800 123 4567"), null, "não é celular/fixo com DDD");
  assert.equal(normalizarTelefone("999"), null, "curto demais");
  assert.equal(normalizarTelefone(""), null, "vazio");
  assert.equal(normalizarTelefone("abc"), null, "sem dígitos");
}
```

- [ ] **Step 2: Rodar o check e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — `Cannot find module '../clientes/telefone.ts'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `telefone.ts`**

Create `apps/studiold/lib/clientes/telefone.ts`:

```ts
// Normaliza um telefone digitado por humano para o formato canônico
// +55 + DDD (2) + número (8 ou 9). Retorna null quando a entrada não é um
// fixo/celular brasileiro plausível.
//
// ponytail: heurística de comprimento + DDD sem zero; não valida DDD real
// nem faixa de operadora. Se um dia precisar rigor, trocar por libphonenumber.
export function normalizarTelefone(raw: string): string | null {
  const digitos = (raw ?? "").replace(/\D/g, "");
  let nacional: string;
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    nacional = digitos.slice(2);
  } else if (digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) {
    // trunk "0" na frente do DDD (ex.: 0 11 3220-1234)
    nacional = digitos.slice(1);
  } else {
    nacional = digitos;
  }
  if (nacional.length < 10 || nacional.length > 11) return null;
  // DDD sem zero (descarta 0800, 0300, 0500…)
  if (!/^[1-9][1-9]$/.test(nacional.slice(0, 2))) return null;
  // celular (11 dígitos) tem 9 como primeiro dígito do número
  if (nacional.length === 11 && nacional[2] !== "9") return null;
  return `+55${nacional}`;
}
```

- [ ] **Step 4: Rodar o check e ver passar**

Run: `pnpm --filter studiold check`
Expected: PASS — termina com `agenda.check: OK`, sem `AssertionError`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter studiold typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/lib/clientes/telefone.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat: normalizarTelefone — normalização pura de telefone BR + asserts"
```

---

### Task 2: Server Actions `criarCliente` e `getPreferenciasCliente`

**Files:**
- Modify: `apps/studiold/lib/clientes/types.ts` (adicionar 3 tipos ao fim, sem mexer nos existentes)
- Modify: `apps/studiold/app/clientes/actions.ts` (adicionar imports + 2 funções ao fim)

**Interfaces:**
- Consumes: `normalizarTelefone` de `@/lib/clientes/telefone` (Task 1); `tenantDb` de `@/lib/supabase/server` e o regex `UUID` + `type Row` já presentes em `actions.ts`.
- Produces:
  ```ts
  // em lib/clientes/types.ts
  export type CriarClienteResultado =
    | { ok: true; id: string }
    | { ok: false; error: string; clienteExistenteId?: string };

  export type PreferenciasCliente = {
    cortesiaFavoritaId: string | null;
    cortesiaNome: string | null;
    estiloNome: string | null;
    observacoesFixas: string | null;
  };

  export type PreferenciasResultado =
    | { ok: true; prefs: PreferenciasCliente }
    | { ok: false; error: string };

  // em app/clientes/actions.ts
  export async function criarCliente(fd: FormData): Promise<CriarClienteResultado>
  export async function getPreferenciasCliente(clienteId: string): Promise<PreferenciasResultado>
  ```

- [ ] **Step 1: Adicionar os tipos**

No fim de `apps/studiold/lib/clientes/types.ts`, acrescentar:

```ts
export type CriarClienteResultado =
  | { ok: true; id: string }
  | { ok: false; error: string; clienteExistenteId?: string };

export type PreferenciasCliente = {
  cortesiaFavoritaId: string | null;
  cortesiaNome: string | null;
  estiloNome: string | null;
  observacoesFixas: string | null;
};

export type PreferenciasResultado =
  | { ok: true; prefs: PreferenciasCliente }
  | { ok: false; error: string };
```

- [ ] **Step 2: Adicionar imports em `actions.ts`**

No topo de `apps/studiold/app/clientes/actions.ts`, ajustar os imports:

- Adicionar `import { revalidatePath } from "next/cache";` (o arquivo hoje não importa isso).
- Adicionar `import { normalizarTelefone } from "@/lib/clientes/telefone";`.
- No import de tipos existente (`import type { PerfilResultado, PreferenciasPatch } from "@/lib/clientes/types";`), incluir os novos:
  ```ts
  import type {
    PerfilResultado,
    PreferenciasPatch,
    CriarClienteResultado,
    PreferenciasResultado,
  } from "@/lib/clientes/types";
  ```

- [ ] **Step 3: Implementar `criarCliente`**

Acrescentar ao fim de `apps/studiold/app/clientes/actions.ts`:

```ts
const GENEROS = new Set(["masculino", "feminino", "nao_informado"]);

export async function criarCliente(
  fd: FormData,
): Promise<CriarClienteResultado> {
  const nome = (fd.get("nome") ?? "").toString().trim().slice(0, 120);
  if (!nome) return { ok: false, error: "Informe o nome do cliente." };

  const telefone = normalizarTelefone((fd.get("telefone") ?? "").toString());
  if (!telefone) {
    return { ok: false, error: "Telefone inválido. Use DDD + número." };
  }

  const generoRaw = (fd.get("genero") ?? "nao_informado").toString();
  const genero = GENEROS.has(generoRaw) ? generoRaw : "nao_informado";

  const db = tenantDb();

  const dup = await db
    .from("clientes")
    .select("id")
    .eq("telefone", telefone)
    .maybeSingle();
  if (dup.error) {
    return { ok: false, error: `criarCliente/dup: ${dup.error.message}` };
  }
  if (dup.data) {
    return {
      ok: false,
      error: "Já existe cliente com esse telefone.",
      clienteExistenteId: (dup.data as { id: string }).id,
    };
  }

  const ins = await db
    .from("clientes")
    .insert({ nome, telefone, genero })
    .select("id")
    .single();
  if (ins.error) {
    // corrida no UNIQUE(telefone) entre o check acima e o insert
    if (ins.error.code === "23505") {
      const again = await db
        .from("clientes")
        .select("id")
        .eq("telefone", telefone)
        .maybeSingle();
      const existenteId = (again.data as { id: string } | null)?.id;
      return existenteId
        ? {
            ok: false,
            error: "Já existe cliente com esse telefone.",
            clienteExistenteId: existenteId,
          }
        : { ok: false, error: "Já existe cliente com esse telefone." };
    }
    return { ok: false, error: `criarCliente: ${ins.error.message}` };
  }

  revalidatePath("/clientes");
  return { ok: true, id: (ins.data as { id: string }).id };
}
```

- [ ] **Step 4: Implementar `getPreferenciasCliente`**

Acrescentar ao fim de `apps/studiold/app/clientes/actions.ts`:

```ts
export async function getPreferenciasCliente(
  clienteId: string,
): Promise<PreferenciasResultado> {
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const db = tenantDb();

  const [cliRes, cortRes, estRes] = await Promise.all([
    db
      .from("clientes")
      .select("cortesia_favorita_id, estilo_musica_id, observacoes_fixas")
      .eq("id", clienteId)
      .maybeSingle(),
    db.from("cortesias").select("id, nome"),
    db.from("estilos_musica").select("id, nome"),
  ]);

  if (cliRes.error) {
    return { ok: false, error: `getPreferenciasCliente: ${cliRes.error.message}` };
  }
  if (!cliRes.data) return { ok: false, error: "Cliente não encontrado." };
  if (cortRes.error) {
    return { ok: false, error: `getPreferenciasCliente/cortesias: ${cortRes.error.message}` };
  }
  if (estRes.error) {
    return { ok: false, error: `getPreferenciasCliente/estilos: ${estRes.error.message}` };
  }

  const c = cliRes.data as Row;
  const nomePorId = (rows: Row[], id: string | null): string | null => {
    if (!id) return null;
    const hit = rows.find((r) => (r.id as string) === id);
    return hit ? (hit.nome as string) : null;
  };
  const cortesias = (cortRes.data ?? []) as Row[];
  const estilos = (estRes.data ?? []) as Row[];
  const cortesiaFavoritaId = (c.cortesia_favorita_id as string) ?? null;

  return {
    ok: true,
    prefs: {
      cortesiaFavoritaId,
      cortesiaNome: nomePorId(cortesias, cortesiaFavoritaId),
      estiloNome: nomePorId(estilos, (c.estilo_musica_id as string) ?? null),
      observacoesFixas: (c.observacoes_fixas as string) ?? null,
    },
  };
}
```

- [ ] **Step 5: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos. Build lista 6 rotas (nenhuma nova).

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/lib/clientes/types.ts apps/studiold/app/clientes/actions.ts
git commit -m "feat: Server Actions criarCliente e getPreferenciasCliente"
```

---

### Task 3: `NovoClienteDrawer` + botão em `/clientes`

**Files:**
- Create: `apps/studiold/components/NovoClienteDrawer.tsx`
- Modify: `apps/studiold/components/ListaClientes.tsx`

**Interfaces:**
- Consumes: `criarCliente` de `@/app/clientes/actions` e `CriarClienteResultado` de `@/lib/clientes/types` (Task 2); `Drawer` de `@/components/agenda/Drawer`; `Icon` de `@/components/agenda/Icon` (glyph `plus` existe).
- Produces:
  ```ts
  export function NovoClienteDrawer(props: {
    onClose: () => void;
    onCriado: (clienteId: string) => void;
  }): JSX.Element
  ```
  `onCriado` é chamado tanto no cadastro novo (`r.id`) quanto no telefone duplicado (`r.clienteExistenteId`) — em ambos os casos o host deve abrir o `PerfilClienteDrawer` desse id.

- [ ] **Step 1: Criar `NovoClienteDrawer.tsx`**

Create `apps/studiold/components/NovoClienteDrawer.tsx`:

```tsx
"use client";

// Drawer de cadastro manual de cliente. Chama criarCliente; em sucesso ou
// em telefone duplicado, entrega um clienteId ao host via onCriado (o host
// abre o perfil desse cliente).

import { useState, useTransition, type FormEvent } from "react";
import { criarCliente } from "@/app/clientes/actions";
import { Drawer } from "@/components/agenda/Drawer";
import styles from "@/app/agenda/agenda.module.css";

export function NovoClienteDrawer({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (clienteId: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [genero, setGenero] = useState("nao_informado");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setAviso(null);
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("telefone", telefone);
    fd.set("genero", genero);
    iniciar(async () => {
      try {
        const r = await criarCliente(fd);
        if (r.ok) {
          onCriado(r.id);
          return;
        }
        if (r.clienteExistenteId) {
          onCriado(r.clienteExistenteId);
          return;
        }
        setAviso(r.error);
      } catch {
        setAviso("Falha de conexão. Tente de novo.");
      }
    });
  };

  return (
    <Drawer titulo="Novo cliente" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-nome">Nome</label>
          <input
            id="nc-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            maxLength={120}
            autoComplete="off"
          />
        </div>
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-tel">Telefone</label>
          <input
            id="nc-tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="+55 11 90000-0000"
            required
            autoComplete="off"
          />
        </div>
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-genero">Gênero</label>
          <select
            id="nc-genero"
            value={genero}
            onChange={(e) => setGenero(e.target.value)}
          >
            <option value="nao_informado">Não informado</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
        </div>

        {aviso && (
          <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
            {aviso}
          </p>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]}`}
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Cadastrar cliente"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--ghost"]}`}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 2: Ligar no `ListaClientes.tsx`**

Em `apps/studiold/components/ListaClientes.tsx`:

2a. Ajustar imports do topo:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
import { NovoClienteDrawer } from "@/components/NovoClienteDrawer";
import { Icon } from "@/components/agenda/Icon";
import { desde } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
```

2b. Dentro de `ListaClientes`, logo abaixo de `const [selecionado, setSelecionado] = useState<string | null>(null);`, adicionar:

```tsx
  const [criando, setCriando] = useState(false);
  const router = useRouter();
```

2c. No JSX, dentro do `<div className="flex flex-col gap-3">`, ANTES do `<input className={styles.clientesBusca} ... />`, inserir o botão:

```tsx
      <button
        type="button"
        className={`${styles.btn} ${styles["btn--primary"]} self-start`}
        onClick={() => setCriando(true)}
      >
        <Icon name="plus" size={14} /> Novo cliente
      </button>
```

2d. No fim do componente, ao lado do bloco `{selecionado && (<PerfilClienteDrawer ... />)}`, adicionar:

```tsx
      {criando && (
        <NovoClienteDrawer
          onClose={() => setCriando(false)}
          onCriado={(id) => {
            setCriando(false);
            setSelecionado(id);
            router.refresh();
          }}
        />
      )}
```

- [ ] **Step 3: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três limpos, 6 rotas.

- [ ] **Step 4: Conferência manual (anotar no report, não bloqueia)**

Descrever no report: abrir `/clientes`, clicar "Novo cliente", cadastrar com telefone novo → drawer fecha, perfil do novo cliente abre, cliente aparece na lista. Repetir com um telefone já existente → mensagem "Já existe cliente com esse telefone." e o perfil do cliente existente abre.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/components/NovoClienteDrawer.tsx apps/studiold/components/ListaClientes.tsx
git commit -m "feat: cadastro manual de cliente em /clientes"
```

---

### Task 4: Preferências no `AgendarDrawer`

**Files:**
- Modify: `apps/studiold/components/agenda/AgendarDrawer.tsx`

**Interfaces:**
- Consumes: `getPreferenciasCliente` de `@/app/clientes/actions` e `PreferenciasCliente` de `@/lib/clientes/types` (Task 2).
- Produces: nada.

- [ ] **Step 1: Ajustar imports**

Em `apps/studiold/components/agenda/AgendarDrawer.tsx`, a primeira linha de import passa de:

```tsx
import { useMemo, useState, type FormEvent } from "react";
```

para:

```tsx
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { getPreferenciasCliente } from "@/app/clientes/actions";
import type { PreferenciasCliente } from "@/lib/clientes/types";
```

- [ ] **Step 2: Estado das preferências**

Logo abaixo de `const [cortesiaId, setCortesiaId] = useState<string | null>(null);`, adicionar:

```tsx
  const [prefs, setPrefs] = useState<PreferenciasCliente | null>(null);
  const [, carregarPrefs] = useTransition();
```

- [ ] **Step 3: Buscar no `onChange` do select de cliente**

Trocar o `<select id="cli-exist" ...>` — hoje:

```tsx
          <select
            id="cli-exist"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
```

por:

```tsx
          <select
            id="cli-exist"
            value={clienteId}
            onChange={(e) => {
              const id = e.target.value;
              setClienteId(id);
              setPrefs(null);
              if (!id) return;
              carregarPrefs(async () => {
                try {
                  const r = await getPreferenciasCliente(id);
                  if (!r.ok) return;
                  setPrefs(r.prefs);
                  if (
                    r.prefs.cortesiaFavoritaId &&
                    cortesiasDisponiveis.some(
                      (c) => c.id === r.prefs.cortesiaFavoritaId,
                    )
                  ) {
                    setCortesiaId(r.prefs.cortesiaFavoritaId);
                  }
                } catch {
                  // preferências são um extra; falha não bloqueia o agendamento
                }
              });
            }}
          >
```

- [ ] **Step 4: Bloco read-only abaixo do select**

Logo depois do `</div>` que fecha o `<div className={\`${styles.field} flex flex-col gap-1.5\`}>` do select de cliente (ou seja, antes do `{!clienteExistente && (`), inserir:

```tsx
        {clienteExistente && prefs && (
          <div className={`${styles.slip__meta} flex flex-col gap-0.5`}>
            <span>Cortesia favorita: {prefs.cortesiaNome ?? "—"}</span>
            <span>Estilo musical: {prefs.estiloNome ?? "—"}</span>
            {prefs.observacoesFixas && <span>Obs.: {prefs.observacoesFixas}</span>}
          </div>
        )}
```

- [ ] **Step 5: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`, 6 rotas.

- [ ] **Step 6: Conferência manual (anotar no report, não bloqueia)**

Descrever no report: abrir Walk-in, escolher um cliente cadastrado com cortesia favorita ativa e em estoque → bloco de preferências aparece abaixo do select e o chip da cortesia favorita fica marcado. Escolher "— novo cliente —" de volta → bloco some, sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/components/agenda/AgendarDrawer.tsx
git commit -m "feat: preferências do cliente no drawer de agendamento"
```

---

## Notas de edge cases (referência)

- **`normalizarTelefone` é heurística.** Comprimento (10 ou 11 nacionais) + DDD sem zero + celular começa com `9`. Não valida DDD real nem faixa de operadora. Casos cobertos pelos asserts do Step 1: com/sem máscara, com/sem `+55`, fixo de 10 dígitos, `0800` (DDD `80` → rejeitado), curto demais, vazio, sem dígitos.
- **Trunk `0` na frente do DDD:** `011 3220-1234` → `01132201234` (11, começa com `0`) → tira o `0` → `1132201234` → `+551132201234`. O `0800...` também começa com `0` e cai nessa branch, mas é barrado depois pelo teste de DDD (`80`).
- **DDD 55 (RS):** `55 3220-1234` → dígitos `5532201234` (10; começa com "55" mas comprimento fora de {12,13}) → fica inteiro → DDD `55` ok → `+555532201234`. Correto.
- **Telefone duplicado por corrida:** o `insert` pode falhar no `UNIQUE` mesmo com o pré-check. `criarCliente` trata `error.code === "23505"` re-buscando o id. Se a re-busca não achar (permissão, timing), devolve só a mensagem sem `clienteExistenteId` e o drawer fica aberto.
- **`getPreferenciasCliente` lê `cortesias`/`estilos_musica` sem `.eq("ativo", true)`** de propósito: se a cortesia favorita foi desativada, ainda queremos mostrar o nome dela no bloco read-only. A pré-seleção do chip usa `cortesiasDisponiveis` (que já filtra ativo + estoque), então cortesia desativada aparece no texto mas não marca chip.
- **Dois drawers no `ListaClientes`:** `onCriado` faz `setCriando(false)` e `setSelecionado(id)` no mesmo tick — `NovoClienteDrawer` desmonta e `PerfilClienteDrawer` monta. `Drawer` põe `document.body.style.overflow` no mount e restaura no cleanup; a ordem React (cleanup do que sai antes do effect do que entra) mantém `hidden`. Sem piscada.
- **`PerfilClienteDrawer` com cliente recém-criado:** `getPerfilCliente` roda com 0 atendimentos — `resumirAtendimentos([])` já devolve resumo zerado e `historico: []`, e o drawer tem estado vazio tratado ("sem visitas", "Nenhuma visita registrada."). Nada a fazer.
- **`revalidatePath("/clientes")` + `router.refresh()`:** os dois juntos. O `revalidatePath` invalida o cache da rota; o `router.refresh()` força o RSC a re-renderizar na navegação atual, trazendo a lista com o novo cliente. Redundância barata e correta.
- **`AgendarDrawer` pré-seleciona cortesia favorita mas o barbeiro pode trocar:** os chips continuam controlados por `cortesiaId`; a pré-seleção só chama `setCortesiaId` uma vez quando as prefs chegam. Trocar de cliente reseta `prefs` para `null` mas NÃO reseta `cortesiaId` — decisão consciente: se o barbeiro já mexeu no chip, não sobrescreve. A próxima escolha de cliente com favorita disponível sobrescreve de novo. Aceitável para o fluxo de balcão.

## Self-Review

**1. Cobertura do design:**
- Peça 1 — botão "Novo cliente" (Task 3 Step 2c); drawer com nome/telefone/genero (Task 3 Step 1); `criarCliente` valida + insere + `revalidatePath` (Task 2 Step 3); normalização `+55XXXXXXXXXXX` (Task 1 + Task 2); pós-save abre perfil do novo id (Task 3 Step 2d); telefone duplicado → mensagem + abre perfil do existente (Task 2 Step 3 devolve `clienteExistenteId`, Task 3 Step 1 chama `onCriado` com ele). ✔
- Peça 2 — buscar prefs ao escolher cliente no select (Task 4 Step 3); mostrar `cortesia_favorita_id`/`estilo_musica_id`/`observacoes_fixas` abaixo do cliente (Task 4 Step 4); pré-selecionar cortesia favorita quando disponível (Task 4 Step 3). ✔
- Fora de escopo respeitado: sem migration, sem `load.ts`/reducer, sem `data_nascimento`/`observacoes`. ✔

**2. Placeholder scan:** sem "TBD/TODO"; todo passo de código tem o bloco real. A nota de edge case do `0800` traz as 2 linhas exatas a acrescentar e diz onde.

**3. Consistência de tipos:**
- `normalizarTelefone(raw: string): string | null` — Task 1 define, Task 2 Step 3 consome (`normalizarTelefone((fd.get("telefone") ?? "").toString())`).
- `CriarClienteResultado` — Task 2 Step 1 define (`{ ok:true; id } | { ok:false; error; clienteExistenteId? }`); Task 3 Step 1 consome exatamente esses campos (`r.ok`, `r.id`, `r.clienteExistenteId`, `r.error`).
- `PreferenciasCliente` — Task 2 Step 1 define (`cortesiaFavoritaId`, `cortesiaNome`, `estiloNome`, `observacoesFixas`); Task 4 Steps 3–4 consomem esses nomes (`r.prefs.cortesiaFavoritaId`, `prefs.cortesiaNome`, `prefs.estiloNome`, `prefs.observacoesFixas`).
- `PreferenciasResultado` — Task 2 Step 1 define (`{ ok:true; prefs } | { ok:false; error }`); Task 4 Step 3 usa `r.ok` / `r.prefs`.
- `getPreferenciasCliente(clienteId: string): Promise<PreferenciasResultado>` — assinatura idêntica na definição (Task 2 Step 4) e na chamada (Task 4 Step 3).
- `criarCliente(fd: FormData): Promise<CriarClienteResultado>` — idem (Task 2 Step 3 def; Task 3 Step 1 chamada com `FormData` montado à mão).
- `Icon name="plus"` — glyph confirmado em `components/agenda/Icon.tsx`.
- Classes CSS usadas (`.field`, `.btn`, `.btn--primary`, `.btn--ghost`, `.slip__meta`) já existem em `agenda.module.css` e já são usadas por `AgendarDrawer`/`PerfilClienteDrawer`.
