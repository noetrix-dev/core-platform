# MEMORY.md

Índice curto de memória do projeto. Carregado toda sessão. Detalhe fica em `memory/`.

## Estado atual

- Infraestrutura pronta: monorepo Turborepo + pnpm, apps e packages criados, tooling configurado (typecheck, lint, build, hooks de path protegido e build-before-stop).
- App `apps/studiold` é boilerplate do `create-next-app`; UI de produto ainda não feita.
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

<!-- Preencher no fim de cada sessão: o que ficou pela metade, próximo passo concreto, arquivo/branch em foco. -->
