@AGENTS.md

# apps/usinagem: ERP Express Usinagem

ERP interno da Express Usinagem e Calderaria: uma intermediadora técnica que não tem máquinas. Ela desenha, cota, compra matéria-prima, terceiriza a fabricação com parceiros, inspeciona, registra a NF emitida no sistema fiscal externo e entrega ao cliente.

Fonte de verdade das regras: `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md`. Em conflito, a spec vence este arquivo.

O repositório é público. Nunca versionar `docs/express-usinagem/fontes/`, dados reais, nomes de pessoas, caminhos de rede reais, endereços ou detalhes de infraestrutura.

## Stack

- Next.js 16 (App Router). Ler `node_modules/next/dist/docs/` antes de codar. `middleware.ts` virou `proxy.ts`. `cookies()` é assíncrono. `typecheck` = `next typegen && tsc --noEmit`.
- React 19, TypeScript estrito, Tailwind 4, shadcn/ui, React Hook Form + Zod (o mesmo schema valida no cliente e na Server Action).
- PostgreSQL 16 em Docker local (`compose.yaml`) + Drizzle ORM. Sem Supabase neste app.
- Vitest. Regra de negócio em função pura em `lib/dominio/`, testada sem banco.

## Banco e migrations

- Schema: `lib/servidor/db/schema.ts`. Conexão: `db()` em `lib/servidor/db/index.ts` (`server-only`, só aceita host local).
- Migrations em `drizzle/`: geradas e aplicadas pelo responsável humano (`pnpm db:generate`, `pnpm db:migrate`). Agente nunca cria, edita nem aplica migration.
- Só Postgres local ou o serviço do CI. Nenhuma conexão com banco real, VPS ou Supabase.
- Duas roles: migração (`DATABASE_URL_MIGRACAO`, só `drizzle-kit`) e aplicação (`DATABASE_URL`, app e seed, dona de nada, sem UPDATE/DELETE/TRUNCATE em `eventos_auditoria`, `movimentos_estoque` e `baixas`: correção é estorno).
- Tabela editável tem `versao` (concorrência otimista). Datas em `timestamptz`, exibidas em `America/Sao_Paulo`.
- `.env.local` é editado à mão. Nunca ler, imprimir ou commitar.
- Dinheiro em centavos inteiros (`bigint`), nunca float. Peça vendável em quantidade inteira; MP e compras em `NUMERIC(14,3)`.
- Identificador interno UUID separado do número exibido (ex.: `357-A`). Numeração por incremento atômico, início configurável.

## Domínio em uma linha cada

- Processo = solicitação de cotação; N pedidos formais por processo abatem a demanda; processo novo pode ser "derivado de" outro.
- Letra (A, B, C) = revisão comercial. Revisões comercial, técnica e de retrabalho são independentes.
- Estoque e reservas ancorados em produto + revisão técnica, nunca no processo. Peça no parceiro é "em processo", não estoque.
- `estoque_livre = fisico_elegivel - reservas_firmes - reservas_estrategicas` (bloqueios já estão fora do elegível).
- Entrega, aceite, NF e recebimento são eventos separados. Remessa, recebimento e NF são idempotentes.
- Preço pendente é estado explícito: PDF e envio de proposta só depois que o Admin precifica.

## Perfis e permissões

Cinco perfis: Admin, Comercial, Compras/Produção, Financeiro, Desenhista/Técnico. RBAC por ação (`lib/dominio/permissoes/catalogo.ts`, 54 permissões, 16 travadas no Admin), checado no servidor. Toda Server Action e Route Handler passa por `acao`/`acaoPublica`/`rota` (`lib/servidor/acao.ts`, deny by default); um teste falha se alguma ficar de fora.

Sigilo por campo, aplicado na serialização do servidor (`lib/dominio/sigilo/`):
- Compras vê custo, nunca preço.
- Comercial vê preço, nunca custo.
- Financeiro opera título a título, sem cruzar AP e AR.
- Margem, custo de lote e valorização de estoque: só Admin.

Identidade: Better Auth 1.6.33 fixo (pino exato; aviso de peer do Vitest 5 aceito, sem override) (PR 1D), sem cadastro público, login auditado. Seletor de perfil de dev só com `NODE_ENV=development` **e** `ENABLE_DEV_SWITCHER=1`, em arquivos `*.dev.ts(x)`; no build de produção responde 404 (`scripts/verificar-build-producao.sh`).

## Identidade visual

- Cores: vermelho `#A81915`, grafite `#191919`/`#1A1A1A`, cobre `#B5652E`.
- Fundo `#EEF0EE` com grid blueprint de 28 px.
- Tipografia: IBM Plex Sans e IBM Plex Mono.
- UI toda em pt-BR.

O layout sai do `/impeccable shape`.

## Fluxo obrigatório

Ordem das entregas: chore, 1A, 1B, 1D, 1C, PR 2.

1. `/brainstorm` → spec em `docs/superpowers/specs/`.
2. `/superpowers:writing-plans` → plano em `docs/superpowers/plans/`.
3. `/impeccable shape <superfície>` antes de qualquer UI.
4. Execução subagent-driven (SDD), task a task, com review.
5. Revisão Opus da branch inteira.
6. PR.

Regras do fluxo:
- Trabalho só em branch (`feat/usinagem-*`). Nunca commit nem push em `main`.
- Push e PR só com confirmação explícita do responsável humano.
- Nenhum deploy nem `vercel link`.
- Dados de seed sempre fictícios e marcados (`ficticio = true`, prefixo `[FICTÍCIO]`).
- Guardrails (`.claude/**`, `.gitignore`) não são editados por agente: entregar como patch.

Antes de concluir: `pnpm --filter usinagem typecheck`, `lint`, `test`, `build` limpos e nenhum segredo no diff.
