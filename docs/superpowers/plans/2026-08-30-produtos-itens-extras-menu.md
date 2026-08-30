# Produtos + itens extras no pagamento + menu Gerenciar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de produtos em `/configuracoes`; drawer de conclusão aceita serviços extras + produtos vendidos com baixa de estoque e total corrente; menu "Gerenciar" quebrado em 5 links por âncora.

**Architecture:** Nova tabela `produtos` (espelha `cortesias`) e tabela filha `atendimento_itens`; `fn_concluir_atendimento` ganha um arg `p_itens jsonb` e grava as linhas + baixa estoque de produto numa transação. O `PagamentoDrawer` monta uma lista de itens (linha fixa do serviço principal + extras removíveis) e um total corrente que espelha o campo de valor até o barbeiro editá-lo à mão. Nenhuma rota nova — o menu usa âncoras `/configuracoes#<secao>`.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19, Supabase (`tenantDb()` service-role, schema `barbearia_001`, RPC plpgsql), CSS Modules `@/app/agenda/agenda.module.css`, teste de lógica pura via `lib/agenda/agenda.check.ts` (`node --experimental-strip-types`, `pnpm --filter studiold check`).

**Spec:** `docs/superpowers/specs/2026-08-30-produtos-itens-extras-menu-design.md`

## Global Constraints

- Toda a UI em pt-BR: labels, placeholders, mensagens, erros, estado vazio.
- `apps/studiold/app/globals.css` intocado. NENHUM CSS novo — reuso de `.cfgSection`/`.cfgRow`/`.cfgAddbar`/`.cfgEdit`/`.cfgSummary`/`.cfgSwitch`/`.cfgEstoqueNum`/`.cfgEstoqueEdit`/`.field`/`.btn`/`.btn--primary`/`.btn--ghost`/`.chip`/`.chips`/`.pagFormas`/`.pagDock`/`.slip__meta` + utilitários Tailwind (inclui `scroll-mt-20`).
- Toda validação de entrada é no servidor (Server Action + CHECK/`greatest` na RPC). `required`/`inputMode`/`pattern` no cliente são conveniência.
- `preco_venda` / `preco` / `preco_unitario` vêm como string do PostgREST (NUMERIC) → `Number(...)`. Parse de entrada humana via `parsePrecoBRL` de `@/lib/dinheiro`.
- `await requireUser()` (de `@/lib/supabase/auth`) é a PRIMEIRA linha de toda Server Action nova (padrão já aplicado no arquivo).
- `infra/supabase/migrations/**` é caminho protegido — a migration é entregue como rascunho em `docs/`, aplicada à mão pelo usuário (`pnpm supabase migration new` + `db push`).
- Sem dependência nova. `atendimentos.valor_cobrado` continua sendo o total que o `/financeiro` soma — `/financeiro` NÃO muda.
- `lib/supabase/server.ts` / `tenantDb()` / path A não mudam.
- Mobile-first (375px). Todo controle interativo com `<label>` ou `aria-label`.

---

### Task 1: Migration — rascunho (`produtos`, `atendimento_itens`, `fn_concluir_atendimento` v2)

**Files:**
- Create: `docs/migrations-draft/2026-08-30-produtos-itens-atendimento.sql`

**Interfaces:**
- Consumes: nada.
- Produces (contrato que o resto do plano assume):
  - tabela `barbearia_001.produtos (id, nome, descricao, preco_venda numeric(10,2), quantidade_estoque int, ativo bool, criado_em)`.
  - tabela `barbearia_001.atendimento_itens (id, atendimento_id, tipo, servico_id, produto_id, descricao, quantidade, preco_unitario numeric(10,2), subtotal numeric(10,2), criado_em)`.
  - `barbearia_001.fn_concluir_atendimento(p_agendamento_id uuid, p_valor numeric, p_forma_pagamento text, p_cortesia_id uuid, p_itens jsonb) returns uuid`, `grant execute` pra `service_role`.

- [ ] **Step 1: Escrever o rascunho**

Create `docs/migrations-draft/2026-08-30-produtos-itens-atendimento.sql`:

```sql
-- RASCUNHO PARA REVISÃO. Não é uma migration ainda — infra/supabase/migrations/
-- é protegido (escrita à mão).
--
-- Para aplicar:
--   pnpm supabase migration new produtos_itens_atendimento
--   colar este conteúdo, revisar, e `pnpm supabase db push`
-- ============================================================================

-- 1. Produtos (espelha cortesias, com preço de venda e descrição).
CREATE TABLE barbearia_001.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_venda NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade_estoque INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- 2. Itens de um atendimento concluído (serviço principal + extras + produtos).
CREATE TABLE barbearia_001.atendimento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES barbearia_001.atendimentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('servico','produto')),
  servico_id UUID REFERENCES barbearia_001.servicos(id),
  produto_id UUID REFERENCES barbearia_001.produtos(id),
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_atendimento_itens_atendimento
  ON barbearia_001.atendimento_itens (atendimento_id);

-- 3. Conclusão do atendimento v2: agora grava os itens e baixa estoque de produto.
DROP FUNCTION IF EXISTS barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION barbearia_001.fn_concluir_atendimento(
  p_agendamento_id  uuid,
  p_valor           numeric,
  p_forma_pagamento text,
  p_cortesia_id     uuid,
  p_itens           jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_id uuid;
  v_servico_id uuid;
  v_status     text;
  v_atend_id   uuid;
  v_item       jsonb;
  v_qtd        integer;
  v_preco      numeric;
BEGIN
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'valor inválido: %', p_valor;
  END IF;
  IF p_forma_pagamento NOT IN ('pix','cartao_debito','cartao_credito','dinheiro') THEN
    RAISE EXCEPTION 'forma de pagamento inválida: %', p_forma_pagamento;
  END IF;

  SELECT cliente_id, servico_id, status
    INTO v_cliente_id, v_servico_id, v_status
    FROM barbearia_001.agendamentos
   WHERE id = p_agendamento_id
   FOR UPDATE;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'agendamento % não encontrado', p_agendamento_id;
  END IF;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'agendamento % já concluído', p_agendamento_id;
  END IF;

  INSERT INTO barbearia_001.atendimentos
    (agendamento_id, cliente_id, servico_id, valor_cobrado, forma_pagamento, cortesia_id, realizado_em)
  VALUES
    (p_agendamento_id, v_cliente_id, v_servico_id, p_valor, p_forma_pagamento, p_cortesia_id, now())
  RETURNING id INTO v_atend_id;

  IF p_itens IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_qtd   := GREATEST(1, COALESCE((v_item->>'quantidade')::int, 1));
      v_preco := GREATEST(0, COALESCE((v_item->>'preco_unitario')::numeric, 0));

      INSERT INTO barbearia_001.atendimento_itens
        (atendimento_id, tipo, servico_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
      VALUES (
        v_atend_id,
        v_item->>'tipo',
        CASE WHEN v_item->>'tipo' = 'servico' THEN (v_item->>'ref_id')::uuid END,
        CASE WHEN v_item->>'tipo' = 'produto' THEN (v_item->>'ref_id')::uuid END,
        COALESCE(v_item->>'descricao', ''),
        v_qtd,
        v_preco,
        ROUND(v_qtd * v_preco, 2)
      );

      IF v_item->>'tipo' = 'produto' THEN
        UPDATE barbearia_001.produtos
           SET quantidade_estoque = GREATEST(0, quantidade_estoque - v_qtd)
         WHERE id = (v_item->>'ref_id')::uuid;
      END IF;
    END LOOP;
  END IF;

  UPDATE barbearia_001.agendamentos
     SET status = 'concluido',
         cortesia_id = p_cortesia_id,
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  IF p_cortesia_id IS NOT NULL THEN
    UPDATE barbearia_001.cortesias
       SET quantidade_estoque = GREATEST(0, quantidade_estoque - 1)
     WHERE id = p_cortesia_id;
  END IF;

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid, jsonb) TO service_role;
```

- [ ] **Step 2: Commit**

```bash
git add docs/migrations-draft/2026-08-30-produtos-itens-atendimento.sql
git commit -m "docs: rascunho de migration — produtos, atendimento_itens, fn_concluir v2"
```

---

### Task 2: `types.ts` + `lib/agenda/pagamento.ts` (puro) + asserts

**Files:**
- Modify: `apps/studiold/lib/agenda/types.ts`
- Create: `apps/studiold/lib/agenda/pagamento.ts`
- Modify: `apps/studiold/lib/agenda/agenda.check.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  // types.ts
  export interface Produto { id: string; nome: string; descricao?: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
  // AgendaData ganha: produtos: Produto[]

  // pagamento.ts
  export type ItemPagamento = {
    key: string; tipo: "servico" | "produto"; refId: string;
    descricao: string; quantidade: number; precoUnitario: number; fixo: boolean;
  };
  export function somaItens(itens: ItemPagamento[]): number;
  ```

- [ ] **Step 1: Escrever os asserts (RED)**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar ao bloco de imports do topo (junto de `parsePrecoBRL` / `normalizarTelefone`):

```ts
import { somaItens, type ItemPagamento } from "./pagamento.ts";
```

E adicionar este bloco antes da linha final `console.log("agenda.check: OK");`:

```ts
// --- somaItens -----------------------------------------------------------
{
  const it = (over: Partial<ItemPagamento>): ItemPagamento => ({
    key: "k", tipo: "servico", refId: "r", descricao: "d",
    quantidade: 1, precoUnitario: 0, fixo: false, ...over,
  });
  assert.equal(somaItens([]), 0, "lista vazia");
  assert.equal(somaItens([it({ precoUnitario: 55 })]), 55, "um item qtd 1");
  assert.equal(
    somaItens([it({ quantidade: 3, precoUnitario: 12.5 })]),
    37.5,
    "qtd × preço",
  );
  assert.equal(
    somaItens([
      it({ fixo: true, precoUnitario: 55 }),
      it({ tipo: "produto", quantidade: 2, precoUnitario: 8.9 }),
    ]),
    72.8,
    "fixo + produto, 2 casas",
  );
  assert.equal(
    somaItens([it({ quantidade: 3, precoUnitario: 0.1 })]),
    0.3,
    "arredonda cada subtotal antes de somar (evita 0.30000000000000004)",
  );
}
```

- [ ] **Step 2: Rodar o check e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — `Cannot find module './pagamento.ts'`.

- [ ] **Step 3: Criar `pagamento.ts`**

Create `apps/studiold/lib/agenda/pagamento.ts`:

```ts
// Itens do drawer de conclusão. Módulo puro — sem React, sem I/O.

export type ItemPagamento = {
  key: string; // id local estável (para React key e remoção)
  tipo: "servico" | "produto";
  refId: string; // servico_id | produto_id
  descricao: string; // snapshot do nome
  quantidade: number;
  precoUnitario: number;
  fixo: boolean; // true = linha do serviço principal (não removível)
};

/** Soma dos subtotais, cada subtotal arredondado a 2 casas antes de somar. */
export function somaItens(itens: ItemPagamento[]): number {
  const cents = itens.reduce(
    (acc, i) => acc + Math.round(i.quantidade * i.precoUnitario * 100),
    0,
  );
  return cents / 100;
}
```

- [ ] **Step 4: Rodar o check e ver passar**

Run: `pnpm --filter studiold check`
Expected: PASS — termina em `agenda.check: OK`.

- [ ] **Step 5: `types.ts`**

Em `apps/studiold/lib/agenda/types.ts`:

5a. Depois da `interface Cortesia { ... }`, adicionar:
```ts
export interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  preco_venda: number;
  quantidade_estoque: number;
  ativo: boolean;
}
```

5b. Na `interface AgendaData`, adicionar a linha `produtos: Produto[];` logo depois de `cortesias: Cortesia[];`.

- [ ] **Step 6: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold check`
Expected: typecheck acusa `Property 'produtos' is missing` em `lib/agenda/load.ts` e `lib/agenda/seed.ts` (onde `AgendaData` é construído). **Isso é esperado** — Task 5 preenche `load.ts` e o `seed` é fixture do check. Para o commit desta task, adicionar `produtos: []` em `lib/agenda/seed.ts` no objeto `AgendaData` que ele monta (só isso, para o `check` continuar compilando). NÃO tocar `load.ts` aqui.

Rodar de novo: `pnpm --filter studiold typecheck && pnpm --filter studiold check` → limpos.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/lib/agenda/types.ts apps/studiold/lib/agenda/pagamento.ts apps/studiold/lib/agenda/agenda.check.ts apps/studiold/lib/agenda/seed.ts
git commit -m "feat: tipo Produto + somaItens puro (itens do pagamento) + asserts"
```

---

### Task 3: Produtos — Server Actions + `EstoqueProdutoEditavel`

**Files:**
- Modify: `apps/studiold/app/configuracoes/actions.ts`
- Create: `apps/studiold/app/configuracoes/EstoqueProdutoEditavel.tsx`

**Interfaces:**
- Consumes: `parsePrecoBRL` de `@/lib/dinheiro`; `requireUser` de `@/lib/supabase/auth`; os helpers `texto`/`idDe` já em `actions.ts`.
- Produces:
  ```ts
  export async function criarProduto(fd: FormData): Promise<void>
  export async function editarProduto(fd: FormData): Promise<void>
  export async function toggleProdutoAtivo(fd: FormData): Promise<void>
  export async function definirProdutoEstoque(id: string, quantidade: number): Promise<void>
  export function EstoqueProdutoEditavel(props: { id: string; valor: number; nome: string }): JSX.Element
  ```

- [ ] **Step 1: Actions em `actions.ts`**

Acrescentar ao fim de `apps/studiold/app/configuracoes/actions.ts` (o arquivo já importa `parsePrecoBRL`, `requireUser`, `tenantDb`, `revalidatePath`, e tem `ROTA`, `texto`, `idDe`):

```ts
// --- produtos ---------------------------------------------------------

export async function criarProduto(fd: FormData): Promise<void> {
  await requireUser();
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco_venda") ?? "").toString());
  const descricao = texto(fd, "descricao", 280);
  if (!nome || preco == null) return;
  const { error } = await tenantDb()
    .from("produtos")
    .insert({ nome, preco_venda: preco, descricao: descricao || null });
  if (error) throw new Error(`criarProduto: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarProduto(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco_venda") ?? "").toString());
  const descricao = texto(fd, "descricao", 280);
  if (!nome || preco == null) return;
  const { error } = await tenantDb()
    .from("produtos")
    .update({ nome, preco_venda: preco, descricao: descricao || null })
    .eq("id", id);
  if (error) throw new Error(`editarProduto: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleProdutoAtivo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("produtos")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleProdutoAtivo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function definirProdutoEstoque(
  id: string,
  quantidade: number,
): Promise<void> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id inválido");
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100_000) {
    return;
  }
  const { error } = await tenantDb()
    .from("produtos")
    .update({ quantidade_estoque: quantidade })
    .eq("id", id);
  if (error) throw new Error(`definirProdutoEstoque: ${error.message}`);
  revalidatePath(ROTA);
}
```

- [ ] **Step 2: `EstoqueProdutoEditavel.tsx`**

Create `apps/studiold/app/configuracoes/EstoqueProdutoEditavel.tsx` — clone verbatim de `EstoqueEditavel.tsx`, trocando só o import e a chamada:

```tsx
"use client";

// Estoque do produto editável inline (mesmo padrão de EstoqueEditavel das
// cortesias). Grava a quantidade absoluta.

import { useRef, useState, useTransition } from "react";
import { definirProdutoEstoque } from "./actions";
import styles from "@/app/agenda/agenda.module.css";

export function EstoqueProdutoEditavel({
  id,
  valor,
  nome,
}: {
  id: string;
  valor: number;
  nome: string;
}) {
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  function salvar() {
    const v = Number(ref.current?.value);
    setEditando(false);
    if (!Number.isInteger(v) || v < 0 || v === valor) return;
    iniciar(() => {
      definirProdutoEstoque(id, v);
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        className={styles.cfgEstoqueNum}
        onClick={() => setEditando(true)}
        disabled={pendente}
        aria-label={`Editar estoque de ${nome}, atual ${valor}`}
      >
        {pendente ? "…" : valor}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      min={0}
      max={99999}
      defaultValue={valor}
      autoFocus
      className={styles.cfgEstoqueEdit}
      aria-label={`Estoque de ${nome}`}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditando(false);
        }
      }}
    />
  );
}
```

- [ ] **Step 3: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: limpos. `EstoqueProdutoEditavel` ainda não é importado por ninguém — sem erro por isso.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/app/configuracoes/actions.ts apps/studiold/app/configuracoes/EstoqueProdutoEditavel.tsx
git commit -m "feat: Server Actions de produtos + estoque de produto editável"
```

---

### Task 4: Seção "Produtos" em `/configuracoes`

**Files:**
- Modify: `apps/studiold/app/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `criarProduto`/`editarProduto`/`toggleProdutoAtivo` e `EstoqueProdutoEditavel` (Task 3); `fmtPreco` de `@/lib/agenda/time` (já importado na page).
- Produces: `Icon name="box"` (adicionado no Step 1 abaixo — primeiro uso do glyph).

- [ ] **Step 1: `Icon.tsx` — glyph `box`**

Em `apps/studiold/components/agenda/Icon.tsx`:

1a. Na union `Name`, adicionar `| "box"` (perto de `"cash"`).

1b. No record de glyphs, adicionar (mesmo formato dos outros — conteúdo do `<svg>` que o componente embrulha; `viewBox` 24, stroke):
```tsx
  box: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
```

- [ ] **Step 2: Fetch**

Em `apps/studiold/app/configuracoes/page.tsx`, no `const [cRes, eRes, sRes, hRes, bRes] = await Promise.all([...])`:

1a. Adicionar `pRes` ao destructuring e a query ao array (depois da de `servicos`):
```ts
    db
      .from("produtos")
      .select("id, nome, descricao, preco_venda, quantidade_estoque, ativo")
      .order("nome"),
```
→ `const [cRes, eRes, sRes, pRes, hRes, bRes] = await Promise.all([ ... ]);`

1b. Adicionar o guard, junto dos outros `if (xRes.error) ...`:
```ts
  if (pRes.error) throw new Error(`configuracoes/produtos: ${pRes.error.message}`);
```

1c. Adicionar o tipo e o map, junto de `servicos`:
```ts
  type Produto = {
    id: string;
    nome: string;
    descricao: string | null;
    preco_venda: number;
    quantidade_estoque: number;
    ativo: boolean;
  };
  const produtos = ((pRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    descricao: (p.descricao as string) ?? null,
    preco_venda: Number(p.preco_venda),
    quantidade_estoque: (p.quantidade_estoque as number) ?? 0,
    ativo: p.ativo as boolean,
  })) satisfies Produto[];
```

- [ ] **Step 3: `<section>` Produtos**

Inserir, DENTRO do `<main>`, logo depois do `</section>` da seção "SERVIÇOS" e antes do `<HorariosForm .../>`:

```tsx
        {/* ---- PRODUTOS ---- */}
        <section className={`${styles.cfgSection} scroll-mt-20`} id="produtos">
          <header>
            <Icon name="box" size={15} /> Produtos
          </header>

          <form action={A.criarProduto} className={styles.cfgAddbar}>
            <input
              name="nome"
              placeholder="Novo produto"
              aria-label="Nome do novo produto"
              required
              maxLength={120}
            />
            <input
              name="preco_venda"
              inputMode="decimal"
              pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
              title="Use apenas números, vírgula para centavos. Ex.: 25,90"
              placeholder="Preço (R$)"
              aria-label="Preço de venda do novo produto"
              required
            />
            <input
              name="descricao"
              placeholder="Descrição (opcional)"
              aria-label="Descrição do novo produto"
              maxLength={280}
            />
            <button
              type="submit"
              className={`${styles.btn} ${styles["btn--primary"]}`}
            >
              <Icon name="plus" size={14} /> Adicionar
            </button>
          </form>

          {produtos.length === 0 && (
            <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
              Nenhum produto cadastrado.
            </p>
          )}

          {produtos.map((p) => (
            <div
              key={p.id}
              className={styles.cfgRow}
              data-inativo={p.ativo ? undefined : "true"}
            >
              <div>
                <p className={styles.cfgRow__nome}>{p.nome}</p>
                {p.descricao && (
                  <p className={styles.cfgRow__meta}>{p.descricao}</p>
                )}
                <p className={styles.cfgRow__meta}>
                  {fmtPreco(p.preco_venda)} · Estoque:{" "}
                  <EstoqueProdutoEditavel
                    id={p.id}
                    valor={p.quantidade_estoque}
                    nome={p.nome}
                  />
                </p>
              </div>

              <div className={styles.cfgRow__acoes}>
                <form action={A.toggleProdutoAtivo}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="ativo" value={String(!p.ativo)} />
                  <button
                    type="submit"
                    className={styles.cfgSwitch}
                    data-on={p.ativo}
                    aria-label={`${p.ativo ? "Desativar" : "Ativar"} ${p.nome}`}
                  />
                </form>
              </div>

              <details className={styles.cfgEdit}>
                <summary
                  className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
                >
                  Editar
                </summary>
                <form action={A.editarProduto}>
                  <input type="hidden" name="id" value={p.id} />
                  <input
                    name="nome"
                    defaultValue={p.nome}
                    aria-label={`Nome de ${p.nome}`}
                    required
                    maxLength={120}
                  />
                  <input
                    name="preco_venda"
                    inputMode="decimal"
                    pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
                    title="Use apenas números, vírgula para centavos. Ex.: 25,90"
                    defaultValue={String(p.preco_venda).replace(".", ",")}
                    aria-label={`Preço de ${p.nome}`}
                    required
                  />
                  <input
                    name="descricao"
                    defaultValue={p.descricao ?? ""}
                    placeholder="Descrição"
                    aria-label={`Descrição de ${p.nome}`}
                    maxLength={280}
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

E adicionar o import do componente ao topo de `page.tsx`:
```ts
import { EstoqueProdutoEditavel } from "./EstoqueProdutoEditavel";
```

- [ ] **Step 4: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: limpos, `agenda.check: OK`, 7 rotas.

- [ ] **Step 5: Conferência manual (anotar no report, não bloqueia)**

Descrever: com a migration aplicada, abrir `/configuracoes`, seção Produtos: adicionar um produto, editar preço/descrição, alternar ativo, editar estoque inline. (Sem a migration a seção quebra em runtime — anotar como pré-requisito.)

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/components/agenda/Icon.tsx apps/studiold/app/configuracoes/page.tsx
git commit -m "feat: seção Produtos em /configuracoes + ícone box"
```

---

### Task 5: Itens no pagamento — drawer + reducer + action + RPC + call-sites

Uma fatia vertical: o `PagamentoDrawer` passa a montar itens e esse payload flui até a RPC v2. Feita numa task só porque o gate só fica verde com todas as pontas ligadas.

**Files:**
- Modify: `apps/studiold/lib/agenda/load.ts`
- Modify: `apps/studiold/components/agenda/PagamentoDrawer.tsx`
- Modify: `apps/studiold/lib/agenda/reducer.ts`
- Modify: `apps/studiold/lib/agenda/store.tsx`
- Modify: `apps/studiold/app/agenda/actions.ts`
- Modify: `apps/studiold/components/agenda/Ficha.tsx`
- Modify: `apps/studiold/components/agenda/HeroFicha.tsx`

**Interfaces:**
- Consumes: `Produto` de `@/lib/agenda/types` e `somaItens`/`ItemPagamento` de `@/lib/agenda/pagamento` (Task 2); a assinatura da RPC v2 da Task 1 (`fn_concluir_atendimento(uuid, numeric, text, uuid, jsonb)`).
- Produces:
  ```ts
  // PagamentoDrawer — nova forma das props e do onConfirmar
  export function PagamentoDrawer(props: {
    valorSugerido: number;
    servicoId: string;
    servicoNome: string;
    cortesiaIdInicial?: string;
    onConfirmar: (p: {
      valor: number;
      forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
      cortesiaId?: string;
      itens: { tipo: "servico" | "produto"; refId: string; descricao: string; quantidade: number; precoUnitario: number }[];
    }) => void;
    onClose: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: `load.ts` — carregar produtos**

Em `apps/studiold/lib/agenda/load.ts`:

1a. Adicionar `produtosRes` ao destructuring do `Promise.all` e a query (perto da de `cortesias`):
```ts
    db.from("produtos").select("id, nome, descricao, preco_venda, quantidade_estoque, ativo").eq("ativo", true).order("nome"),
```

1b. Adicionar, junto dos outros `must(...)`:
```ts
  const produtosRows = must(produtosRes, "produtos") as Row[];
```

1c. No objeto `AgendaData` retornado, adicionar depois de `cortesias: cortesiasRows.map(...)`:
```ts
    produtos: produtosRows.map((p) => ({
      id: p.id as string,
      nome: p.nome as string,
      descricao: (p.descricao as string) ?? undefined,
      preco_venda: Number(p.preco_venda),
      quantidade_estoque: (p.quantidade_estoque as number) ?? 0,
      ativo: p.ativo as boolean,
    })),
```

- [ ] **Step 2: `PagamentoDrawer.tsx` — reescrever**

Substituir `apps/studiold/components/agenda/PagamentoDrawer.tsx` por:

```tsx
"use client";

// Drawer de conclusão: valor cobrado, forma de pagamento, cortesia e a lista
// de itens (serviço principal fixo + serviços extras + produtos). Total corrente
// espelha o campo de valor até o barbeiro editá-lo à mão. Presentational.

import { useMemo, useState, type FormEvent } from "react";
import { useAgenda } from "@/lib/agenda/store";
import { somaItens, type ItemPagamento } from "@/lib/agenda/pagamento";
import { fmtPreco } from "@/lib/agenda/time";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

type Forma = "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";

const FORMAS: { key: Forma; label: string }[] = [
  { key: "pix", label: "Pix" },
  { key: "cartao_debito", label: "Cartão débito" },
  { key: "cartao_credito", label: "Cartão crédito" },
  { key: "dinheiro", label: "Dinheiro" },
];

const brl = (n: number) => n.toFixed(2).replace(".", ",");
const parseBRL = (t: string) => {
  const s = t.trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return { n, ok: s !== "" && Number.isFinite(n) && n >= 0 };
};

let seq = 0;
const novaKey = () => `it-${++seq}`;

export function PagamentoDrawer({
  valorSugerido,
  servicoId,
  servicoNome,
  cortesiaIdInicial,
  onConfirmar,
  onClose,
}: {
  valorSugerido: number;
  servicoId: string;
  servicoNome: string;
  cortesiaIdInicial?: string;
  onConfirmar: (p: {
    valor: number;
    forma: Forma;
    cortesiaId?: string;
    itens: {
      tipo: "servico" | "produto";
      refId: string;
      descricao: string;
      quantidade: number;
      precoUnitario: number;
    }[];
  }) => void;
  onClose: () => void;
}) {
  const { state } = useAgenda();
  const { data } = state;

  const [itens, setItens] = useState<ItemPagamento[]>(() => [
    {
      key: novaKey(),
      tipo: "servico",
      refId: servicoId,
      descricao: servicoNome,
      quantidade: 1,
      precoUnitario: valorSugerido,
      fixo: true,
    },
  ]);
  const total = somaItens(itens);

  const [valorTxt, setValorTxt] = useState(brl(valorSugerido));
  const [valorAuto, setValorAuto] = useState(true);
  const [forma, setForma] = useState<Forma | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(
    cortesiaIdInicial ?? null,
  );
  const [enviando, setEnviando] = useState(false);

  // reescreve o campo de valor com o total enquanto o barbeiro não o tocar
  const setItensERecalc = (prox: ItemPagamento[]) => {
    setItens(prox);
    if (valorAuto) setValorTxt(brl(somaItens(prox)));
  };
  const patchItem = (key: string, p: Partial<ItemPagamento>) =>
    setItensERecalc(itens.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const removerItem = (key: string) =>
    setItensERecalc(itens.filter((i) => i.key !== key));

  const addServico = (id: string) => {
    const s = data.servicos.find((x) => x.id === id);
    if (!s) return;
    setItensERecalc([
      ...itens,
      { key: novaKey(), tipo: "servico", refId: s.id, descricao: s.nome, quantidade: 1, precoUnitario: s.preco, fixo: false },
    ]);
  };
  const addProduto = (id: string) => {
    const p = data.produtos.find((x) => x.id === id);
    if (!p) return;
    setItensERecalc([
      ...itens,
      { key: novaKey(), tipo: "produto", refId: p.id, descricao: p.nome, quantidade: 1, precoUnitario: p.preco_venda, fixo: false },
    ]);
  };

  const produtosDisponiveis = useMemo(
    () => data.produtos.filter((p) => p.quantidade_estoque > 0),
    [data.produtos],
  );
  const estoqueDe = (refId: string) =>
    data.produtos.find((p) => p.id === refId)?.quantidade_estoque ?? 0;

  const cortesias = useMemo(() => {
    const ativas = data.cortesias.filter((c) => c.ativo && c.quantidade_estoque > 0);
    if (cortesiaIdInicial && !ativas.some((c) => c.id === cortesiaIdInicial)) {
      const inicial = data.cortesias.find((c) => c.id === cortesiaIdInicial);
      if (inicial) return [inicial, ...ativas];
    }
    return ativas;
  }, [data.cortesias, cortesiaIdInicial]);

  const { n: valor, ok: valorOk } = parseBRL(valorTxt);
  const podeEnviar = valorOk && forma != null && !enviando;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || forma == null) return;
    setEnviando(true);
    onConfirmar({
      valor,
      forma,
      cortesiaId: cortesiaId ?? undefined,
      itens: itens.map((i) => ({
        tipo: i.tipo,
        refId: i.refId,
        descricao: i.descricao,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })),
    });
  };

  return (
    <Drawer titulo="Concluir atendimento" onClose={onClose}>
      <form onSubmit={enviar} className="flex min-h-full flex-col gap-4">
        {/* ITENS */}
        <div className={`${styles.field} flex flex-col gap-2`}>
          <label>Itens</label>
          {itens.map((i) => (
            <div key={i.key} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{i.descricao}</span>
              {i.tipo === "produto" ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-label={`Menos um de ${i.descricao}`}
                    onClick={() =>
                      patchItem(i.key, { quantidade: Math.max(1, i.quantidade - 1) })
                    }
                  >
                    −
                  </button>
                  <span className={styles.tnum} aria-label="quantidade">
                    {i.quantidade}
                  </span>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-label={`Mais um de ${i.descricao}`}
                    onClick={() =>
                      patchItem(i.key, {
                        quantidade: Math.min(estoqueDe(i.refId), i.quantidade + 1),
                      })
                    }
                  >
                    +
                  </button>
                </span>
              ) : (
                <span className={styles.tnum}>1×</span>
              )}
              <input
                inputMode="decimal"
                className={styles.cfgEstoqueEdit}
                value={brl(i.precoUnitario)}
                aria-label={`Preço unitário de ${i.descricao}`}
                onChange={(e) => {
                  const { n, ok } = parseBRL(e.target.value);
                  if (ok) patchItem(i.key, { precoUnitario: n });
                }}
              />
              <span className={`${styles.tnum} w-16 text-right`}>
                {fmtPreco(
                  Math.round(i.quantidade * i.precoUnitario * 100) / 100,
                )}
              </span>
              {!i.fixo && (
                <button
                  type="button"
                  className={styles.iconbtn}
                  aria-label={`Remover ${i.descricao}`}
                  onClick={() => removerItem(i.key)}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <select
              aria-label="Adicionar serviço"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addServico(e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">+ Serviço</option>
              {data.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Adicionar produto"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addProduto(e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">+ Produto</option>
              {produtosDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.quantidade_estoque})
                </option>
              ))}
            </select>
          </div>

          <p className={`${styles.slip__meta} text-right`}>
            Total dos itens: {fmtPreco(total)}
          </p>
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="pag-valor">Valor cobrado (R$)</label>
          <input
            id="pag-valor"
            inputMode="decimal"
            value={valorTxt}
            onChange={(e) => {
              setValorAuto(false);
              setValorTxt(e.target.value);
            }}
            autoComplete="off"
          />
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Forma de pagamento</label>
          <div className={styles.pagFormas} role="radiogroup" aria-label="Forma de pagamento">
            {FORMAS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={styles.chip}
                data-on={forma === f.key}
                role="radio"
                aria-checked={forma === f.key}
                onClick={() => setForma(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Cortesia (opcional)</label>
          <div className={styles.chips} role="radiogroup" aria-label="Cortesia">
            <button
              type="button"
              className={styles.chip}
              data-on={cortesiaId === null}
              role="radio"
              aria-checked={cortesiaId === null}
              onClick={() => setCortesiaId(null)}
            >
              Nenhuma
            </button>
            {cortesias.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.chip}
                data-on={cortesiaId === c.id}
                role="radio"
                aria-checked={cortesiaId === c.id}
                onClick={() => setCortesiaId(c.id)}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pagDock}>
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center`}
            disabled={!podeEnviar}
          >
            <Icon name="check" size={15} /> Concluir e registrar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
```

> As Steps 3–6 abaixo (reducer, store, action, call-sites) são parte desta mesma task — o payload novo do drawer só fecha o ciclo quando todos estiverem no lugar. NÃO rode o gate nem commite entre o Step 2 e o Step 7: o typecheck fica vermelho no meio (o `Action` ainda não tem `itens`, os call-sites ainda não passam as props). Faça os 6 primeiros steps, depois o gate único (Step 7) e o commit (Step 9).

- [ ] **Step 3: `reducer.ts` — action `CONCLUIR_PAGAMENTO` ganha `itens`**

No union `Action`, trocar o membro `CONCLUIR_PAGAMENTO` por:
```ts
  | {
      type: "CONCLUIR_PAGAMENTO";
      agId: string;
      valor: number;
      forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
      cortesiaId?: string;
      itens: {
        tipo: "servico" | "produto";
        refId: string;
        descricao: string;
        quantidade: number;
        precoUnitario: number;
      }[];
    }
```

No `case "CONCLUIR_PAGAMENTO":`, além da baixa de cortesia já existente, baixar estoque dos produtos vendidos. Logo antes do `return avisar({ ... })`, calcular:
```ts
      const baixaProduto = new Map<string, number>();
      for (const it of action.itens) {
        if (it.tipo === "produto") {
          baixaProduto.set(
            it.refId,
            (baixaProduto.get(it.refId) ?? 0) + it.quantidade,
          );
        }
      }
      const produtos = baixaProduto.size
        ? d.produtos.map((p) =>
            baixaProduto.has(p.id)
              ? {
                  ...p,
                  quantidade_estoque: Math.max(
                    0,
                    p.quantidade_estoque - (baixaProduto.get(p.id) ?? 0),
                  ),
                }
              : p,
          )
        : d.produtos;
```
E incluir `produtos,` no objeto `data: { ...d, cortesias, produtos, agendamentos: ... }`.

- [ ] **Step 4: `store.tsx` — repassar `itens`**

No `persistir`, `case "CONCLUIR_PAGAMENTO":`:
```ts
    case "CONCLUIR_PAGAMENTO":
      return concluirAtendimento(
        action.agId,
        action.valor,
        action.forma,
        action.cortesiaId,
        action.itens,
      );
```

- [ ] **Step 5: `actions.ts` — `concluirAtendimento` nova assinatura**

Substituir a função `concluirAtendimento` em `apps/studiold/app/agenda/actions.ts` por:

```ts
type ItemRPC = {
  tipo: "servico" | "produto";
  refId: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
};

export async function concluirAtendimento(
  agId: string,
  valor: number,
  forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro",
  cortesiaId?: string,
  itens: ItemRPC[] = [],
): Promise<R> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(agId)) {
    return { ok: false, error: "id de agendamento inválido" };
  }
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: "valor inválido" };
  }
  if (!["pix", "cartao_debito", "cartao_credito", "dinheiro"].includes(forma)) {
    return { ok: false, error: "forma de pagamento inválida" };
  }
  const cor = /^[0-9a-f-]{36}$/i.test(cortesiaId ?? "") ? cortesiaId! : null;

  const pItens = [];
  for (const it of itens) {
    if (it.tipo !== "servico" && it.tipo !== "produto") {
      return { ok: false, error: "item com tipo inválido" };
    }
    if (!/^[0-9a-f-]{36}$/i.test(it.refId)) {
      return { ok: false, error: "item com referência inválida" };
    }
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1 || it.quantidade > 99) {
      return { ok: false, error: "quantidade de item inválida" };
    }
    if (!Number.isFinite(it.precoUnitario) || it.precoUnitario < 0) {
      return { ok: false, error: "preço de item inválido" };
    }
    pItens.push({
      tipo: it.tipo,
      ref_id: it.refId,
      descricao: (it.descricao ?? "").slice(0, 120),
      quantidade: it.quantidade,
      preco_unitario: it.precoUnitario,
    });
  }

  const { error } = await tenantDb().rpc("fn_concluir_atendimento", {
    p_agendamento_id: agId,
    p_valor: valor,
    p_forma_pagamento: forma,
    p_cortesia_id: cor,
    p_itens: pItens,
  });
  return error ? falha(error, "concluirAtendimento") : { ok: true };
}
```

- [ ] **Step 6: `Ficha.tsx` e `HeroFicha.tsx` — call-sites**

Nos dois arquivos:

4a. O tipo do callback `confirmarPagamento` ganha `itens`:
```ts
  const confirmarPagamento = (p: {
    valor: number;
    forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
    cortesiaId?: string;
    itens: {
      tipo: "servico" | "produto";
      refId: string;
      descricao: string;
      quantidade: number;
      precoUnitario: number;
    }[];
  }) => {
```
(o corpo já faz `dispatch({ type: "CONCLUIR_PAGAMENTO", agId: ag.id, ...p })` — o spread carrega `itens`.)

4b. O `<PagamentoDrawer .../>` ganha as props novas. Em `Ficha.tsx` e `HeroFicha.tsx`:
```tsx
        <PagamentoDrawer
          valorSugerido={servico?.preco ?? 0}
          servicoId={servico?.id ?? ""}
          servicoNome={servico?.nome ?? "Serviço"}
          cortesiaIdInicial={ag.cortesia_id}
          onConfirmar={confirmarPagamento}
          onClose={() => setPagando(false)}
        />
```
- [ ] **Step 7: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`, 7 rotas. (Este é o primeiro gate desde o Step 2 — se algo intermediário quebrou, é aqui que aparece.)

- [ ] **Step 8: Conferência manual (anotar no report)**

Com a migration aplicada: concluir um atendimento com o serviço principal + 1 serviço extra + 2 unidades de um produto. Conferir no banco: `atendimentos.valor_cobrado` = o valor do campo; 3 linhas em `atendimento_itens` (`subtotal` certo); `produtos.quantidade_estoque` do produto baixou 2. Na UI, a baixa de estoque aparece otimista no próximo `/configuracoes` (após `router.refresh`). Conferir também o total corrente: adicionar/remover itens reescreve o campo "Valor cobrado" até editar o campo à mão; depois disso, para de espelhar.

- [ ] **Step 9: Commit**

```bash
git add apps/studiold/lib/agenda/load.ts apps/studiold/components/agenda/PagamentoDrawer.tsx apps/studiold/lib/agenda/reducer.ts apps/studiold/lib/agenda/store.tsx apps/studiold/app/agenda/actions.ts apps/studiold/components/agenda/Ficha.tsx apps/studiold/components/agenda/HeroFicha.tsx
git commit -m "feat: itens no pagamento — serviços extras + produtos, total corrente, baixa de estoque"
```

---

### Task 6: Menu Gerenciar — 5 links por âncora

**Files:**
- Modify: `apps/studiold/components/Topbar.tsx`
- Modify: `apps/studiold/app/configuracoes/page.tsx`
- Modify: `apps/studiold/app/configuracoes/HorariosForm.tsx`

**Interfaces:**
- Consumes: `Icon name="box"` (já adicionado na Task 4 Step 1).
- Produces: nada.

- [ ] **Step 1: `Topbar.tsx` — `GERENCIAR` e `ItemNav`**

1a. Na `type ItemNav`, estender a union do `icone`:
```ts
  icone: "calendar" | "cash" | "music" | "user" | "gear" | "box" | "cup" | "scissors" | "clock";
```

1b. Trocar o array `GERENCIAR` por:
```ts
const GERENCIAR: ItemNav[] = [
  { href: "/configuracoes#cortesias", label: "Cortesias", icone: "cup" },
  { href: "/configuracoes#produtos", label: "Produtos", icone: "box" },
  { href: "/configuracoes#estilos", label: "Estilos de música", icone: "music" },
  { href: "/configuracoes#servicos", label: "Serviços", icone: "scissors" },
  { href: "/configuracoes#horarios", label: "Horário de funcionamento", icone: "clock" },
];
```

1c. No `NavDrawer`, a função `ativo` ignora hrefs com hash:
```ts
  const ativo = (href: string) =>
    !href.includes("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));
```

- [ ] **Step 2: `page.tsx` — `id` + `scroll-mt-20` nas seções**

Nas 3 `<section className={styles.cfgSection}>` já existentes, adicionar `id` e a classe:
- Cortesias: `className={`${styles.cfgSection} scroll-mt-20`} id="cortesias"`
- Estilos de música: `className={`${styles.cfgSection} scroll-mt-20`} id="estilos"`
- Serviços: `className={`${styles.cfgSection} scroll-mt-20`} id="servicos"`
(A de Produtos, da Task 4, já tem `id="produtos"` e `scroll-mt-20`.)

- [ ] **Step 3: `HorariosForm.tsx` — `id="horarios"`**

Na `<section className={styles.cfgSection}>` externa do `HorariosForm`, adicionar `id="horarios"` e `scroll-mt-20`:
```tsx
    <section className={`${styles.cfgSection} scroll-mt-20`} id="horarios">
```

- [ ] **Step 4: Gate**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro limpos, `agenda.check: OK`, 7 rotas.

- [ ] **Step 5: Conferência manual (anotar no report)**

Abrir o drawer de navegação → os 5 links de "Gerenciar" aparecem; clicar cada um rola `/configuracoes` até a seção certa, sem ficar sob o topbar.

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/components/Topbar.tsx apps/studiold/app/configuracoes/page.tsx apps/studiold/app/configuracoes/HorariosForm.tsx
git commit -m "feat: menu Gerenciar em 5 links por âncora"
```

---

## Self-Review

**1. Cobertura da spec:**
- Tabela `produtos` → Task 1. Seção CRUD → Task 3 (actions) + Task 4 (UI). `definirProdutoEstoque` + inline edit → Task 3.
- `atendimento_itens` + `fn_concluir_atendimento` v2 → Task 1. Itens extras no drawer (serviço extra + produto, total corrente, campo livre com `valorAuto`), baixa de estoque (RPC + otimista no reducer), payload ponta a ponta (drawer → reducer → store → action → RPC) → Task 5 (fatia vertical única).
- `load.ts` carrega produtos → Task 5. `AgendaData.produtos` + `Produto` → Task 2.
- Menu em 5 âncoras + `id`/`scroll-mt-20` → Task 6. Ícone `box` → Task 4 Step 1.
- `somaItens` puro + testado → Task 2.
- `/financeiro` não muda: nenhuma task toca `app/financeiro/`.
- Sem gaps.

**2. Placeholder scan:** sem "TBD/TODO"; cada step de código tem o bloco real. A Task 5 é a única com gate diferido no meio (Steps 3–6 antes do gate do Step 7) — explicitado no corpo da task, é uma fatia vertical que não fecha pela metade. A Task 4 cria o glyph `box` antes de usá-lo (Step 1), sem dependência de ordem entre tasks.

**3. Consistência de tipos:**
- `Produto { id; nome; descricao?; preco_venda: number; quantidade_estoque: number; ativo: boolean }` — Task 2 define em `types.ts`; Task 4 redefine um `type Produto` local só pra `satisfies` do map da page (campos compatíveis, `descricao: string | null` na page vs `descricao?: string` no tipo global — a page não passa esse objeto pro store, é só render); Task 5 monta o objeto do `AgendaData` com `descricao: ... ?? undefined` batendo no tipo global.
- `ItemPagamento { key; tipo; refId; descricao; quantidade; precoUnitario; fixo }` — Task 2 define; Task 5 usa no estado do drawer.
- Payload do `onConfirmar` / `CONCLUIR_PAGAMENTO` / `concluirAtendimento` / `ItemRPC`: os 5 campos `{ tipo, refId, descricao, quantidade, precoUnitario }` idênticos em Task 5 (drawer), Task 6 Step 1 (action union), Task 6 Step 3 (`ItemRPC`), Task 6 Step 4 (call-sites). A action converte pra snake (`ref_id`, `preco_unitario`) antes da RPC — a RPC (Task 1) lê `v_item->>'ref_id'` e `v_item->>'preco_unitario'`.
- `fn_concluir_atendimento(uuid, numeric, text, uuid, jsonb)` — assinatura idêntica no rascunho (Task 1) e na chamada `rpc(...)` (Task 6 Step 3): `p_agendamento_id, p_valor, p_forma_pagamento, p_cortesia_id, p_itens`.
- `definirProdutoEstoque(id: string, quantidade: number)` — Task 3 define; Task 3 `EstoqueProdutoEditavel` consome.
- `Icon name` — `box` adicionado em Task 7 Step 1 (union + glyph); usado em Task 4 (com fallback documentado) e Task 7 Step 2b. `check`, `x`, `plus`, `cup`, `music`, `scissors`, `clock` já existem.
- `somaItens` / `fmtPreco` / `parsePrecoBRL` — assinaturas inalteradas, importadas onde usadas.
