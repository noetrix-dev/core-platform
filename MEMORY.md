# MEMORY.md

Índice curto de memória do projeto. Carregado toda sessão. Detalhe fica em `memory/`.

## Estado atual

- Infraestrutura pronta: monorepo Turborepo + pnpm, apps e packages criados, tooling configurado (typecheck, lint, build, hooks de path protegido e build-before-stop).
- App `apps/studiold`: rota `/agenda` construída (mundo visual **A Estação do Barbeiro**, via impeccable). Cobre a agenda do dia (pilha de fichas + ficha "no espelho"), fila de espera, pedidos de encaixe, walk-in, novo agendamento, bloqueio pontual, banner de status do WhatsApp. `/` redireciona para `/agenda`.
- Rota `/configuracoes` (link pela engrenagem no topbar da agenda): CRUD de `cortesias` e `estilos_musica` via Server Actions, sem JS de cliente (forms nativos + `<details>`). Depende da migration `docs/migration-cortesias-musicas-preferencias.sql` ser aplicada — 500 até lá.
- Camada de dados da agenda **ligada ao Supabase (path A: service-role só no servidor)**: `lib/supabase/server.ts` (service-role, `.schema` do tenant), `lib/agenda/load.ts` (RSC lê o schema e devolve `AgendaData`), `app/agenda/actions.ts` (Server Actions por mutação; fila/encaixe via RPC `fn_*` com `FOR UPDATE`). O reducer (`lib/agenda/reducer.ts`) continua puro — cliente faz update otimista e `router.refresh()` reconcilia via `HYDRATE`. `lib/agenda/seed.ts` sobrou só como fixture do `check`.
- Migrations Supabase aplicadas: `public.tenants` + `public.tenant_usuarios` com RLS, schema `barbearia_001` completo, seed real da StudiOLD (horários, almoço, 13 serviços).
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
2. Substituir o boilerplate de `apps/studiold` pelo dashboard real da equipe (agenda, clientes, serviços, bloqueios, fila, encaixe).
3. Ligar o assistente de conversa (OpenAI) ao fluxo de agendamento pelo WhatsApp.

## Onde parei

Camada de dados da `/agenda` ligada ao Supabase (path A). `pnpm typecheck/lint/build` e `pnpm --filter studiold check` verdes. Build é CI-safe (`force-dynamic`, sem tocar o banco em build). **Não commitado ainda.**

**Não testado contra o banco real** — o projeto linkado (`nnybwmuhkaobsdtzospc`, `supabase/.temp/project-ref`) está numa org que o MCP do Supabase da sessão não enxerga. Para a agenda funcionar de verdade, falta:

1. Aplicar `docs/agenda-rpc.sql` como migration à mão (`pnpm supabase migration new agenda_rpc_fila`, colar, revisar, `db push`). Sem as funções `fn_*`, cancelar/notificar/confirmar/encaixe retornam erro e o cliente só recarrega.
2. Expor o schema `barbearia_001` no PostgREST (Dashboard > Settings > API > Exposed schemas).
3. Inserir uma linha em `public.tenants` com `slug = 'barbearia_001'` — o seed não insere. Sem ela, `load.ts` não acha o tenant e o banner do WhatsApp fica sempre "desconectado".
4. Conferir `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_TENANT` no ambiente.
5. Rodar e validar as queries (filtro `slots!inner`, cross-schema `public.tenants`, conversão de fuso SP).

Pendente do finish do impeccable (de antes): review visual no browser (bloqueado nesta máquina — sem Chrome) e `DESIGN.md` (o `impeccable-documenter` grava depois do review).

"Na cadeira" (`em_atendimento`) é estado de sessão só do cliente — não há coluna no schema; some no reload. Vira coluna se precisar persistir.
