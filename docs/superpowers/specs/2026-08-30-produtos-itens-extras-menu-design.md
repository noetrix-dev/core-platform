# Produtos + itens extras no pagamento + menu Gerenciar — Design

## Objetivo

Três melhorias no `apps/studiold`, mesmo contexto:
1. CRUD de produtos em `/configuracoes` (tabela `barbearia_001.produtos`).
2. Itens extras no drawer de conclusão: serviços extras + produtos vendidos, com baixa de estoque e total corrente.
3. Menu "Gerenciar" do `NavDrawer` quebrado em 5 links por âncora.

## Decisões (aprovadas no chat)

- **Line items:** tabela filha `barbearia_001.atendimento_itens` (não JSON). Integridade referencial + relatório futuro por produto/serviço. `/financeiro` continua somando `atendimentos.valor_cobrado`.
- **Valor cobrado:** campo livre pré-preenchido com a soma corrente dos itens. O barbeiro pode sobrescrever (desconto/arredondar). `valor_cobrado` = o que foi cobrado; a soma dos itens pode diferir e fica registrada. Enquanto o barbeiro não editar o campo à mão, ele espelha o total (rastreado por `valorAuto`, mesma ideia do `autoCortesia` da feature anterior).
- **Serviço principal:** também vira linha em `atendimento_itens` (`tipo='servico'`). `atendimentos.servico_id` continua apontando o principal (compat). A linha do principal aparece no drawer, preço editável, **não removível**.
- **Menu:** âncoras em `/configuracoes#<secao>`, não rotas separadas. Cada `<section>` ganha `id` + `scroll-mt-20`. Zero rota nova, zero `requireUser()` novo.

## Modelo de dados (migration — rascunho pra revisão à mão)

`barbearia_001.produtos` — espelha `cortesias`:
```
id uuid pk default gen_random_uuid()
nome text not null
descricao text
preco_venda numeric(10,2) not null default 0
quantidade_estoque integer not null default 0
ativo boolean default true
criado_em timestamptz default now()
```
Sem seed.

`barbearia_001.atendimento_itens`:
```
id uuid pk default gen_random_uuid()
atendimento_id uuid not null references atendimentos(id) on delete cascade
tipo text not null check (tipo in ('servico','produto'))
servico_id uuid references servicos(id)
produto_id uuid references produtos(id)
descricao text not null            -- snapshot do nome no momento
quantidade integer not null default 1 check (quantidade > 0)
preco_unitario numeric(10,2) not null
subtotal numeric(10,2) not null
criado_em timestamptz default now()
index (atendimento_id)
```

`fn_concluir_atendimento` **v2** — `DROP` da assinatura de 4 args, `CREATE` com um arg a mais:
```
fn_concluir_atendimento(
  p_agendamento_id uuid, p_valor numeric, p_forma_pagamento text,
  p_cortesia_id uuid, p_itens jsonb
) returns uuid
```
`p_itens` = `[{"tipo":"servico"|"produto","ref_id":uuid,"descricao":text,"quantidade":int,"preco_unitario":numeric}, ...]` (inclui a linha do serviço principal).
Corpo, numa transação:
1. valida `p_forma_pagamento` no CHECK conhecido; `p_valor >= 0`.
2. `select ... for update` no agendamento; erro se não achar / já concluído.
3. `insert atendimentos (..., valor_cobrado = p_valor, cortesia_id = p_cortesia_id)` → `v_atend_id`.
4. loop `jsonb_array_elements(p_itens)`: `insert atendimento_itens` com `subtotal = quantidade * preco_unitario`; se `tipo='produto'`, `update produtos set quantidade_estoque = greatest(0, quantidade_estoque - quantidade) where id = ref_id`.
5. `update agendamentos set status='concluido', cortesia_id=p_cortesia_id, atualizado_em=now()`.
6. se `p_cortesia_id is not null`: `update cortesias set quantidade_estoque = greatest(0, quantidade_estoque - 1)` (inalterado).
7. `return v_atend_id`.
`grant execute` pra `service_role` na nova assinatura.

Uma migration cobre os três (produtos + atendimento_itens + fn v2). O caminho `infra/supabase/migrations/**` é protegido — o plano entrega o SQL como rascunho em `docs/`, o usuário roda `pnpm supabase migration new` + `db push`.

## App

### Parte 1 — Produtos em `/configuracoes`

- `lib/agenda/types.ts`: `interface Produto { id; nome; descricao?; preco_venda: number; quantidade_estoque: number; ativo: boolean }` + `AgendaData.produtos: Produto[]`.
- `app/configuracoes/actions.ts` (cada uma com `await requireUser()` no topo, padrão do arquivo):
  - `criarProduto(fd)` — `nome` trim ≤120 obrigatório; `preco_venda` via `parsePrecoBRL` (≥0); `descricao` ≤280 → insert.
  - `editarProduto(fd)` — `idDe(fd)` + os mesmos campos → update.
  - `toggleProdutoAtivo(fd)` — `idDe(fd)` + `ativo === "true"` → update.
  - `definirProdutoEstoque(id, quantidade)` — UUID + int 0–100000 → update absoluto de `quantidade_estoque` (igual `definirEstoque` das cortesias).
- `app/configuracoes/EstoqueProdutoEditavel.tsx` — clone de `EstoqueEditavel` que chama `definirProdutoEstoque`.
- `app/configuracoes/page.tsx` — +1 query no `Promise.all` (`produtos.select("id, nome, descricao, preco_venda, quantidade_estoque, ativo").order("nome")`), +guard, +map (`preco_venda: Number(...)`); nova `<section className={styles.cfgSection} id="produtos">` depois da de Serviços, espelhando a de Serviços (`.cfgAddbar` → `criarProduto`; linhas com `fmtPreco(preco_venda)` · `<EstoqueProdutoEditavel>`; toggle `.cfgSwitch` → `toggleProdutoAtivo`; `<details>` Editar → `editarProduto`). Ícone `box`.

### Parte 2 — Itens extras no `PagamentoDrawer`

- `lib/agenda/pagamento.ts` — módulo puro:
  ```ts
  export type ItemPagamento = {
    key: string;              // id local estável
    tipo: "servico" | "produto";
    refId: string;            // servico_id | produto_id
    descricao: string;
    quantidade: number;
    precoUnitario: number;
    fixo: boolean;            // true = linha do serviço principal (não removível)
  };
  export function somaItens(itens: ItemPagamento[]): number;   // Σ round(qtd*preco, 2), round 2 casas
  ```
  Testado no `agenda.check.ts`.
- `lib/agenda/load.ts` — +`produtos` no `Promise.all` (`.eq("ativo", true).order("nome")`) e no `data` retornado (`preco_venda: Number(...)`).
- `components/agenda/PagamentoDrawer.tsx`:
  - `useState<ItemPagamento[]>` iniciando com a linha fixa do serviço principal (`descricao` = nome do serviço do agendamento — vem via prop nova `servicoNome`; `refId` = `servicoId` via prop nova; `precoUnitario` = `valorSugerido`; `quantidade` 1; `fixo` true).
  - "+ Serviço" → `<select>` de `data.servicos` (todos, já são ativos no `data`) → push linha (`tipo:"servico"`, qtd 1, preço = `s.preco`, `fixo:false`).
  - "+ Produto" → `<select>` de `data.produtos` com `quantidade_estoque > 0` → push linha (`tipo:"produto"`, qtd 1, preço = `p.preco_venda`, `fixo:false`); stepper `− qtd +` com teto = estoque do produto.
  - Cada linha: descrição, qtd (stepper pra produto, fixa 1 pra serviço), `precoUnitario` `inputMode="decimal"`, subtotal `fmtPreco`, botão remover (escondido quando `fixo`).
  - `total = somaItens(itens)`. `valorAuto` (bool, começa true): quando true, `valorTxt` é reescrito pra `total.toFixed(2).replace(".", ",")` a cada mudança de itens; o `onChange` do campo de valor seta `valorAuto=false`.
  - `onConfirmar` passa `{ valor, forma, cortesiaId, itens }` onde `itens` = `itens.map(i => ({ tipo, refId, descricao, quantidade, precoUnitario }))`.
- `components/agenda/Ficha.tsx` + `HeroFicha.tsx` — passam as props novas `servicoId={servico?.id ?? ""}` e `servicoNome={servico?.nome ?? "Serviço"}`; o tipo do callback `confirmarPagamento` ganha `itens`.
- `lib/agenda/reducer.ts` — `CONCLUIR_PAGAMENTO` action ganha `itens: { tipo; refId; descricao; quantidade; precoUnitario }[]`. Otimista: além da baixa de cortesia, para cada item `tipo:"produto"` baixar `quantidade` no `d.produtos`.
- `lib/agenda/store.tsx` — `persistir` repassa `action.itens` pra `concluirAtendimento`.
- `app/agenda/actions.ts` — `concluirAtendimento(agId, valor, forma, cortesiaId?, itens)` nova assinatura. Valida: `agId`/`refId` UUID, `valor` finito ≥0, `forma` no set, cada item `tipo ∈ {servico,produto}`, `quantidade` int 1–99, `precoUnitario` finito ≥0, `descricao` ≤120. Monta `p_itens` jsonb (`ref_id`, `preco_unitario` snake). Chama `rpc("fn_concluir_atendimento", { p_agendamento_id, p_valor, p_forma_pagamento, p_cortesia_id, p_itens })`.

### Parte 3 — Menu Gerenciar

- `components/agenda/Icon.tsx` — `"box"` na union `Name` + glyph (SVG simples de caixa).
- `components/Topbar.tsx` — `GERENCIAR` vira:
  ```
  { href: "/configuracoes#cortesias", label: "Cortesias", icone: "cup" }
  { href: "/configuracoes#produtos",  label: "Produtos",  icone: "box" }
  { href: "/configuracoes#estilos",   label: "Estilos de música", icone: "music" }
  { href: "/configuracoes#servicos",  label: "Serviços",  icone: "scissors" }
  { href: "/configuracoes#horarios",  label: "Horário de funcionamento", icone: "clock" }
  ```
  `ItemNav.icone` union +`"box"`. `ativo(href)` do `NavDrawer`: quando `href` contém `#`, não marcar ativo (evita os 5 acesos em `/configuracoes`).
- `app/configuracoes/page.tsx` — `id` + `scroll-mt-20` (Tailwind) nas `<section>` de Cortesias (`#cortesias`), Estilos (`#estilos`), Serviços (`#servicos`), Produtos (`#produtos`).
- `app/configuracoes/HorariosForm.tsx` — `id="horarios"` + `scroll-mt-20` na `<section>` externa.

## Erros / edge

- Produto sem estoque não aparece no "+ Produto" do drawer. Se o estoque zerar entre o load e a conclusão, a RPC faz `greatest(0, ...)` — não vai negativo.
- `valor_cobrado` pode divergir da soma dos itens (desconto) — é esperado, `valor_cobrado` é a verdade do caixa.
- Remover todos os itens extras deixa só a linha fixa do principal — total volta pro preço do serviço.
- `p_itens` vazio nunca acontece (sempre tem a linha fixa); a RPC ainda assim tolera array vazio (loop não roda).
- Migration não aplicada → a seção de Produtos e o "+ Produto" quebram em runtime (tabela não existe). O plano marca isso: aplicar a migration antes de testar as Partes 1–2.
- Rollout: atendimentos concluídos antes desta migration não têm linhas em `atendimento_itens` — `/financeiro` não muda porque lê `atendimentos`, não os itens.

## Teste

Pura: `somaItens` (arredondamento, lista vazia, item fixo). Asserts no `agenda.check.ts`. Resto é integração (Supabase/RPC/drawer) → checklist manual no plano: cadastrar produto; concluir atendimento com 1 serviço extra + 2 un de um produto → conferir `atendimentos.valor_cobrado`, 3 linhas em `atendimento_itens`, `produtos.quantidade_estoque` baixado em 2; total corrente reflete no campo até editar à mão; os 5 links do menu rolam pra seção certa.

## Fora de escopo

Relatório de produtos vendidos; estornar/editar atendimento concluído; múltiplas cortesias ou qtd > 1 de cortesia; histórico de preço de produto; alerta de estoque baixo; carrinho persistido entre reloads do drawer; mostrar os itens de um atendimento no `/financeiro`.
