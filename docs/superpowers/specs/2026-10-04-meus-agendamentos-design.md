# Meus Agendamentos — `/agendar/meus-agendamentos` (Spec C) — Design

## Objetivo

Área do cliente da StudiOLD para ver, cancelar e remarcar os próprios agendamentos. Continua o fluxo self-service: Spec A (identificação por código, `docs/superpowers/specs/2026-10-03-verificacao-identidade-agendar-design.md`) e Spec B (wizard, `docs/superpowers/specs/2026-10-04-agendamento-agendar-design.md`), ambas em produção.

## Decisões (aprovadas no chat)

- **Remarcar agenda o novo antes de cancelar o antigo.** `fn_cancelar_agendamento_v2` oferece a vaga liberada à fila (`fn_ofertar_fila_para_horario_v2`) na mesma transação. Cancelar primeiro faria o cliente perder o horário se abandonasse o wizard. O antigo só é cancelado quando o novo é confirmado.
- **A sessão sobrevive à confirmação.** `confirmarAgendamento` deixa de apagar o cookie `agendar_sessao`, que vale até `exp` (30 min). O token é stateless, então apagar o cookie trazia pouca segurança; o que segura abuso é o teto `MAX_AGENDAMENTOS_SITE_FUTUROS`.
- **Passados: os 10 mais recentes**, incluindo `concluido`, `cancelado` e `nao_compareceu` (exibido como "Não realizado"). Futuros: todos. Sem paginação.
- **Rota própria lida no servidor** (abordagem 1). O remarcar reaproveita o wizard da Spec B via `/agendar?remarcar=<id>`.
- Direto em `main`, sem branch, a pedido do usuário. **Sem migration**: `fn_cancelar_agendamento_v2(p_agendamento_id, p_motivo, p_descricao, p_origem)` já existe, não valida origem por lista e `agendamentos.motivo_cancelamento` não tem CHECK (conferido ao vivo em 2026-10-04).

## Confiança

Mesmo "path A" do app: service-role só no servidor, sem `requireUser()` em `/agendar/**` (intencional). A identidade vem só de `lerSessao()` (cookie `agendar_sessao`, `path=/agendar`, que cobre `/agendar/meus-agendamentos`).

`fn_cancelar_agendamento_v2` **não confere o dono**: cancela qualquer id. Toda action que cancela ou remarca lê antes o agendamento e exige `cliente_id === sessao.clienteId` e status `agendado` ou `confirmado`. Quando a checagem falha, a resposta é sempre "Agendamento não encontrado.", seja id de outro cliente, inexistente ou com formato inválido, para não revelar quais ids existem.

## Arquitetura

### Leitura: `lib/agendar/meus.ts` (só servidor, `import "server-only"`)

`carregarMeusAgendamentos(clienteId): Promise<{ futuros: ItemAgendamento[]; passados: ItemAgendamento[] }>` faz **uma** consulta em `agendamentos` (embed `slots!inner(data_hora)` e `agendamento_servicos(ordem, servicos(nome))`) filtrada por `cliente_id`, em ordem `criado_em desc`, com `limit 50`. A separação e a ordenação por horário são feitas em JS por `separarAgendamentos`, porque o PostgREST não ordena o pai por coluna embutida. O comentário `ponytail:` registra o teto: um cliente com mais de 50 agendamentos perde os mais antigos, que já ficam fora dos 10 passados exibidos.

`ItemAgendamento = { id, inicio (ISO), data, hora (São Paulo, via partesSaoPaulo), servicos: string[], valorTotal, status }`.

Funções puras em `lib/agendar/formato.ts` (com testes):

- `separarAgendamentos(itens, agora)` divide pelo **horário**, não pelo status: futuros são os `agendado`/`confirmado` com horário maior ou igual a agora, em ordem crescente. O resto são passados, em ordem decrescente e limitados a 10. Um `agendado` que já passou vai para passados, sem ações. Um `cancelado` com horário futuro também vai para passados.
- `rotuloStatus(status)`: `agendado` → "Agendado", `confirmado` → "Confirmado", `concluido` → "Concluído", `cancelado` → "Cancelado", `nao_compareceu` → "Não realizado".

### Página: `app/agendar/meus-agendamentos/page.tsx` (RSC, `force-dynamic`)

- `lerSessao()` nulo → `redirect("/agendar?destino=meus-agendamentos")`.
- Com sessão, lê o nome do cliente e chama `carregarMeusAgendamentos`, depois renderiza `MeusAgendamentos` (client component) com os dados.

### Actions (`app/agendar/actions.ts`)

- **`cancelarAgendamento(id: string)`** → `{ ok: true } | FalhaAgendar`:
  1. sessão;
  2. formato UUID;
  3. lê `cliente_id` e `status` do agendamento e exige dono e `agendado`/`confirmado`;
  4. `fn_cancelar_agendamento_v2(id, 'cliente', null, 'site')`;
  5. `revalidatePath("/agendar/meus-agendamentos")`.

  A exceção "não pode ser cancelado" da RPC (corrida entre abas) vira "Esse agendamento já não pode ser cancelado.".
- **`confirmarAgendamento`** ganha `remarcarId?: string | null`:
  - Se vier, antes de tudo: UUID, dono e status `agendado`/`confirmado`. Se falhar, "Agendamento não encontrado." e nada é criado.
  - O teto de 2 futuros exclui `remarcarId` da contagem (`.neq("id", remarcarId)`).
  - Cria o novo e depois chama `fn_cancelar_agendamento_v2(remarcarId, 'remarcado', null, 'site')`.
  - Se o cancelamento falhar, o novo fica valendo, o erro vai para o log e o resumo leva `antigoNaoCancelado: true`.
  - O e-mail diz "Remarcado" em vez de "Agendado".
  - **Não apaga mais a sessão** (remove o `apagarSessao()` do sucesso).
- `ResumoAgendamento` ganha `remarcado: boolean` e `antigoNaoCancelado: boolean`.

### Remarcar no wizard

- `app/agendar/page.tsx` passa a receber `searchParams` (`remarcar`, `destino`).
- Com `remarcar` e sessão válida, carrega no servidor o nome, os `servico_id` do agendamento (em `ordem`) e seu `data`/`hora`, com a mesma checagem de dono e status. Se for válido, passa `inicial = { nome, servicoIds, remarcar: { id, data, hora } }` ao `AgendarWizard`, que começa em Serviços com os serviços marcados e já carrega o catálogo.
- `?remarcar` inválido, de outro cliente ou não remarcável é ignorado. O wizard abre normal; se houver sessão, entra em Serviços sem pré-seleção, com o aviso "Esse agendamento não pode mais ser remarcado. Escolha um novo horário." quando o id existia mas já não está remarcável.
- Também sem `remarcar`, `page.tsx` com sessão válida abre o wizard em Serviços. Isso cobre "Novo agendamento" vindo de Meus agendamentos e o "Fazer outro agendamento".
- `?destino=meus-agendamentos`: a identificação mostra "Confirme seu telefone para ver seus agendamentos." e, ao concluir, faz `router.push("/agendar/meus-agendamentos")` em vez de ir para Serviços.

## Telas (mobile-first 375px; mundo "A Estação do Barbeiro", tokens e classes de `agendar.module.css`)

**`/agendar/meus-agendamentos`**

- **Faixa** `AgendarCabecalho` com a etapa "Meus agendamentos" e Voltar levando a `/agendar` (`<Link>`).
- **h1** "Olá, [nome]", com o botão primário "Novo agendamento" (`css.cta`).
- **"Próximos":** um cartão `.comanda` por agendamento. Mostra data e hora em destaque (`comandaDestaque`), uma linha por serviço, `comandaTotal` e um selo de status. Embaixo, "Remarcar" e "Cancelar" lado a lado, com `css.cta` (44px ou mais).
  - Cancelar troca o cartão para a confirmação inline: "Tem certeza? Essa ação não pode ser desfeita.", com "Sim, cancelar" (oxblood) e "Manter". Durante a action o botão mostra "Cancelando…". No sucesso, `router.refresh()`. Erro aparece no cartão (`role="alert"`). Sessão expirada leva para `/agendar?destino=meus-agendamentos`.
  - Remarcar é um `<Link>` para `/agendar?remarcar=<id>`.
- **"Anteriores":** linhas densas, só leitura, com data, hora, serviços resumidos (separados por vírgula), total e status em tom `--ink-2`. A seção some se estiver vazia.
- **Sem futuros:** "Nenhum horário marcado." e o botão "Agendar".

**Wizard (mudanças)**

- **Faixa "Remarcando"** discreta acima do conteúdo, enquanto houver `remarcar`: "Remarcando Sáb 10/10 às 09:00. Seu horário atual só é liberado quando você confirmar o novo."
- **Confirmação:** com `remarcar`, o destaque vira "Novo horário" e, abaixo, o horário antigo aparece riscado.
- **Sucesso:**
  - título "Remarcado!" quando `remarcado`;
  - aviso "Não conseguimos liberar seu horário anterior. Cancele em Meus agendamentos." quando `antigoNaoCancelado`;
  - link "Ver meus agendamentos";
  - "Fazer outro agendamento" volta para Serviços, não para a identificação.
- **Etapa Serviços:** link discreto "Meus agendamentos" ao lado do "Olá, [nome]".

### Brief visual (aprovado no `/impeccable shape meus-agendamentos`)

- **Modo e direção:** Operate. Estende o mundo "A Estação do Barbeiro" sem identidade nova. O foco visual é o primeiro cartão de Próximos (data e hora em `comandaDestaque`). Anti-metas: calendário, abas, filtros, modal, `confirm()` do navegador.
- **Selo de status** no canto do destaque, em Condensed caixa-alta pequena: "Confirmado" em `--sage`, "Agendado" em `--steel`. O contraste AA sobre `--enamel-hi` é medido na implementação.
- **Ações do cartão:**
  - "Remarcar" e "Cancelar" ficam numa linha de 2 colunas iguais (`css.cta`). Remarcar usa `.btn` neutro; Cancelar usa `.btn--danger`.
  - A confirmação substitui a linha de botões dentro do próprio cartão: "Sim, cancelar" em `.btn--primary` e "Manter" em `.btn`. O foco vai para "Manter" e Esc mantém.
- **Anteriores:** linhas densas de 2 linhas dentro de `.lista`.
  - Linha 1: "Sáb 10/10 · 09:00", com o status à direita.
  - Linha 2: serviços separados por vírgula e o total, em `--ink-2`.
  - "Concluído" em `--ink`; "Cancelado" e "Não realizado" em `--ink-2`.
- **Faixa "Remarcando":** fundo `--enamel-lo`, borda esquerda de 3px `--ochre`, texto `.msgQuiet`. É informação, não alerta.
- **Confirmação ao remarcar:** "Novo horário: Ter 13/10 às 10:30" e, abaixo, "Antes: ~~Sáb 10/10 às 09:00~~" em `--ink-2`.
- **Link "Meus agendamentos" em Serviços:** à direita do h1, em `.msgQuiet` sublinhado, com alvo de 44px ou mais.
- **Sem animação de saída** do cartão cancelado; o `router.refresh()` só reordena.
- Componentes novos: `app/agendar/meus-agendamentos/page.tsx`, `MeusAgendamentos.tsx`, `CartaoAgendamento.tsx`. Classes novas em `app/agendar/agendar.module.css`.

## Erros / bordas

| Situação | Comportamento |
|---|---|
| Sessão ausente ou expirada ao abrir a página | redirect para `/agendar?destino=meus-agendamentos` com a mensagem |
| Sessão expira em cancelar ou remarcar | `sessaoExpirada` leva à identificação (caminho existente da Spec B; na página Meus, push para `/agendar?destino=meus-agendamentos`) |
| Id de outro cliente, inexistente ou com formato inválido | "Agendamento não encontrado." |
| Cancelar o que já foi cancelado ou concluído | "Esse agendamento já não pode ser cancelado." e refresh |
| `agendado` com horário que já passou | vai para Anteriores, sem ações |
| Remarcar com o antigo já não remarcável | wizard normal com aviso |
| Novo criado, cancelamento do antigo falha | o novo vale; log; aviso no sucesso |
| Abandonar a remarcação | o antigo continua intacto (nada foi cancelado) |

## Teste

- Asserts em `lib/agenda/agenda.check.ts`:
  - `separarAgendamentos`: futuro e passado pelo horário, `agendado` passado indo para passados, limite de 10 nos passados;
  - `rotuloStatus` para os 5 status.
- Integração manual no banco real:
  - cancelar o próprio agendamento;
  - cancelar o id de outro cliente, que deve falhar;
  - remarcar e conferir o novo com `origem='site'` e o antigo `cancelado` com `motivo_cancelamento='remarcado'`;
  - abandonar uma remarcação e conferir o antigo intacto.
- Aceitação em browser a 375px fica para quem tiver Chrome.

## Fora de escopo

Editar cadastro; avaliar atendimento; aviso por WhatsApp do cancelamento (entra quando `packages/whatsapp` existir); antecedência mínima para cancelar; paginação dos anteriores.
