@AGENTS.md

# apps/studiold

## Fluxo de desenvolvimento (Superpowers)

Vale para todo trabalho neste app. NUNCA implementar diretamente sem antes rodar /brainstorm e /plan. Para qualquer feature com UI, rodar também /impeccable shape <superficie> antes de codar. Para revisão de design de componentes prontos, usar /impeccable slop-audit. Exceções permitidas: correções de bug, ajustes de CSS pontuais, commits e deploys.

## Lições aprendidas

- Next 16 renomeou `middleware.ts` → `proxy.ts` (export `proxy`, mesmo `config.matcher`). O gate de auth vive em `apps/studiold/proxy.ts`. `cookies()` de `next/headers` é async.
