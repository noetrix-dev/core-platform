# Drawer de Pagamento na Conclusão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao concluir um atendimento na agenda, abrir um drawer que coleta valor cobrado, forma de pagamento e cortesia servida, e persistir tudo numa transação (`atendimentos` + status `concluido` + baixa de estoque da cortesia).

**Architecture:** O botão "Concluir" (em `Ficha.tsx` e `HeroFicha.tsx`, no ramo `em_atendimento`) passa a abrir um `PagamentoDrawer` local à ficha em vez de despachar direto. O drawer é presentational: coleta os campos e chama `onConfirmar(payload)`; a ficha despacha `CONCLUIR_PAGAMENTO` (com o carimbo/animação) e o `store` chama o server action `concluirAtendimento`, que executa a RPC `fn_concluir_atendimento` (transação plpgsql). A baixa de estoque de cortesia sai do momento do agendamento e passa a acontecer só na conclusão — a cortesia no agendamento vira intenção. O reducer segue puro; a conclusão é a fonte de verdade do que foi consumido.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), React 19, `@supabase/supabase-js` (service-role, server-only), CSS Modules escopados (`agenda.module.css`), Postgres/Supabase schema `barbearia_001`.

**Spec:** Design aprovado no chat de brainstorming (classificado como bounded; sem arquivo de spec). Resumo:
- Decisão 1: integridade das 3 escritas → **RPC transacional** (`fn_concluir_atendimento`), no padrão de `fn_cancelar_agendamento` / `fn_confirmar_fila`.
- Decisão 2: contabilidade de cortesia → **conclusão é a verdade**. Adicionar `atendimentos.cortesia_id`; baixar estoque na conclusão; remover a baixa do momento do agendamento.
- Drawer: campos na ordem valor → forma → cortesia; forma como grid 2×2 de alvos grandes; botão final sticky no rodapé; mobile one-handed.
- Erros: RPC falha → aviso + `router.refresh()` (HYDRATE reverte). Duplo submit bloqueado por flag local.

## Global Constraints

- Toda a UI, labels, `aviso` e mensagens em **pt-BR**.
- `infra/supabase/migrations/**` é **caminho protegido** (hook `block-protected-paths.sh`): a migration é entregue como rascunho em `docs/` e aplicada à mão pelo usuário. NÃO tentar escrever em `infra/supabase/migrations/`.
- `apps/studiold/app/globals.css` fica **como está**. Estilo novo vive em `agenda.module.css` (CSS Module escopado).
- O **reducer permanece puro** — sem I/O, sem `Date.now()` fora de `TICK`/ações que já usam, sem chamadas assíncronas.
- Seguir os padrões existentes: `components/agenda/Drawer.tsx` (slide-over), `components/agenda/AgendarDrawer.tsx` (drawer de formulário com `useAgenda`), chips `styles.chip` com `data-on`.
- **Sem framework de teste de componente** neste repo. Lógica pura é testada em `lib/agenda/agenda.check.ts` (asserts do `node:assert/strict`, rodado com `node --experimental-strip-types`). Componentes, server actions e SQL são verificados por `pnpm typecheck` + `pnpm lint` + `pnpm build` (e `pnpm --filter studiold check` para a lógica).
- Não é possível testar a RPC contra o banco real nesta máquina (projeto linkado fora do alcance do MCP). O server action e a RPC são verificados por typecheck/build; a validação funcional fica com o usuário após aplicar a migration.
- Checklist de conclusão (raiz `CLAUDE.md`): `pnpm typecheck`, `pnpm lint`, `pnpm build` sem erros; nenhum secret no working tree.
- Todos os comandos rodam a partir da raiz do monorepo (`/home/ewerton/projects/core-platform`), salvo indicação. `pnpm --filter studiold <script>` mira o app.

---

## File Structure

**Criar:**
- `docs/migration-concluir-atendimento.sql` — rascunho: coluna `atendimentos.cortesia_id` + função `fn_concluir_atendimento`. Aplicado à mão.
- `apps/studiold/components/agenda/PagamentoDrawer.tsx` — client component. Coleta valor / forma / cortesia; chama `onConfirmar`. Não despacha nem faz I/O.

**Modificar:**
- `apps/studiold/lib/agenda/reducer.ts` — remover baixa de estoque do `case "AGENDAR"`; trocar `case "CONCLUIR"` por `case "CONCLUIR_PAGAMENTO"`; atualizar a union `Action`.
- `apps/studiold/lib/agenda/store.tsx` — `persistir`: trocar `case "CONCLUIR"` por `case "CONCLUIR_PAGAMENTO"` → `concluirAtendimento(...)`; ajustar o import de `@/app/agenda/actions`.
- `apps/studiold/app/agenda/actions.ts` — remover o bloco read-modify-write de estoque do `agendar`; adicionar `concluirAtendimento(agId, valor, forma, cortesiaId?)`.
- `apps/studiold/components/agenda/Ficha.tsx` — ramo `confirmado && em_atendimento`: botão "Concluir" abre `PagamentoDrawer`; carimbo dispara no `onConfirmar`.
- `apps/studiold/components/agenda/HeroFicha.tsx` — ramo `naCadeira`: idem.
- `apps/studiold/app/agenda/agenda.module.css` — `+.pagFormas` (grid 2×2) e `+.pagDock` (rodapé sticky).
- `apps/studiold/lib/agenda/agenda.check.ts` — novos asserts para `CONCLUIR_PAGAMENTO` e para "AGENDAR não mexe em estoque".

**Sem mudança:** `lib/agenda/types.ts` (`Agendamento` já tem `cortesia_id?` / `cortesia_nome?`; `Atendimento` não é tipado no app), `lib/agenda/seed.ts`, `lib/agenda/load.ts` (o `/financeiro` já lê cortesia via `agendamentos(cortesias(nome))`; a coluna nova em `atendimentos` é opcional e não quebra a leitura atual).

---

## Task 1: Rascunho da migration (coluna + RPC transacional)

**Files:**
- Create: `docs/migration-concluir-atendimento.sql`

**Interfaces:**
- Consumes: nada.
- Produces: a função `barbearia_001.fn_concluir_atendimento(p_agendamento_id uuid, p_valor numeric, p_forma_pagamento text, p_cortesia_id uuid) returns uuid` e a coluna `barbearia_001.atendimentos.cortesia_id uuid`. A Task 3 (`concluirAtendimento`) chama essa RPC por nome.

- [ ] **Step 1: Criar o arquivo de rascunho**

Create `docs/migration-concluir-atendimento.sql`:

```sql
-- RASCUNHO. infra/supabase/migrations/ é protegido — criar à mão:
--   pnpm supabase migration new concluir_atendimento
--   colar o conteúdo abaixo, revisar, pnpm supabase db push
--
-- Conclusão do atendimento numa transação: grava atendimentos, marca o
-- agendamento como concluido e baixa 1 no estoque da cortesia servida.
-- A cortesia servida também é sincronizada em agendamentos.cortesia_id.
-- ============================================================================

ALTER TABLE barbearia_001.atendimentos
  ADD COLUMN IF NOT EXISTS cortesia_id UUID REFERENCES barbearia_001.cortesias(id);

create or replace function barbearia_001.fn_concluir_atendimento(
  p_agendamento_id  uuid,
  p_valor           numeric,
  p_forma_pagamento text,
  p_cortesia_id     uuid
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_servico_id uuid;
  v_status     text;
  v_atend_id   uuid;
begin
  if p_valor is null or p_valor < 0 then
    raise exception 'valor inválido: %', p_valor;
  end if;
  if p_forma_pagamento not in ('pix','cartao_debito','cartao_credito','dinheiro') then
    raise exception 'forma de pagamento inválida: %', p_forma_pagamento;
  end if;

  select cliente_id, servico_id, status
    into v_cliente_id, v_servico_id, v_status
    from barbearia_001.agendamentos
   where id = p_agendamento_id
     for update;

  if v_cliente_id is null then
    raise exception 'agendamento % não encontrado', p_agendamento_id;
  end if;
  if v_status = 'concluido' then
    raise exception 'agendamento % já concluído', p_agendamento_id;
  end if;

  insert into barbearia_001.atendimentos
    (agendamento_id, cliente_id, servico_id, valor_cobrado, forma_pagamento, cortesia_id, realizado_em)
  values
    (p_agendamento_id, v_cliente_id, v_servico_id, p_valor, p_forma_pagamento, p_cortesia_id, now())
  returning id into v_atend_id;

  update barbearia_001.agendamentos
     set status = 'concluido',
         cortesia_id = p_cortesia_id,
         atualizado_em = now()
   where id = p_agendamento_id;

  if p_cortesia_id is not null then
    update barbearia_001.cortesias
       set quantidade_estoque = greatest(0, quantidade_estoque - 1)
     where id = p_cortesia_id;
  end if;

  return v_atend_id;
end;
$$;

grant execute on function
  barbearia_001.fn_concluir_atendimento(uuid, numeric, text, uuid) to service_role;
```

- [ ] **Step 2: Conferir contra o schema**

Ler `infra/supabase/migrations/20260825000002_create_schema_barbearia_001.sql` e confirmar:
- `atendimentos` tem `agendamento_id, cliente_id, servico_id, valor_cobrado, forma_pagamento, realizado_em` (a RPC insere nesses + `cortesia_id` novo).
- `agendamentos` tem `status`, `atualizado_em`, e `cortesia_id` (adicionado na migration `cortesias_musicas_preferencias`, rascunho em `docs/migration-cortesias-musicas-preferencias.sql`).
- `cortesias` tem `quantidade_estoque`.
Expected: todos presentes. A RPC depende da migration de cortesias já aplicada.

- [ ] **Step 3: Commit**

```bash
git add docs/migration-concluir-atendimento.sql
git commit -m "docs: rascunho de migration — fn_concluir_atendimento + atendimentos.cortesia_id"
```

---

## Task 2: Tirar a baixa de estoque do agendamento

**Files:**
- Modify: `apps/studiold/lib/agenda/reducer.ts` (case `AGENDAR`)
- Modify: `apps/studiold/app/agenda/actions.ts` (função `agendar`)
- Test: `apps/studiold/lib/agenda/agenda.check.ts`

**Interfaces:**
- Consumes: `initState`, `reducer`, `vagasLivres` (já importados no check).
- Produces: comportamento — `reducer` com `{ type: "AGENDAR", ..., cortesiaId }` NÃO altera mais `state.data.cortesias`. `agendar` server action não faz mais update em `cortesias`.

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar este bloco logo após o bloco "agendar cliente novo cadastra o cliente" (depois da linha `}` que fecha o bloco da linha ~68):

```ts
// --- AGENDAR não mexe mais no estoque de cortesia ---------------------
{
  let s = initState(DIA);
  const cor = s.data.cortesias.find((c) => c.quantidade_estoque > 0)!;
  const estoque0 = cor.quantidade_estoque;
  const vaga = vagasLivres(s.data, DIA, 30)[0];
  s = reducer(s, {
    type: "AGENDAR",
    origem: "whatsapp",
    nome: "Teste Cortesia",
    telefone: "+55 11 90000-9999",
    servicoId: "svc-corte",
    cortesiaId: cor.id,
    inicioMin: vaga,
  });
  const corDepois = s.data.cortesias.find((c) => c.id === cor.id)!;
  assert.equal(
    corDepois.quantidade_estoque,
    estoque0,
    "AGENDAR não baixa estoque (a baixa é na conclusão)",
  );
}
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — `AssertionError`, `corDepois.quantidade_estoque` vem `estoque0 - 1` (o reducer ainda baixa no `AGENDAR`).

- [ ] **Step 3: Remover a baixa otimista do `AGENDAR` no reducer**

Em `apps/studiold/lib/agenda/reducer.ts`, no `case "AGENDAR"`, substituir o trecho que começa em `const servico = ...` e vai até o `return avisar(...)` por:

```ts
      const servico = d.servicos.find((s) => s.id === action.servicoId)!;
      const cortesia = action.cortesiaId
        ? d.cortesias.find((c) => c.id === action.cortesiaId)
        : undefined;
      const nova: Agendamento = {
        id: crypto.randomUUID(),
        cliente_id: clienteId,
        servico_id: action.servicoId,
        inicio: isoAt(state.dayKey, action.inicioMin),
        duracao_minutos: servico.duracao_minutos,
        // na cadeira agora = presença confirmada; senão só agendado
        status: action.naCadeira ? "confirmado" : "agendado",
        origem: action.origem,
        // cortesia no agendamento é só intenção — não baixa estoque aqui
        cortesia_id: action.cortesiaId,
        cortesia_nome: cortesia?.nome,
        em_atendimento: action.naCadeira ?? false,
      };
      const ags = action.naCadeira
        ? [...limparCadeira(d.agendamentos), nova]
        : [...d.agendamentos, nova];
      return avisar(
        { ...state, data: { ...d, clientes, agendamentos: ags } },
        action.origem === "walkin" ? "Walk-in adicionado." : "Agendamento criado.",
      );
```

(Removido: o `const cortesias = cortesia ? d.cortesias.map(...) : d.cortesias;` e o `cortesias` de dentro do objeto `data:`.)

- [ ] **Step 4: Remover a baixa de estoque do `agendar` server action**

Em `apps/studiold/app/agenda/actions.ts`, na função `agendar`, substituir o final (do `const ins = await db.from("agendamentos").insert({...})` até o `}` que fecha a função) por:

```ts
  const ins = await db.from("agendamentos").insert({
    slot_id: slot.data.id as string,
    cliente_id: clienteId,
    servico_id: p.servicoId,
    duracao_minutos: dur,
    status: p.naCadeira ? "confirmado" : "agendado",
    cortesia_id: cortesiaId,
  });
  return ins.error ? falha(ins.error, "agendar/agendamento") : { ok: true };
}
```

(Removido: o bloco `if (cortesiaId) { const cor = await db.from("cortesias")... update... }` e o comentário `// baixa de 1 no estoque...`.)

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter studiold check`
Expected: PASS — `agenda.check: OK`.

- [ ] **Step 6: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três sem erro. (`agendar` pode ficar com `dur` calculado e ainda usado no insert — ok. Se `lint` reclamar de `cortesiaId` não usado, ele ainda É usado no insert — não deve reclamar.)

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/lib/agenda/reducer.ts apps/studiold/app/agenda/actions.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "refactor: baixa de estoque de cortesia sai do agendamento (vai para a conclusão)"
```

---

## Task 3: Ação `CONCLUIR_PAGAMENTO` (reducer + store + server action)

**Files:**
- Modify: `apps/studiold/lib/agenda/reducer.ts` (union `Action`, `case "CONCLUIR"` → `case "CONCLUIR_PAGAMENTO"`)
- Modify: `apps/studiold/lib/agenda/store.tsx` (import + `persistir`)
- Modify: `apps/studiold/app/agenda/actions.ts` (nova função `concluirAtendimento`)
- Test: `apps/studiold/lib/agenda/agenda.check.ts`

**Interfaces:**
- Consumes: `fn_concluir_atendimento` (Task 1). `initState`, `reducer`, `avisar`, `upd` (internos do reducer).
- Produces:
  - Reducer `Action` ganha `{ type: "CONCLUIR_PAGAMENTO"; agId: string; valor: number; forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro"; cortesiaId?: string }` e perde `{ type: "CONCLUIR"; agId: string }`.
  - `concluirAtendimento(agId: string, valor: number, forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro", cortesiaId?: string): Promise<{ ok: true } | { ok: false; error: string }>` exportada de `app/agenda/actions.ts`. Consumida pela Task 5 (via `store.persistir`, já ligado aqui) e pelo `PagamentoDrawer` indiretamente (o drawer não a chama; a ficha despacha a ação).

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/studiold/lib/agenda/agenda.check.ts`, adicionar após o bloco da Task 2:

```ts
// --- CONCLUIR_PAGAMENTO: status, cadeira, estoque -------------------
{
  let s = initState(DIA);
  // ag-05 está em atendimento no seed, com cortesia cor-cerveja
  const cerveja0 = s.data.cortesias.find((c) => c.id === "cor-cerveja")!
    .quantidade_estoque;
  s = reducer(s, {
    type: "CONCLUIR_PAGAMENTO",
    agId: "ag-05",
    valor: 115,
    forma: "pix",
    cortesiaId: "cor-cerveja",
  });
  const ag = s.data.agendamentos.find((a) => a.id === "ag-05")!;
  assert.equal(ag.status, "concluido");
  assert.equal(ag.em_atendimento, false, "sai da cadeira ao concluir");
  const cerveja1 = s.data.cortesias.find((c) => c.id === "cor-cerveja")!
    .quantidade_estoque;
  assert.equal(cerveja1, cerveja0 - 1, "baixa 1 na cortesia servida");
  assert.match(s.aviso ?? "", /conclu/i);
}

// --- CONCLUIR_PAGAMENTO sem cortesia não mexe no estoque -----------
{
  let s = initState(DIA);
  const soma0 = s.data.cortesias.reduce((n, c) => n + c.quantidade_estoque, 0);
  s = reducer(s, {
    type: "CONCLUIR_PAGAMENTO",
    agId: "ag-05",
    valor: 100,
    forma: "dinheiro",
  });
  const soma1 = s.data.cortesias.reduce((n, c) => n + c.quantidade_estoque, 0);
  assert.equal(soma1, soma0, "sem cortesia, estoque intacto");
  assert.equal(
    s.data.agendamentos.find((a) => a.id === "ag-05")!.status,
    "concluido",
  );
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter studiold check`
Expected: FAIL — o `tsc` do runner de strip-types não checa tipo, mas o `reducer` cai no `default` (retorna o state inalterado) → `ag.status` continua `"confirmado"`, `AssertionError`.

- [ ] **Step 3: Trocar a ação na union `Action` do reducer**

Em `apps/studiold/lib/agenda/reducer.ts`, substituir a linha:

```ts
  | { type: "CONCLUIR"; agId: string }
```

por:

```ts
  | {
      type: "CONCLUIR_PAGAMENTO";
      agId: string;
      valor: number;
      forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
      cortesiaId?: string;
    }
```

- [ ] **Step 4: Trocar o `case "CONCLUIR"` no reducer**

Em `apps/studiold/lib/agenda/reducer.ts`, substituir o bloco inteiro:

```ts
    case "CONCLUIR":
      return {
        ...state,
        data: {
          ...d,
          agendamentos: upd(d.agendamentos, action.agId, {
            status: "concluido",
            em_atendimento: false,
          }),
        },
      };
```

por:

```ts
    case "CONCLUIR_PAGAMENTO": {
      const cortesia = action.cortesiaId
        ? d.cortesias.find((c) => c.id === action.cortesiaId)
        : undefined;
      const cortesias = cortesia
        ? d.cortesias.map((c) =>
            c.id === cortesia.id
              ? {
                  ...c,
                  quantidade_estoque: Math.max(0, c.quantidade_estoque - 1),
                }
              : c,
          )
        : d.cortesias;
      return avisar(
        {
          ...state,
          data: {
            ...d,
            cortesias,
            agendamentos: upd(d.agendamentos, action.agId, {
              status: "concluido",
              em_atendimento: false,
              cortesia_id: action.cortesiaId,
              cortesia_nome: cortesia?.nome,
            }),
          },
        },
        "Atendimento concluído.",
      );
    }
```

- [ ] **Step 5: Rodar o check e ver passar**

Run: `pnpm --filter studiold check`
Expected: PASS — `agenda.check: OK`.

- [ ] **Step 6: Adicionar `concluirAtendimento` no server actions**

Em `apps/studiold/app/agenda/actions.ts`, adicionar esta função ao final do arquivo (depois de `aceitarEncaixe`):

```ts
export async function concluirAtendimento(
  agId: string,
  valor: number,
  forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro",
  cortesiaId?: string,
): Promise<R> {
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

  const { error } = await tenantDb().rpc("fn_concluir_atendimento", {
    p_agendamento_id: agId,
    p_valor: valor,
    p_forma_pagamento: forma,
    p_cortesia_id: cor,
  });
  return error ? falha(error, "concluirAtendimento") : { ok: true };
}
```

(`R` e `falha` já existem no arquivo — usados por `mudarStatus`, `cancelar` etc. `tenantDb` já importado.)

- [ ] **Step 7: Ligar no `store.persistir`**

Em `apps/studiold/lib/agenda/store.tsx`:

7a. No import de `@/app/agenda/actions`, adicionar `concluirAtendimento` à lista (ordem alfabética junto dos outros: `aceitarEncaixe, agendar, bloquear, cancelar, concluirAtendimento, confirmarFila, mudarStatus, notificarFila, recusarEncaixe`).

7b. Em `persistir`, substituir:

```ts
    case "CONCLUIR":
      return mudarStatus(action.agId, "concluido");
```

por:

```ts
    case "CONCLUIR_PAGAMENTO":
      return concluirAtendimento(
        action.agId,
        action.valor,
        action.forma,
        action.cortesiaId,
      );
```

- [ ] **Step 8: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: os três sem erro. Se `typecheck` acusar `CONCLUIR` em algum lugar, é `Ficha.tsx` / `HeroFicha.tsx` — deixar para a Task 5; NÃO tocar aqui. (Se a build inteira falhar por isso, seguir mesmo assim para a Task 5 e rodar a build no fim dela; anotar no commit.)

Nota: se `typecheck` falhar em `Ficha.tsx`/`HeroFicha.tsx` por `type: "CONCLUIR"`, isso é esperado até a Task 5. Ainda assim, `reducer.ts`, `store.tsx` e `actions.ts` devem estar corretos. Confirmar rodando só o check: `pnpm --filter studiold check` (PASS).

- [ ] **Step 9: Commit**

```bash
git add apps/studiold/lib/agenda/reducer.ts apps/studiold/lib/agenda/store.tsx apps/studiold/app/agenda/actions.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat: acao CONCLUIR_PAGAMENTO + server action concluirAtendimento (RPC transacional)"
```

---

## Task 4: `PagamentoDrawer` (componente + CSS)

**Files:**
- Create: `apps/studiold/components/agenda/PagamentoDrawer.tsx`
- Modify: `apps/studiold/app/agenda/agenda.module.css` (`+.pagFormas`, `+.pagDock`)

**Interfaces:**
- Consumes: `Drawer` (`components/agenda/Drawer.tsx`, prop `titulo`/`onClose`), `Icon` (`name="check"`), `useAgenda` (só para `state.data.cortesias`), classes `styles.field`, `styles.chip`, `styles.chips`, `styles.btn`, `styles["btn--primary"]`.
- Produces:
  ```ts
  export function PagamentoDrawer(props: {
    valorSugerido: number;
    cortesiaIdInicial?: string;
    onConfirmar: (p: {
      valor: number;
      forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
      cortesiaId?: string;
    }) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  Consumida pela Task 5 (`Ficha.tsx`, `HeroFicha.tsx`).

- [ ] **Step 1: Adicionar as classes no CSS Module**

Em `apps/studiold/app/agenda/agenda.module.css`, adicionar logo antes do bloco `@media (prefers-reduced-motion: reduce) {`:

```css
/* ---- drawer de pagamento (concluir atendimento) ------------------- */
.pagFormas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.pagFormas .chip {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.7rem 0.5rem;
  font-size: 0.85rem;
  text-align: center;
}
.pagDock {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding-top: 0.9rem;
  background: linear-gradient(to top, var(--enamel) 72%, transparent);
}
```

- [ ] **Step 2: Criar o componente**

Create `apps/studiold/components/agenda/PagamentoDrawer.tsx`:

```tsx
"use client";

// Drawer de conclusão: coleta valor cobrado, forma de pagamento e cortesia
// servida. Presentational — não despacha nem faz I/O; chama onConfirmar.

import { useMemo, useState, type FormEvent } from "react";
import { useAgenda } from "@/lib/agenda/store";
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

export function PagamentoDrawer({
  valorSugerido,
  cortesiaIdInicial,
  onConfirmar,
  onClose,
}: {
  valorSugerido: number;
  cortesiaIdInicial?: string;
  onConfirmar: (p: {
    valor: number;
    forma: Forma;
    cortesiaId?: string;
  }) => void;
  onClose: () => void;
}) {
  const { state } = useAgenda();
  const { data } = state;

  const [valorTxt, setValorTxt] = useState(
    valorSugerido.toFixed(2).replace(".", ","),
  );
  const [forma, setForma] = useState<Forma | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(
    cortesiaIdInicial ?? null,
  );
  const [enviando, setEnviando] = useState(false);

  // ativas com estoque + a cortesia já escolhida no agendamento (mesmo sem estoque)
  const cortesias = useMemo(() => {
    const ativas = data.cortesias.filter(
      (c) => c.ativo && c.quantidade_estoque > 0,
    );
    if (cortesiaIdInicial && !ativas.some((c) => c.id === cortesiaIdInicial)) {
      const inicial = data.cortesias.find((c) => c.id === cortesiaIdInicial);
      if (inicial) return [inicial, ...ativas];
    }
    return ativas;
  }, [data.cortesias, cortesiaIdInicial]);

  const valor = Number(valorTxt.replace(/\./g, "").replace(",", "."));
  const valorOk = Number.isFinite(valor) && valor >= 0;
  const podeEnviar = valorOk && forma != null && !enviando;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || forma == null) return;
    setEnviando(true);
    onConfirmar({ valor, forma, cortesiaId: cortesiaId ?? undefined });
  };

  return (
    <Drawer titulo="Concluir atendimento" onClose={onClose}>
      <form onSubmit={enviar} className="flex min-h-full flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="pag-valor">Valor cobrado (R$)</label>
          <input
            id="pag-valor"
            inputMode="decimal"
            value={valorTxt}
            onChange={(e) => setValorTxt(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Forma de pagamento</label>
          <div
            className={styles.pagFormas}
            role="radiogroup"
            aria-label="Forma de pagamento"
          >
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

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build`
Expected: sem erro no `PagamentoDrawer.tsx` e no CSS. (Erros remanescentes de `CONCLUIR` em `Ficha.tsx`/`HeroFicha.tsx` são da Task 5 — anotar e seguir.)

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/components/agenda/PagamentoDrawer.tsx apps/studiold/app/agenda/agenda.module.css
git commit -m "feat: PagamentoDrawer — valor, forma de pagamento e cortesia"
```

---

## Task 5: Ligar o drawer ao botão Concluir (Ficha + HeroFicha)

**Files:**
- Modify: `apps/studiold/components/agenda/Ficha.tsx`
- Modify: `apps/studiold/components/agenda/HeroFicha.tsx`
- Test: `apps/studiold/lib/agenda/agenda.check.ts` (só roda o check completo; sem asserts novos)

**Interfaces:**
- Consumes: `PagamentoDrawer` (Task 4), `CONCLUIR_PAGAMENTO` (Task 3, via `useAgenda().dispatch`).
- Produces: comportamento — clicar "Concluir" abre o `PagamentoDrawer`; confirmar dispara o carimbo e despacha `CONCLUIR_PAGAMENTO`.

- [ ] **Step 1: `Ficha.tsx` — import e estado**

Em `apps/studiold/components/agenda/Ficha.tsx`:

1a. Adicionar aos imports:

```ts
import { PagamentoDrawer } from "./PagamentoDrawer";
```

1b. No corpo do componente, trocar o helper `concluir`:

```ts
  const concluir = () => {
    setCarimbo(true);
    setTimeout(() => dispatch({ type: "CONCLUIR", agId: ag.id }), 260);
  };
```

por:

```ts
  const [pagando, setPagando] = useState(false);

  const confirmarPagamento = (p: {
    valor: number;
    forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
    cortesiaId?: string;
  }) => {
    setPagando(false);
    setCarimbo(true);
    setTimeout(
      () => dispatch({ type: "CONCLUIR_PAGAMENTO", agId: ag.id, ...p }),
      260,
    );
  };
```

- [ ] **Step 2: `Ficha.tsx` — botão e drawer**

2a. No ramo `ag.status === "confirmado" && ag.em_atendimento`, trocar `onClick={concluir}` por `onClick={() => setPagando(true)}` no botão "Concluir".

2b. Logo antes do `</article>` de fechamento (depois do bloco `{ag.status === "concluido" && cliente && (...)}`), adicionar:

```tsx
        {pagando && (
          <PagamentoDrawer
            valorSugerido={servico?.preco ?? 0}
            cortesiaIdInicial={ag.cortesia_id}
            onConfirmar={confirmarPagamento}
            onClose={() => setPagando(false)}
          />
        )}
```

- [ ] **Step 3: `HeroFicha.tsx` — import e estado**

Em `apps/studiold/components/agenda/HeroFicha.tsx`:

3a. Adicionar aos imports:

```ts
import { PagamentoDrawer } from "./PagamentoDrawer";
```

3b. Trocar o helper `concluir`:

```ts
  const concluir = () => {
    setCarimbo(true);
    setTimeout(() => dispatch({ type: "CONCLUIR", agId: ag.id }), 300);
  };
```

por:

```ts
  const [pagando, setPagando] = useState(false);

  const confirmarPagamento = (p: {
    valor: number;
    forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
    cortesiaId?: string;
  }) => {
    setPagando(false);
    setCarimbo(true);
    setTimeout(
      () => dispatch({ type: "CONCLUIR_PAGAMENTO", agId: ag.id, ...p }),
      300,
    );
  };
```

- [ ] **Step 4: `HeroFicha.tsx` — botão e drawer**

4a. No ramo `naCadeira ? (...)`, trocar `onClick={concluir}` por `onClick={() => setPagando(true)}` no botão "Concluir atendimento".

4b. Antes do `</section>` de fechamento (depois da `<div className="mt-3 flex flex-wrap gap-2">...</div>` que fecha as ações), adicionar:

```tsx
      {pagando && (
        <PagamentoDrawer
          valorSugerido={servico?.preco ?? 0}
          cortesiaIdInicial={ag.cortesia_id}
          onConfirmar={confirmarPagamento}
          onClose={() => setPagando(false)}
        />
      )}
```

- [ ] **Step 5: Checklist completo**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold build && pnpm --filter studiold check`
Expected: os quatro sem erro. `agenda.check: OK`. Build lista 5 rotas (`/`, `/agenda`, `/configuracoes`, `/financeiro`, `_not-found`).

- [ ] **Step 6: Conferir que nenhum secret entrou e revisar o diff**

Run: `git status --porcelain && git diff --stat`
Confirmar: só arquivos de `apps/studiold/**` e `docs/**`; nada de `.env*`; nada em `infra/supabase/migrations/**`.

- [ ] **Step 7: Commit**

```bash
git add apps/studiold/components/agenda/Ficha.tsx apps/studiold/components/agenda/HeroFicha.tsx
git commit -m "feat: botao Concluir abre o drawer de pagamento (Ficha e HeroFicha)"
```

- [ ] **Step 8: Push**

```bash
git push origin main
```

---

## Notas de erro / edge cases (referência para quem implementa)

- **RPC falha na conclusão:** `store.persistir` recebe `{ ok: false }` → `dispatch({ type: "AVISO", ... })` ("Não deu para salvar. Recarregando a agenda…") + `router.refresh()`. O `HYDRATE` repuxa `status` do servidor (volta a `confirmado`). `em_atendimento` é estado de sessão (não persiste) — a ficha some da cadeira mesmo sem ter salvo; quirk pré-existente do modelo `em_atendimento`, não corrigir aqui.
- **Duplo submit:** `PagamentoDrawer` seta `enviando = true` no `enviar` e o botão fica `disabled`; a ficha faz `setPagando(false)` no `confirmarPagamento`, desmontando o drawer antes do `setTimeout` disparar.
- **Valor 0:** permitido (cortesia da casa / não cobrou). Validação é `>= 0`.
- **Valor com vírgula / ponto de milhar:** `valorTxt.replace(/\./g, "").replace(",", ".")` → `Number(...)`. Não-numérico → `Number.isFinite` falso → botão `disabled`.
- **Cortesia trocada no drawer vs a do agendamento:** a RPC grava a servida em `atendimentos.cortesia_id` E sincroniza `agendamentos.cortesia_id`; baixa só a escolhida. Nunca houve baixa no agendamento (Task 2), então não há devolução a fazer.
- **`fn_concluir_atendimento` só existe após o usuário aplicar `docs/migration-concluir-atendimento.sql`.** Até lá, concluir um atendimento retorna erro e cai no fluxo de "Não deu para salvar".

## Self-Review

**Spec coverage:**
- Drawer no clique de CONCLUIR → Task 5. Valor pré-preenchido com preço do serviço → Task 4 (`valorSugerido={servico?.preco}`), Task 5 (passagem da prop). Forma Pix/débito/crédito/dinheiro → Task 4 (`FORMAS`). Cortesia opcional → Task 4 (chips + "Nenhuma"). Insert em `atendimentos` + status `concluido` + baixa de estoque numa transação → Task 1 (RPC) + Task 3 (`concluirAtendimento`). Optimistic updates → Task 3 (reducer `CONCLUIR_PAGAMENTO`). Error handling → Task 3 (`store.persistir` já tem o padrão aviso+refresh; documentado nas notas). Mobile one-handed → Task 4 (`.pagFormas` grid 2×2, `.pagDock` sticky, `inputMode="decimal"`, sem `autoFocus`). Decisão 2 (baixa sai do agendamento) → Task 2.
- Sem lacunas.

**Placeholder scan:** nenhum "TBD/TODO/etc."; todo passo tem o código real.

**Type consistency:** `Forma` = `"pix" | "cartao_debito" | "cartao_credito" | "dinheiro"` idêntico em `reducer.ts` (union `Action`), `actions.ts` (`concluirAtendimento`), `PagamentoDrawer.tsx` (`type Forma`), `Ficha.tsx`/`HeroFicha.tsx` (`confirmarPagamento`). Ação `CONCLUIR_PAGAMENTO` com os mesmos campos (`agId`, `valor`, `forma`, `cortesiaId?`) em reducer, store (`persistir`) e nas fichas. `concluirAtendimento(agId, valor, forma, cortesiaId?)` — mesma assinatura na definição (Task 3 Step 6) e na chamada (Task 3 Step 7b). RPC `fn_concluir_atendimento` com params `p_agendamento_id, p_valor, p_forma_pagamento, p_cortesia_id` idênticos entre Task 1 (SQL) e Task 3 (`rpc(...)`).
