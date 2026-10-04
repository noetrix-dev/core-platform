# Notificações no painel — Design

## Objetivo

Um sino no topo de todas as rotas autenticadas do painel do StudiOLD (`/agenda`, `/clientes`, `/financeiro`, `/configuracoes/*`) avisa o Victório quando um cliente agenda, cancela ou remarca pelo site (`/agendar`) ou pelo bot do WhatsApp. O sino tem um contador de não lidas, atualizado por polling a cada 30 s.

## Decisões (aprovadas no chat)

- **Fonte: o log `agendamento_eventos`, não a tabela `agendamentos`.** Todas as RPCs v2 já gravam nele (`tipo`, `origem`, `cliente_id`, `agendamento_id`, `dados`). Triggers em `agendamentos` erram em três casos:
  - `agendamentos.origem` é o canal que **criou** o agendamento, não quem cancelou;
  - a remarcação do bot (`fn_remarcar_agendamento_v2`) move o agendamento sem INSERT nem cancelamento;
  - a remarcação do site viraria duas notificações.
- **Tabela `notificacoes` alimentada por trigger** `AFTER INSERT ON agendamento_eventos`. Mantém o schema do brief, com o campo `lida` por notificação.
- **A remarcação do site vira uma notificação só.** O cancelamento com `dados.motivo = 'remarcado'` funde na notificação "criado" não lida do mesmo cliente, canal site, dos últimos 2 min.
- **Lista: não lidas de qualquer data, mais as lidas das últimas 24h, até 30 itens.** O contador e a lista sempre batem.
- **`lida` única por notificação, não por usuário.** Hoje só o Victório usa o painel (YAGNI).
- **Polling por Server Action dentro do `Topbar`** compartilhado (abordagem 1). Sem Route Handler e sem Realtime/WebSocket.
- Direto em `main`, sem branch. A migration é hand-authored em `docs/migrations-draft/` e aplicada à mão pelo usuário.

## Banco

Draft: `docs/migrations-draft/2026-10-04-notificacoes.sql`.

### Tabela `barbearia_001.notificacoes`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `tipo` | text not null | CHECK: `agendamento_criado`, `agendamento_cancelado`, `agendamento_remarcado` |
| `canal` | text not null | CHECK: `site`, `whatsapp_bot` |
| `cliente_id` | uuid | FK `clientes`, `on delete set null` |
| `agendamento_id` | uuid | FK `agendamentos`, `on delete set null` |
| `evento_id` | uuid unique | FK `agendamento_eventos`, `on delete set null`; idempotência |
| `inicio_anterior` | timestamptz | horário antigo de uma remarcação |
| `lida` | boolean not null | default false |
| `criado_em` | timestamptz not null | default now() |

Índice `(lida, criado_em desc)`. `GRANT ALL` para `service_role`.

### Trigger `trg_notificar_evento` → `fn_notificar_evento()`

Dispara só quando `origem IN ('site','whatsapp_bot')` e `tipo IN ('agendamento_criado','agendamento_cancelado','agendamento_remarcado')`.

- `agendamento_criado` → notificação `agendamento_criado`.
- `agendamento_remarcado` (o bot move o mesmo agendamento) → `agendamento_remarcado`, com `inicio_anterior = dados->>'inicio_anterior'`.
- `agendamento_cancelado` com origem `site` e `dados->>'motivo' = 'remarcado'`:
  - procura uma notificação `agendamento_criado` com canal `site`, mesmo `cliente_id`, `lida = false` e `criado_em > now() - 2 min`;
  - se achar, faz UPDATE para `agendamento_remarcado` com `inicio_anterior = dados->>'inicio_liberado'`;
  - senão, insere `agendamento_remarcado` com esse `inicio_anterior`.
- Outro `agendamento_cancelado` → `agendamento_cancelado`.
- Todo INSERT usa `on conflict (evento_id) do nothing`.
- O corpo fica num bloco `EXCEPTION WHEN OTHERS THEN RAISE WARNING`. O trigger roda na transação das RPCs de agendar e cancelar, também usadas pelo bot, e um erro de notificação nunca pode derrubar um agendamento.
- **Sem backfill:** só eventos novos geram notificação.

## Servidor

`app/notificacoes/actions.ts` (`"use server"`). Toda action começa com `await requireUser()`, padrão do painel. O acesso usa `tenantDb()`.

- **`contarNaoLidas(): Promise<number>`:** `count` com `head: true` onde `lida = false`. Em erro loga e devolve `null`, e o cliente mantém o último valor.
- **`listarNotificacoes(): Promise<{ ok: true; itens: ItemNotificacao[] } | { ok: false }>`:**
  - filtro `lida = false OR criado_em >= now - 24h`, em `criado_em desc`, `limit 30`;
  - embed: `clientes(nome)` e `agendamentos(slots(data_hora), agendamento_servicos(ordem, servicos(nome)))`;
  - data e hora em São Paulo via `partesSaoPaulo`.
- **`marcarTodasLidas(ate: string): Promise<void>`:** `update lida = true` onde `lida = false and criado_em <= ate`. O `ate` é o `criadoEm` do item mais novo mostrado. Uma notificação que chegue entre a leitura e a marcação continua não lida.

`ItemNotificacao = { id; tipo; canal; cliente: string | null; servicos: string[]; data: string | null; hora: string | null; anterior: { data; hora } | null; criadoEm: string; lida: boolean }`

### Puros: `lib/notificacoes/formato.ts`, testados em `lib/agenda/agenda.check.ts`

- **`tempoRelativo(iso, agora)`:**

  | Quanto tempo antes | Texto |
  |---|---|
  | menos de 1 min | "agora" |
  | menos de 60 min | "há N min" |
  | menos de 24 h | "há N h" |
  | dia anterior | "ontem" |
  | antes disso | "há N dias" |

- **`rotuloTipo`:** "Novo agendamento", "Cancelamento", "Remarcação".
- **`rotuloCanal`:** "Site", "WhatsApp".

## Interface

`components/SinoNotificacoes.tsx` (client), renderizado pelo `Topbar` sempre, no grupo à direita (`ml-auto`), antes dos controles de cada página.

- **Botão:** ícone `bell` (já existe em `components/agenda/Icon.tsx`), alvo de 44px ou mais, `aria-label` "Notificações, N não lidas" ("Notificações" com 0) e `aria-expanded`.
- **Badge:** oxblood com o número; "9+" acima de 9; com 0 não aparece.
- **Painel:**
  - **Posição:** ancorado à direita, logo abaixo da faixa do topbar, com largura `min(22rem, 100vw - 2rem)`. Esc ou toque fora fecha, e o foco volta ao sino.
  - **Item:** ícone do tipo; **nome do cliente** e, à direita, o tempo relativo; linha 2 "Novo agendamento · Site"; linha 3 serviços e "Sáb 10/10 às 09:00".
  - **Remarcação:** a linha 3 vira "Sex 09/10 09:00 → Sáb 10/10 09:00".
  - **Dados apagados:** cliente apagado aparece como "Cliente"; agendamento apagado, como "Horário removido".
  - **Não lidas:** filete oxblood à esquerda. Fica até a próxima abertura, porque o estado da lista é local.
  - **Carregando:** esqueleto de 3 linhas.
  - **Vazio:** "Nenhuma notificação nas últimas 24h."
  - **Erro:** "Não foi possível carregar as notificações."
- **Ao abrir:** `listarNotificacoes()`; havendo itens não lidos, chama `marcarTodasLidas(itens[0].criadoEm)` e zera o badge.
- **Polling:** `contarNaoLidas()` no mount, a cada 30 s com `document.visibilityState === "visible"`, e ao voltar para a aba (`visibilitychange`). Erros são silenciosos na tela.
- **Visual:** mundo "A Estação do Barbeiro", mobile-first a 375px, pt-BR, sem CSS global novo (classes em `app/agenda/agenda.module.css`, onde o `Topbar` já vive). O desenho fino é fechado no `/impeccable shape` antes de codar.

## Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Trigger falha | WARNING; o agendamento segue e a notificação se perde |
| Evento reprocessado | `evento_id unique` + `on conflict do nothing` |
| Remarcação do site com o "criado" já lido | não funde; insere `remarcado` à parte (duas notificações, raro) |
| Cliente ou agendamento apagado | FK `set null`; "Cliente" / "Horário removido" |
| Sessão expirada durante o polling | erro ignorado; a próxima navegação vai a `/login` |
| Mais de 30 não lidas | mostra as 30 mais novas; só essas viram lidas; o badge cai para o resto |
| Migration não aplicada | as actions logam o erro; sem badge; o painel mostra a mensagem de erro; `/agenda` não quebra |

## Teste

- Asserts de `tempoRelativo` (limites de minuto, hora, ontem e dias), `rotuloTipo` e `rotuloCanal` em `agenda.check.ts`.
- **Manual, depois da migration** (SQL só de leitura em `notificacoes`):
  - agendar pelo site gera 1 `agendamento_criado`;
  - cancelar pelo site gera 1 `agendamento_cancelado`;
  - remarcar pelo site gera 1 `agendamento_remarcado` com `inicio_anterior`;
  - cancelar pelo painel não gera nada.
- Aceitação em navegador a 375px fica para quem tiver Chrome.

## Fora de escopo

Som e push do navegador; "lida" por usuário; notificações de encaixe e fila; filtro e paginação; Realtime/WebSocket; backfill de eventos antigos.
