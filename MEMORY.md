# MEMORY.md

Índice curto de memória do projeto. Carregado toda sessão. Detalhe fica em `memory/`.

## Estado atual

- Infraestrutura pronta: monorepo Turborepo + pnpm, apps e packages criados, tooling configurado (typecheck, lint, build, hooks de path protegido e build-before-stop).
- App `apps/studiold`, mundo visual **A Estação do Barbeiro** (via impeccable), navegação por drawer hambúrguer no topbar compartilhado (`components/Topbar.tsx`). `/` redireciona para `/agenda`. Rotas:
  - `/agenda` — agenda do dia (pilha de fichas + ficha "no espelho"), fila de espera, pedidos de encaixe, walk-in, novo agendamento, bloqueio pontual, banner de status do WhatsApp. Status de agendamento no modelo `agendado → confirmado → concluido / nao_compareceu / cancelado`. Concluir abre o **drawer de pagamento** (`PagamentoDrawer`): valor cobrado, forma de pagamento, cortesia servida → grava `atendimentos` + baixa estoque numa RPC transacional (`fn_concluir_atendimento`).
  - `/configuracoes` ("Ajustes" no nav) — quatro seções via Server Actions: CRUD de `cortesias` (estoque editável inline), `estilos_musica`, `servicos` (listar/adicionar/editar via `<details>`/toggle ativo — sem excluir, só desativar) e **Horário de funcionamento** (`HorariosForm.tsx`, client: 7 dias + bloqueio de almoço `bloqueios_fixos tipo='suave'`, um botão "Salvar horários" → `salvarHorarios`). Preço parseado por `lib/dinheiro.ts` (`parsePrecoBRL`, puro, testado no `check`; `.` = milhar só quando há `,`). Seções sem JS de cliente usam forms nativos + `<details>`.
  - `/financeiro` (Caixa) — atendimentos por período (hoje/semana/mês via `?periodo=`), total faturado, ticket médio, quebra por forma de pagamento, lista de atendimentos.
  - `/clientes` — lista buscável (filtro client-side por nome/telefone). Clicar um cliente (ou o nome dele numa ficha da agenda) abre o `PerfilClienteDrawer` (`components/PerfilClienteDrawer.tsx`, compartilhado): resumo (total gasto, visitas, última visita, serviço mais frequente), bloco de preferências editável (cortesia favorita, estilo musical, observações fixas — um botão Salvar), histórico das últimas 10 visitas. Dados via Server Action `getPerfilCliente` (agrega `atendimentos` em JS, `lib/clientes/resumo.ts` puro); edição via `atualizarPreferencias`. Sem rota/URL nova, estado local por host.
- Camada de dados **ligada ao Supabase (path A: service-role só no servidor)**: `lib/supabase/server.ts` (service-role, `.schema` do tenant), `lib/agenda/load.ts` (RSC lê o schema e devolve `AgendaData`), `app/agenda/actions.ts` + `app/configuracoes/actions.ts` (Server Actions por mutação; fila/encaixe/conclusão via RPC `fn_*` com `FOR UPDATE`/transação). Reducer (`lib/agenda/reducer.ts`) puro — update otimista + `router.refresh()` reconcilia via `HYDRATE`. `lib/agenda/seed.ts` sobrou só como fixture do `check`.
- **Banco `nnybwmuhkaobsdtzospc` totalmente migrado** (verificado ao vivo): `public.tenants`/`public.tenant_usuarios` com RLS; schema `barbearia_001` com 13 tabelas (inclui `cortesias`, `estilos_musica`); `agendamentos.status` no modelo de 5 valores; `atendimentos.cortesia_id` e `agendamentos.cortesia_id`; 5 funções `fn_*` (4 de fila + `fn_concluir_atendimento`) com `GRANT EXECUTE` para `service_role`. Seed real da StudiOLD (horários, almoço, 13 serviços). A tabela `supabase_migrations` está vazia — tudo foi aplicado fora do tracking (SQL direto / `db push`), então `list_migrations` mente; conferir o estado real por `information_schema`/`pg_proc`.
- **O MCP do Supabase alcança `nnybwmuhkaobsdtzospc` por `project_id` direto** (`execute_sql`, `apply_migration`), mesmo que `list_projects` não mostre (org fora do escopo do token).
- Integrações com variável de ambiente reservada mas não implementadas: Evolution API (WhatsApp) e OpenAI (assistente).
- MCPs configurados: Supabase, Context7, Playwright.

## Clientes ativos

- **StudiOLD**: barbearia, tenant `barbearia_001`, vertical barbearia. Primeiro cliente. Contexto completo em `memory/clients/studiold.md`.
- **Usinagem**: vertical usinagem, ainda placeholder. Contexto em `memory/clients/usinagem.md`.

## Decisões de arquitetura

1. **Monorepo Turborepo + pnpm workspaces**: apps em `apps/`, código compartilhado em `packages/`.
2. **Schema por tenant no Supabase (Postgres) + RLS**: cada tenant tem schema isolado (ex.: `barbearia_001`). Um tenant nunca enxerga outro; regra dura, não otimização.
3. **Evolution API como canal de WhatsApp**: uma instância por tenant (ex.: `barbearia_001`); status visível para a equipe.
4. **Abstração `packages/whatsapp`**: o resto do código fala com essa camada, não direto com a Evolution API, para trocar provider sem espalhar mudança.
5. **Cloudflare Tunnel** para expor o ambiente local (webhooks da Evolution API) sem abrir porta.

## Próximos passos

1. Implementar a camada `packages/whatsapp` sobre a Evolution API (enviar mensagem com jitter, receber webhook).
2. Ligar o assistente de conversa (OpenAI) ao fluxo de agendamento pelo WhatsApp.
3. Dashboard `apps/studiold`: agenda, `/configuracoes` (cortesias, músicas, serviços, horários), caixa e clientes prontos. Falta: config de bloqueios pontuais por tela e cadastro de horário por barbeiro (schema é fila única).

## Onde parei

**Serviços + Horários em `/configuracoes`**: entregue e pushado em `main` (`docs/superpowers/plans/2026-08-29-configuracoes-servicos-horarios.md`, subagent-driven; `34d54c9..aa0c040`, 5 tasks + 1 fix wave). Sem migration — `servicos`, `horarios_funcionamento`, `bloqueios_fixos` já existiam. Novos: `lib/dinheiro.ts` (`parsePrecoBRL`); Server Actions `criarServico`/`editarServico`/`toggleServicoAtivo`/`salvarHorarios` em `app/configuracoes/actions.ts`; `app/configuracoes/HorariosForm.tsx`; bloco `.cfgHorario*` em `agenda.module.css`. Nav `/configuracoes` renomeado "Cortesias e Músicas" → "Ajustes" (ícone `gear`). Review whole-branch (opus): 0 Critical; 3 Important + 3 Minor corrigidos na fix wave `aa0c040` (`pattern` nos inputs de preço p/ bloquear typo → no-op silencioso; query de `bloqueios_fixos` fixada em `.eq("ativo",true).is("dia_semana",null)` p/ casar com `load.ts`; `router.refresh()` no caminho de erro do `salvarHorarios` p/ não esconder write parcial; `key={JSON.stringify(dias)}` no `HorariosForm`; `console.error` server-side em vez de vazar msg do Postgres na UI; remoção de `gridColumn` inline redundante). Scoped re-review: 6/6 ok, zero regressão. Gate verde.

Diferido do configuracoes (não bloqueia): `role="switch"`/`aria-checked` nos 4 toggles do padrão compartilhado; `parsePrecoBRL` lê `"1.234"` (sem vírgula) como `1.23` — regra do plano, inalcançável p/ preços de barbearia, resolver com regex de milhar se reusar noutra vertical; toast de confirmação positiva na seção de horários; nenhuma validação cross-section (almoço fora do horário aberto de um dia); `salvarHorarios` são 8 updates sequenciais sem transação (padrão do codebase, idempotente no retry).

**Perfil de cliente** (`/clientes` + `PerfilClienteDrawer` + nome tocável nas fichas): entregue e pushado em `main` (`b4dc577` plano, `2668110..fc90b80` código; `docs/superpowers/plans/2026-08-28-perfil-cliente.md`, subagent-driven). Sem migration — `clientes.cortesia_favorita_id/estilo_musica_id/observacoes_fixas` já existiam. Review final: 4 Important corrigidos numa fix wave (line-through no `<button>` do nome, `.limit()` no fetch de `atendimentos` do `/clientes`, `try/catch` de transporte no drawer, afford. de toque dotted + `cursor-pointer`). Gate verde.

Follow-ups diferidos do perfil (não bloqueiam): tail `: perfil ? … : null` morto no `PerfilClienteDrawer` (cosmético); contraste do underline dotted (`--chrome`, ~3:1) é questão de token; substituir o `.limit(50000)` do `/clientes` por RPC/view `count(*) group by cliente_id` quando `atendimentos` crescer; `getPerfilCliente`/`atualizarPreferencias` são PII em Server Action sem Auth/RLS (consistente com `agendar`/`concluir` — path A; revisitar quando auth chegar).

Anterior — drawer de pagamento: entregue e pushado (`de5a6d9..30a2586`). Migration `fn_concluir_atendimento` + `atendimentos.cortesia_id` já aplicada no banco.

Aberto:

1. **Exposição do schema `barbearia_001` no PostgREST** — presumivelmente ok (as RPCs de fila já são chamadas pelo app), mas não conferido explicitamente.
2. **Banner do WhatsApp sempre visível em `/agenda`:** a linha `public.tenants` de `barbearia_001` existe (`id cc55b744…`), com `whatsapp_status = 'desconectado'` — correto enquanto a Evolution API não estiver implementada. Some quando o status virar `'conectado'`.
3. **Caveat de rollout do drawer de pagamento:** agendamentos criados antes deste deploy já baixaram estoque de cortesia no agendamento; concluí-los agora baixa 2ª vez (a baixa migrou para a conclusão). Ajuste manual de estoque no dia.
4. **Follow-ups menores** (review final, diferidos, não bloqueiam): `export type Forma` compartilhado em `lib/agenda/types.ts` (union re-escrita em ~7 lugares); estreitar `mudarStatus` para `Exclude<StatusAgendamento, "concluido">`; `aria-hidden`/`aria-labelledby` nos `<label>` decorativos do `PagamentoDrawer`; guard da RPC rejeitar também `cancelado`/`nao_compareceu`.
5. **Finish do impeccable (de antes):** review visual no browser (bloqueado nesta máquina — sem Chrome) e `DESIGN.md` (o `impeccable-documenter` grava depois do review).

"Na cadeira" (`em_atendimento`) é estado de sessão só do cliente — não há coluna no schema; some no reload. Vira coluna se precisar persistir.
