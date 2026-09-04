# Painel Financeiro Pessoal — `apps/financas` — Fase 1

Data: 2026-09-04
Status: aprovado no brainstorm, pronto para o plano de implementação

## Objetivo

Painel financeiro pessoal do Ewerton, acessível de qualquer lugar, mobile-first
obrigatório. Usuário único (sem multitenancy). Vive como app sibling no monorepo
`noetrix-platform`, reusando o padrão de dados e de autenticação já estabelecido
pelo `apps/studiold`.

A Fase 1 entrega o loop central de gestão de déficit: saber quanto entra, quanto
sai, o que vence, se o mês fecha no vermelho, e qual o tamanho do passivo. Os
demais módulos ficam para fases seguintes.

### Escopo da Fase 1

Incluído:

1. **Contas** — saldo por conta (Inter, Nubank, Bradesco, BTG).
2. **Lançamentos** — entrada de renda (CLT, freela, Noetrix), gastos por
   categoria, status pago/pendente/atrasado, compras parceladas com vencimento,
   templates recorrentes com ação "gerar mês", importação de extrato OFX.
3. **Cockpit** — saldos por conta, painel comparativo 50/30/20 sobre a renda
   recebida, saldo projetado para o fim do mês, alerta vermelho quando a projeção
   fica negativa.
4. **Dívidas** — mapa do passivo por grupo (FGTS, consignado, Serasa,
   pessoal/rotativo, família, cartões), progresso de quitação, registrar
   pagamento.

Fora da Fase 1 (registrado para não reabrir a discussão):

- **Fase 2**: Calendário de vencimentos, Cartões (faturas Inter/Nubank),
  importação de CSV por banco.
- **Fase 3**: Investimentos, Metas CLT (gatilhos Noetrix), Saúde financeira
  (score mensal).
- Sem `fin_budgets` na Fase 1 — o painel 50/30/20 é calculado a partir da renda
  recebida, não de linhas de orçamento por categoria.
- Sem `fin_month_closures` na Fase 1 — chega junto com Investimentos/Saúde, que
  precisam do histórico mês a mês.
- Sem integração Open Finance.

## Regras de negócio da anamnese (contexto, não todas implementadas na Fase 1)

As cinco regras que orientam o produto inteiro:

1. Dinheiro some sem destino — separar na hora do recebimento.
2. Pagar a si mesmo primeiro (os 20% de investimento são a primeira "conta").
3. Nunca financiar bem que deprecia.
4. Reserva de emergência antes de qualquer investimento.
5. Carro novo é luxo.

Na Fase 1 essas regras aparecem como **leitura** no Cockpit (card "pague-se
primeiro" com a meta de 20% e quanto já foi para investimento no mês), não como
automação. O 50/30/20 é painel comparativo: nenhuma linha é criada ao registrar
renda.

## Situação atual (base do seed de referência)

- Renda CLT líquida: ~R$ 4.597/mês
- Gastos fixos mapeados: ~R$ 7.091/mês
- Déficit estrutural: ~ -R$ 2.494/mês
- Dívida total: ~R$ 56.891 em 6 grupos
- Contas ativas: Inter, Nubank, Bradesco (BTG previsto no schema)

Os números do seed são ponto de partida; o Ewerton ajusta depois pela UI.

## Arquitetura

### Local e stack

`~/projects/core-platform/apps/financas`, sibling no pnpm workspace + Turborepo.
Next 16 / React 19 / Tailwind CSS 4. O `package.json` espelha o do `apps/studiold`
(mesmas dependências e os scripts `dev`, `build`, `lint`, `typecheck`, `check`).
Deploy próprio na Vercel. Fontes Barlow + Barlow Condensed, mesmo setup do
`studiold` (`next/font/google`, variáveis `--font-barlow` e `--font-barlow-cond`).

### Camada de dados (Path A)

`lib/supabase/server.ts` exporta `financasDb()`: cópia de `tenantDb()` do
`studiold` — `createClient` com a service-role key, `db: { schema: "financas" }`,
sem variável de tenant. Singleton cacheado no módulo. `throw` se o arquivo for
importado em um Client Component.

Segurança (Path A, como no `studiold`): não há RLS no schema `financas` nem no
app além do gate de sessão. O isolamento é que a service-role key nunca chega ao
browser e todo acesso ao schema passa pelo servidor. Nenhum SQL cru nos apps —
sempre query builder ou RPC.

### Autenticação

Cópia verbatim do `studiold`:

- `lib/supabase/auth.ts` — `authServer()` (server client ligado aos cookies da
  request, anon key), `requireUser()` (getUser autoritativo, redireciona para
  `/login` se não houver usuário), `getUserOpcional()`.
- `lib/supabase/client.ts` — `browserSupabase` (anon, para o form de login).
- `proxy.ts` — gate de toda rota: renova o cookie de sessão, redireciona
  não-autenticado para `/login`, `matcher` exclui assets estáticos.

Usuário único: qualquer sessão autenticada é o Ewerton. O usuário é criado à mão
no dashboard do Supabase (Authentication → Users → Add user, e-mail + senha, Auto
Confirm ON). Não há signup nem reset de senha no app. `requireUser()` roda no
topo de toda página protegida **e** no topo de toda Server Action.

### Rotas

| Rota                     | Conteúdo                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `/`                      | `redirect("/cockpit")`                                                                          |
| `/cockpit`               | saldos por conta, painel 50/30/20, saldo projetado do mês, alerta vermelho                       |
| `/lancamentos`           | lista filtrável (mês, status, conta, categoria), form de novo lançamento, ação "gerar mês"       |
| `/lancamentos/importar`  | upload de OFX, fila de revisão (categorizar e confirmar)                                          |
| `/dividas`               | mapa do passivo por grupo, progresso de quitação, registrar pagamento                            |
| `/configuracoes`         | contas, categorias/subcategorias com tag de balde, templates recorrentes                          |
| `/login`                 | form nativo + Server Action `entrar` (cópia do `studiold`)                                        |

### Reatividade

RSC lê os dados (`financasDb()` no servidor); Server Actions mutam e chamam
`revalidatePath` do segmento afetado. Forms nativos onde for possível. Client
Component apenas na fila de revisão do OFX e no seletor de categoria/subcategoria.
Não há reducer nem store de cliente — o `studiold` só precisa disso pela agenda
ao vivo; um painel financeiro é leitura e formulários.

### Cálculos derivados (TypeScript puro em `lib/`)

- `lib/cockpit/split.ts` — divisão 50/30/20 sobre a renda recebida do mês.
- `lib/cockpit/projecao.ts` — saldo projetado para o fim do mês.
- `lib/dividas/progresso.ts` — progresso de quitação por dívida, por grupo e
  total.
- `lib/lancamentos/parcelas.ts` — expande uma compra parcelada em N linhas.
- `lib/lancamentos/recorrentes.ts` — expande os templates recorrentes no mês
  alvo.
- `lib/lancamentos/overdue.ts` — deriva o status `overdue` na leitura.
- `lib/import/ofx.ts` — parse de arquivo OFX para transações candidatas.
- `lib/import/dedupe.ts` — hash de deduplicação contra `external_id`.

### Gate antes de concluir (CLAUDE.md do monorepo)

`pnpm typecheck`, `pnpm lint`, `pnpm build`, `node --experimental-strip-types`
nos `*.check.ts`, revisão do diff inteiro contra o escopo, e confirmação de que
nenhum secret entrou no working tree.

## Schema `financas`

Convenções: todas as tabelas têm `id uuid primary key default gen_random_uuid()`,
`user_id uuid not null default '<UUID_EWERTON>'` (o id do `auth.users`, capturado
depois de criar o usuário à mão) e `criado_em`/`atualizado_em timestamptz default
now()`. Prefixo `fin_` em todas as tabelas.

O `user_id` com default fixo é escolha deliberada de portabilidade: o código do
app não filtra nem preenche `user_id` (o default resolve), mas a coluna existe
caso o schema um dia vire multiusuário ou seja compartilhado com outro app.

### `fin_accounts`

| Coluna                | Tipo / regra                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `name`                | `text not null`                                                    |
| `bank`                | `text not null check (bank in ('inter','nubank','bradesco','btg'))` |
| `type`                | `text not null check (type in ('corrente','poupanca','investimento'))` |
| `balance`             | `numeric(14,2) not null default 0`                                 |
| `balance_updated_at`  | `timestamptz default now()`                                        |
| `ativo`               | `boolean not null default true`                                    |

Adicionar um banco novo exige uma migration nova (o `check` é fechado — decisão
explícita do dono).

### `fin_categories`

| Coluna    | Tipo / regra                                                              |
| --------- | ----------------------------------------------------------------------- |
| `name`    | `text not null`                                                         |
| `type`    | `text not null check (type in ('income','expense','investment'))`       |
| `bucket`  | `text check (bucket in ('necessidade','desejo','investimento'))` — nullable; `null` para categorias de `income` |
| `color`   | `text`                                                                 |
| `icon`    | `text`                                                                 |
| `ativo`   | `boolean not null default true`                                        |

O `bucket` é a tag do método 50/30/20: `necessidade` = 50%, `desejo` = 30%,
`investimento` = 20%.

### `fin_subcategories`

| Coluna         | Tipo / regra                                    |
| -------------- | --------------------------------------------- |
| `category_id`  | `uuid not null references fin_categories(id)` |
| `name`         | `text not null`                              |
| `ativo`        | `boolean not null default true`              |

### `fin_transactions`

Tabela central.

| Coluna                  | Tipo / regra                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| `description`           | `text not null`                                                          |
| `amount`                | `numeric(14,2) not null check (amount > 0)` — sempre positivo; o sinal vem do `movement` |
| `movement`              | `text not null check (movement in ('income','expense','investment'))`    |
| `type`                  | `text not null check (type in ('fixed','variable','installment')) default 'variable'` |
| `due_date`              | `date not null`                                                          |
| `payment_date`          | `date`                                                                   |
| `status`                | `text not null check (status in ('pending','paid','overdue')) default 'pending'` |
| `account_id`            | `uuid references fin_accounts(id)`                                       |
| `category_id`           | `uuid references fin_categories(id)`                                     |
| `subcategory_id`        | `uuid references fin_subcategories(id)`                                  |
| `card_id`               | `uuid` — sem FK, reservado para a Fase 2 (Cartões)                       |
| `debt_id`               | `uuid references fin_debts(id)` — preenchido quando a transação é pagamento de dívida |
| `installment_current`   | `int`                                                                   |
| `installment_total`     | `int`                                                                   |
| `installment_group_id`  | `uuid` — comum a todas as parcelas de uma mesma compra                   |
| `is_recurring`          | `boolean not null default false` — veio de um template                   |
| `recurring_template_id` | `uuid references fin_recurring_templates(id)`                            |
| `source`                | `text not null check (source in ('manual','ofx')) default 'manual'`      |
| `external_id`           | `text` — hash de deduplicação do OFX (ou FITID)                          |

Restrições e índices:

- `unique (user_id, external_id) where external_id is not null` — deduplicação do
  import.
- Índices: `(status, due_date)`, `(due_date)`, `(account_id)`, `(category_id)`,
  `(installment_group_id)`, `(movement, due_date)`.

O status `overdue` **não é materializado no fluxo normal**: é derivado na leitura
(`pending` com `due_date < hoje`) por `lib/lancamentos/overdue.ts`. Há uma ação
manual "recalcular atrasados" que grava `overdue` sob demanda. Não há cron na
Fase 1.

### `fin_recurring_templates`

| Coluna           | Tipo / regra                                                        |
| ---------------- | ---------------------------------------------------------------- |
| `description`    | `text not null`                                                 |
| `amount`         | `numeric(14,2) not null check (amount > 0)`                     |
| `movement`       | `text not null check (movement in ('income','expense','investment'))` |
| `category_id`    | `uuid references fin_categories(id)`                            |
| `subcategory_id` | `uuid references fin_subcategories(id)`                        |
| `account_id`     | `uuid references fin_accounts(id)`                             |
| `day_of_month`   | `int not null check (day_of_month between 1 and 31)`           |
| `type`           | `text not null check (type in ('fixed','variable','installment')) default 'fixed'` |
| `ativo`          | `boolean not null default true`                               |

A ação "gerar mês" (`gerarMes`): para cada template `ativo`, se ainda não existe
`fin_transactions` com aquele `recurring_template_id` e `due_date` dentro do mês
alvo, cria uma linha `pending` com
`due_date = min(day_of_month, último dia do mês)`. Idempotente — rodar de novo no
mesmo mês não duplica. A ação retorna quantas linhas criou.

### `fin_debts`

| Coluna              | Tipo / regra                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `creditor`          | `text not null`                                                      |
| `grupo`             | `text not null check (grupo in ('fgts','consignado','serasa','pessoal','familia','cartao'))` |
| `total_amount`      | `numeric(14,2) not null check (total_amount >= 0)`                   |
| `remaining_amount`  | `numeric(14,2) not null check (remaining_amount >= 0)`               |
| `monthly_payment`   | `numeric(14,2)`                                                      |
| `due_day`           | `int check (due_day between 1 and 31)`                               |
| `status`            | `text not null check (status in ('ativa','quitada')) default 'ativa'` |
| `notes`             | `text`                                                              |

Editar `remaining_amount` pela UI é permitido (renegociação, ajuste de juros) —
sem trilha de auditoria na Fase 1.

### RPC `fn_registrar_pagamento_divida`

Assinatura: `fn_registrar_pagamento_divida(p_debt_id uuid, p_amount numeric,
p_account_id uuid, p_due_date date, p_status text)`.

Corpo (transacional): `SELECT ... FOR UPDATE` na linha da dívida; `INSERT` em
`fin_transactions` (`movement = 'expense'`, `debt_id = p_debt_id`,
`status = p_status`, `payment_date` = `p_due_date` quando `p_status = 'paid'`);
`UPDATE fin_debts SET remaining_amount = greatest(0, remaining_amount - p_amount)`;
se `remaining_amount` chegar a 0, `status = 'quitada'`. `GRANT EXECUTE` para
`service_role`. Segue o precedente das funções `fn_*` do `studiold` para escrita
multi-linha.

### Migrations

Hand-authored, primeiro em `docs/migrations-draft/`, depois copiadas para
`infra/supabase/migrations/` e aplicadas via SQL Editor do dashboard (fora do
tracking `supabase_migrations`, como o resto do monorepo).

1. `2026XXXXXX_create_schema_financas.sql` — `CREATE SCHEMA financas` + as 6
   tabelas + índices + o valor de `<UUID_EWERTON>` nos defaults. Ordem de
   criação por causa das FKs: `fin_accounts` e `fin_categories` →
   `fin_subcategories` → `fin_debts` → `fin_recurring_templates` →
   `fin_transactions` (que referencia `fin_debts` e `fin_recurring_templates`).
   As datas `2026XXXXXX` dos três arquivos são definidas quando forem escritos.
2. `2026XXXXXX_fn_registrar_pagamento_divida.sql` — a RPC + `GRANT EXECUTE`.
3. `2026XXXXXX_seed_financas.sql` — 3 contas (Inter, Nubank, Bradesco), os 6
   grupos de dívida somando ~R$ 56.891, e um conjunto básico de categorias com
   `bucket` preenchido. O Ewerton edita os números depois pela UI.

Cada arquivo termina com:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA financas TO service_role;
NOTIFY pgrst, 'reload schema';
```

Passo manual antes do primeiro deploy: expor o schema `financas` no PostgREST
(dashboard do Supabase → Project Settings → API → Exposed schemas), senão o
`financasDb()` não enxerga o schema.

## Fluxos

### Cockpit (`/cockpit`)

RSC com `force-dynamic`. Um fetch largo via `financasDb()`: contas ativas,
transações do mês corrente, dívidas ativas. Deriva tudo em TypeScript puro:

- **Saldos** — soma de `balance` das contas ativas, com uma linha por conta.
- **50/30/20** — `renda recebida` = soma de `amount` das transações
  `movement = 'income'` e `status = 'paid'` no mês. Metas = `0,50 / 0,30 / 0,20`
  vezes a renda recebida. Gasto real por balde = soma de `amount` das transações
  `expense` e `investment` do mês, agrupadas por `category.bucket`
  (`necessidade` / `desejo` / `investimento`). Barra de meta contra real por
  balde; estouro sinalizado em vermelho. Categorias com `bucket = null` caem num
  balde "sem classificação" e não quebram o cálculo. Sem renda recebida no mês, o
  painel mostra o estado "aguardando a primeira renda do mês".
- **Saldo projetado** — `soma dos balances` + `soma das rendas pending com
  due_date <= fim do mês` − `soma de (expense + investment) pending ou overdue
  com due_date <= fim do mês`. `due_date` posterior ao fim do mês é excluído. O
  resultado é retornado como está — negativo não é zerado.
- **Alerta vermelho** — quando o saldo projetado é negativo, uma faixa no topo do
  Cockpit mostra o tamanho do rombo.
- **Card "pague-se primeiro"** — mostra a meta de 20% da renda recebida e quanto
  já foi para `movement = 'investment'` no mês.

### Lançamentos (`/lancamentos`)

RSC lista + filtros por querystring (`?mes=&status=&conta=&categoria=`). Ações
(Server Actions):

- **Novo** (`criarLancamento`) — descrição, valor, `movement`, `type`,
  vencimento, conta, categoria/subcategoria, status. Com `type = 'installment'`
  aparece o campo "número de parcelas": `lib/lancamentos/parcelas.ts` expande em
  N linhas com o mesmo `installment_group_id`, `installment_current` de 1 a N,
  vencimento somando um mês a cada parcela, valor rateado (a última parcela
  absorve o resto do arredondamento).
- **Gerar mês** (`gerarMes`) — idempotente pelo par
  (`recurring_template_id`, mês). Retorna quantas linhas criou.
- **Marcar pago / pendente** (`mudarStatus`) — `paid` grava
  `payment_date = hoje`; voltar para `pending` limpa o `payment_date`. `overdue`
  não é setado por aqui — é derivado na leitura.
- **Recalcular atrasados** — ação manual que materializa `status = 'overdue'`
  nas linhas `pending` com `due_date < hoje`.
- **Editar / excluir** — excluir uma parcela remove só aquela linha (a UI avisa);
  excluir o grupo inteiro de parcelas é uma ação separada.

### Import OFX (`/lancamentos/importar`)

Client Component apenas nesta tela.

1. Upload de arquivo `.ofx` → Server Action `parseOfx` roda `lib/import/ofx.ts`
   (parse do OFX, extrai cada `STMTTRN`: data, valor com sinal, memo, FITID).
   Não grava nada — retorna os candidatos.
2. `lib/import/dedupe.ts` calcula
   `external_id = sha1(account_id | date | amount | memo)`, ou usa o FITID quando
   presente (FITID tem precedência). Cada candidato é marcado como "novo" ou "já
   importado" conforme bata na restrição `unique`.
3. Fila de revisão: para cada linha nova, escolher conta, categoria/subcategoria
   e `movement` (default por sinal do valor — negativo → `expense`, positivo →
   `income`), e ajustar a descrição. Linhas já importadas aparecem esmaecidas e
   não selecionáveis.
4. **Confirmar** (`confirmarImportacao`) — insere as linhas selecionadas com
   `source = 'ofx'`, `status = 'paid'`, `payment_date` = data do OFX, e o
   `external_id`. Erro de `unique` numa linha (re-submit ou corrida) é ignorado e
   contabilizado no resultado.

### Dívidas (`/dividas`)

RSC: dívidas `ativa` e `quitada`, agrupadas por `grupo`.
`lib/dividas/progresso.ts` calcula o progresso por dívida
(`1 - remaining_amount / total_amount`), por grupo, e o total geral (R$ pago
contra R$ restante). Ações:

- **Registrar pagamento** (`registrarPagamentoDivida`) — chama a RPC
  `fn_registrar_pagamento_divida`. Form: valor (default = `monthly_payment`),
  conta, data, status da transação gerada.
- **Editar dívida / nova dívida** — CRUD simples.

### Configurações (`/configuracoes`)

Seções: contas (CRUD + editar `balance`), categorias/subcategorias (CRUD + tag de
`bucket`), templates recorrentes (CRUD). Forms nativos e `<details>` onde der,
seguindo o padrão do `studiold`.

### Tratamento de erro

Toda Server Action: `requireUser()` no topo; `try/catch` com `console.error`
no servidor e retorno `{ ok: false, erro: <mensagem pt-BR genérica> }` — nunca
vaza o texto do Postgres para a UI. Toda mutação faz `revalidatePath` do
segmento. Falha de transporte no Client Component do import mostra um estado de
erro com opção de repetir.

## Testes

Padrão do `studiold`: `assert` puro, sem framework, rodado por
`node --experimental-strip-types`. Script `"check"` no `package.json`. Um arquivo
`lib/financas.check.ts` importa e exercita cada função pura. Entra no gate antes
de concluir.

Coberto por assert:

- **`lib/cockpit/split.ts`** — renda 0 (metas 0, sem divisão por zero); só
  `paid` conta como renda recebida, `pending` não; o real por balde soma
  `expense` e `investment` e ignora `income`; `bucket = null` cai em "sem
  classificação" sem quebrar.
- **`lib/cockpit/projecao.ts`** — soma contas + rendas `pending` até o fim do mês
  − (`expense` + `investment`) `pending` ou `overdue` até o fim do mês;
  `due_date` depois do fim do mês é excluído; resultado negativo é retornado
  como negativo (não faz clamp).
- **`lib/dividas/progresso.ts`** — `total_amount = 0` → progresso 0 (sem NaN);
  `remaining_amount > total_amount` (juros) → progresso com clamp em 0, nunca
  negativo; `remaining_amount = 0` → 100%; a agregação por grupo e o total geral
  batem com a soma das linhas.
- **`lib/lancamentos/parcelas.ts`** — N linhas; `installment_current` de 1 a N;
  mesmo `installment_group_id`; vencimento soma um mês por parcela (vira o ano em
  dezembro); a soma das parcelas é igual ao valor original (o resto do
  arredondamento fica na última); N = 1 gera uma linha (no-op); N inválido (0 ou
  negativo) é rejeitado.
- **`lib/lancamentos/recorrentes.ts`** — `day_of_month = 31` em fevereiro cai no
  último dia do mês; template inativo não gera; um mês que já tem a linha do
  template não duplica (idempotência); a função conta quantas criou.
- **`lib/import/ofx.ts`** — parseia `STMTTRN` (data `YYYYMMDD` com hora
  opcional, valor com sinal, memo, FITID); OFX vazio retorna lista vazia sem
  lançar; valor negativo → `movement` default `expense`, positivo → `income`.
- **`lib/import/dedupe.ts`** — hash estável para a mesma entrada; campos
  diferentes geram hashes diferentes; FITID presente tem precedência sobre o
  hash; candidato com `external_id` já existente é marcado como "já importado".
- **`lib/lancamentos/overdue.ts`** — `pending` com `due_date < hoje` → `overdue`
  derivado; `paid` nunca vira `overdue`; `due_date == hoje` ainda é `pending`.

Não coberto por teste automatizado (verificação manual no browser, registrada no
plano):

- Server Actions e a RPC (dependem do Supabase ao vivo).
- O gate do `proxy.ts`.
- Aceitação mobile a 375px.
- Aplicação das migrations e exposição do schema `financas` no PostgREST.

## Workflow após este spec

Brainstorm (feito) → `/superpowers:writing-plans` → `/impeccable shape` de cada
superfície antes de qualquer UI → SDD com subagentes → Opus Review → Push.
