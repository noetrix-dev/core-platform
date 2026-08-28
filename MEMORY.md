# MEMORY.md

Índice curto de memória do projeto. Carregado toda sessão. Detalhe fica em `memory/`.

## Estado atual

- Infraestrutura pronta: monorepo Turborepo + pnpm, apps e packages criados, tooling configurado (typecheck, lint, build, hooks de path protegido e build-before-stop).
- App `apps/studiold`: rota `/agenda` construída (mundo visual **A Estação do Barbeiro**, via impeccable). Roda sobre store em memória (`lib/agenda/`) com o shape do schema `barbearia_001`; ainda não ligada ao Supabase client. Cobre a agenda do dia (pilha de fichas + ficha "no espelho"), fila de espera, pedidos de encaixe, walk-in, novo agendamento, bloqueio pontual, banner de status do WhatsApp. `/` redireciona para `/agenda`.
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

Rota `/agenda` da StudiOLD construída e commitada em `main` ("feat: agenda-barbeiro — A Estação do Barbeiro"). `pnpm typecheck/lint/build` e `pnpm --filter studiold check` verdes. Contrato de direção no `app/layout.tsx` (seed key `8d732202`, code-led porque a rolagem do impeccable rodou degradada, sem rede).

Pendente do finish do impeccable:

1. **Review visual no browser** — não deu pra rodar nesta máquina (Playwright MCP caiu; sem `libnss3`/`libnspr4` pro Chromium, sem sudo). Falta screenshot desktop/mobile e o agente `impeccable-finish-reviewer`. Rodar num ambiente com Chrome ou instalar as libs.
2. **DESIGN.md** — não escrito de propósito; a skill grava no finish pelo `impeccable-documenter`, depois do review visual. Mundo visual novo sem DESIGN.md = run incompleto pela skill.
3. **Ligar ao Supabase** — o reducer (`lib/agenda/reducer.ts`) é a única camada a trocar: cada action vira query no schema do tenant, operações de fila com `SELECT ... FOR UPDATE`. O seed (`lib/agenda/seed.ts`) está marcado `SINTÉTICO`.
