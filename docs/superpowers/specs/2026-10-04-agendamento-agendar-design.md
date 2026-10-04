# Agendamento self-service — `/agendar` Passos 2-5 (Spec B) — Design

## Objetivo

Depois da identificação da Spec A, o cliente escolhe serviços, data/hora, cortesia e estilo de música, confirma e recebe e-mail de confirmação. Consome a identidade verificada da Spec A — mas pelo servidor (cookie assinado), nunca pelo estado que a UI manda.

## Decisões (aprovadas no chat)

- **Identidade via cookie httpOnly assinado (HMAC).** A Spec A terminava só no estado do browser; uma Server Action pública que aceitasse telefone/`clienteId` da UI permitiria agendar em nome de qualquer cliente sem passar pelo código. A Spec A passa a gravar o cookie ao concluir a verificação; toda action da Spec B lê a identidade só dele.
- **RPC `fn_criar_agendamento_v2` direto, com origem nova `'site'`.** `fn_confirmar_booking_whatsapp_v2` (prevista na Spec A) grava origem `'whatsapp_bot'` e faz upsert em `whatsapp_sessoes`, mexendo no estado do bot do cliente. `fn_criar_agendamento_v2` já recebe `p_cliente_id` e `p_origem` e serializa reservas com `pg_advisory_xact_lock`. A constraint `agendamentos_origem_check` e a lista fixa de origem dentro de `fn_criar_agendamento_v2` (que lança "Origem inválida") ganham `'site'` — a função é recriada com `CREATE OR REPLACE`, corpo idêntico exceto essa linha — junto na mesma migration de `codigos_verificacao` (draft `docs/migrations-draft/2026-10-03-codigos-verificacao.sql`, aplicado à mão).
- **Cortesia e estilo de música na tela de confirmação**, como chips de escolha única (não selects — 6 e 8 opções, visíveis num toque), pré-preenchidos com `clientes.cortesia_favorita_id` / `clientes.estilo_musica_id`, opcionais. A escolha vale só para este agendamento — não atualiza o favorito.
- **Tela de sucesso + e-mail de confirmação** via `sendEmail()` da Spec A. Falha no envio não desfaz o agendamento.
- **Uma rota, wizard com estado no cliente** (abordagem 1). Sem sub-rotas; "Voltar" é botão em cada etapa.

## Arquitetura

Mesmo "path A" do app: service-role só no servidor (`tenantDb()`), sem RLS em `barbearia_001`, sem `requireUser()` em `/agendar` (comentário intencional já existe no topo de `app/agendar/actions.ts`).

### Sessão de agendamento — `lib/agendar/sessao.ts`

- Cookie `agendar_sessao`: `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/agendar"`, `maxAge` 30 min.
- Conteúdo: `base64url(JSON {clienteId, telefone, exp})` + `.` + `base64url(HMAC-SHA256)`, chave `AGENDAR_COOKIE_SECRET`. `node:crypto` (`createHmac`, `timingSafeEqual`), sem lib nova.
- Funções puras testáveis: `assinarSessao(dados, secret)` / `lerSessaoAssinada(valor, secret, agora)` → dados ou `null` (assinatura inválida, formato inválido, expirado).
- Wrappers de Server Action: `gravarSessao({clienteId, telefone})`, `lerSessao()`, `apagarSessao()` sobre `cookies()` do Next.
- `AGENDAR_COOKIE_SECRET` ausente → erro claro, mesmo padrão de `RESEND_API_KEY`. Variável adicionada à mão em `.env.local` e na Vercel.

### Mudanças na Spec A (`app/agendar/actions.ts`)

- `verificarCodigo`, cliente existente com código certo → `gravarSessao()` antes de devolver `{clienteId, nome}`.
- `confirmarCadastro` com `CLIENTE_CRIADO` → `gravarSessao()`.
- "É você? Não" → nova action `encerrarSessao()` (`apagarSessao()`), chamada pela UI antes de voltar ao campo telefone.

### Actions novas (`app/agendar/actions.ts`)

Todas começam com `lerSessao()`; sem sessão → `{ok: false, sessaoExpirada: true}`.

- `carregarCatalogo()` → `fn_catalogo_servicos_v2()`, cortesias ativas com estoque > 0, estilos de música ativos, favoritos do cliente da sessão.
- `buscarHorarios(servicoIds, dataInicio?)` → `fn_buscar_disponibilidade(servicoIds, dataInicio, 7)`. Valida `servicoIds` (array não vazio de UUIDs) e `dataInicio` (data ISO) antes de chamar.
- `confirmarAgendamento({servicoIds, inicio, cortesiaId?, estiloId?})`:
  1. valida formato de tudo;
  2. revalida cortesia (ativa, estoque > 0) e estilo (ativo) — mesmas checagens de `fn_confirmar_booking_whatsapp_v2`;
  3. `fn_criar_agendamento_v2(sessao.clienteId, servicoIds, inicio, cortesiaId, estiloId, 'site')`;
  4. sucesso → `apagarSessao()`, envia e-mail (try/catch, só log em falha), devolve resumo + flag `emailEnviado` + e-mail mascarado.

O telefone/`clienteId` vindos da UI nunca são aceitos por essas actions.

## Telas (mobile-first, 375px; tokens de `app/agenda/agenda.module.css`)

Brief visual aprovado no `/impeccable shape agendar` (modo Operate, estende o mundo "A Estação do Barbeiro" — sem identidade nova).

`app/agendar/page.tsx` passa a renderizar `AgendarWizard` (client component) com estado em `useState`: etapa, serviços escolhidos, horário escolhido, cortesia/estilo. Reload recomeça na identificação (cookie válido não pula a verificação).

**Faixa do topo — `AgendarCabecalho`**, em todas as etapas (inclusive a identificação da Spec A): faixa full-bleed `--matte`; logo `public/studiold-logo.svg` (wordmark monocromático `#231f20`) aplicada como `mask-image` pintada com `--matte-ink` — o arquivo não muda, a cor vem do token; ~28px de altura no mobile, `role="img"` + `aria-label="StudiOLD"`. Abaixo da logo, em condensada pequena, a etapa ("Serviços · 1 de 3"; a identificação não conta passo). À esquerda, seta "Voltar" (`aria-label="Voltar"`) em Data e hora e Confirmação. Sem horário de funcionamento na faixa (sairia de sincronia com `horarios_funcionamento`). É o momento de marca; o resto é ferramenta, oxblood só em ação/seleção.

1. **Identificação** — `IdentificacaoForm` da Spec A; `onIdentificado` avança para Serviços.
2. **Serviços** — "Olá, [nome]"; lista do catálogo em dois grupos, "Combos" (nome começa com "Combo ", mesmo critério da ordenação da RPC) e "Serviços"; linhas densas (não cards), linha inteira tocável com checkbox à esquerda, nome, duração em `--ink-2` e preço tabular à direita (`lib/dinheiro.ts`); multi-seleção; rodapé fixo `--matte` (espelha a faixa) com duração total, preço total e "Escolher horário" oxblood (desabilitado sem seleção). Carregando = esqueleto de linhas, sem spinner central.
3. **Data e hora** — chips de dia com scroll horizontal ("Seg 06/10"), primeiro dia já selecionado; grade de horários do dia em 3 colunas (alvos ≥ 44px), separada em "Manhã" (antes de 12:00) e "Tarde"; tocar um horário vai direto à Confirmação (sem botão "continuar"); "ver mais dias" busca de novo a partir do dia seguinte ao último mostrado; "Voltar" mantém a seleção de serviços. Nenhum horário na janela de 60 dias da RPC → mensagem pedindo contato com a barbearia.
4. **Confirmação** — resumo em forma de comanda (linhas de serviço, total; data e hora em destaque); "Cortesia" e "Estilo de música" como grupos de chips de escolha única (`role="radiogroup"`), favoritos pré-marcados, "Nenhuma" por último; "Confirmar agendamento" (desabilitado durante a action, `useTransition`, rótulo "Confirmando…").
5. **Sucesso** — "Agendado!" em `.pageTitle`, a mesma comanda, sem confete; "Enviamos a confirmação para j***@g***.com" (só se `emailEnviado`); "Fazer outro agendamento" volta à identificação.

E-mail de confirmação: nome da casa, serviços, data, hora, total. Sem endereço (não há onde guardar hoje).

Componentes por etapa em arquivos próprios em `app/agendar/` (`AgendarCabecalho.tsx`, `EtapaServicos.tsx`, `EtapaHorario.tsx`, `EtapaConfirmacao.tsx`, `EtapaSucesso.tsx`). Estilos novos em `app/agendar/agendar.module.css` (escopado, usa os tokens do `.shell`); `globals.css` intocado. Contraste a medir na implementação: texto pequeno `--matte-ink` sobre `--matte` (AA).

## Erros / edge

Todos via `erroInterno()` da Spec A: detalhe no log do servidor, mensagem fixa pt-BR para o cliente.

- Sessão ausente/inválida/expirada em qualquer action → wizard volta à identificação com "Sua sessão expirou, confirme o telefone de novo."
- Serviço inativo/duplicado (exceção de `fn_buscar_disponibilidade`) → mensagem genérica, recarrega catálogo.
- Horário ocupado entre escolha e confirmação (`fn_criar_agendamento_v2` lança exceção) → volta à grade com "Esse horário acabou de ser ocupado, escolha outro." e recarrega horários.
- Cortesia sem estoque / estilo inativo → mensagem específica, chip volta para "Nenhuma".
- Falha no e-mail → só log; sucesso sem a linha "Enviamos…".
- Duplo clique em confirmar → botão desabilitado durante a transição; agendamento sobreposto é barrado pela validação da RPC sob a advisory lock.

## Teste

- `lib/agendar/sessao.check.ts` (asserts, estilo `agenda.check.ts`, incluído no script `check`): ida e volta assinar/ler; assinatura adulterada → `null`; payload adulterado → `null`; expirado → `null`; formato inválido → `null`.
- Integração manual no banco real: um agendamento de teste com origem `'site'`, apagado depois.
- Aceitação em browser (375px: cliente existente, cliente novo, sessão expirada, horário ocupado) fica para quem tiver Chrome.

## Pré-requisitos manuais

1. Migration do draft `2026-10-03-codigos-verificacao.sql` aplicada (tabela + constraint de origem `'site'`).
2. `RESEND_API_KEY` e `AGENDAR_COOKIE_SECRET` em `apps/studiold/.env.local` e na Vercel.
3. Domínio de teste do Resend só entrega ao e-mail dono da conta — e-mail para cliente real depende de domínio verificado.

## Fora de escopo

Cancelar/remarcar pelo site ("meus agendamentos"); endereço no e-mail; atualizar favoritos a partir do agendamento; canal WhatsApp; domínio próprio no Resend; lembrete antes do horário.
