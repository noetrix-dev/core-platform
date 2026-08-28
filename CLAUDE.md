# CLAUDE.md

Instruções para agentes trabalhando no monorepo `noetrix-platform`.

As regras em `.claude/rules/` (frontend, backend, database, security) estão sempre ativas e têm precedência sobre o comportamento padrão.

## Antes de concluir uma tarefa

Rodar esta checklist antes de considerar qualquer tarefa finalizada:

1. Revisar o diff inteiro e confirmar que nada saiu do escopo pedido.
2. `pnpm typecheck` sem erros.
3. `pnpm lint` sem erros.
4. `pnpm build` sem erros.
5. Confirmar que nenhum secret entrou no working tree (`.env`, `.env.*`, chave, token, senha, connection string).

## Lições aprendidas

Registrar aqui decisões de arquitetura e armadilhas descobertas durante o desenvolvimento, para não repetir o mesmo erro depois.

<!-- LIÇÃO: (data) título curto. Contexto, decisão tomada e por quê. -->
<!-- LIÇÃO: (data) título curto. Contexto, decisão tomada e por quê. -->
<!-- LIÇÃO: (data) título curto. Contexto, decisão tomada e por quê. -->

## Contexto de bibliotecas

Sempre usar o Context7 quando precisar de documentação de biblioteca ou API, código de exemplo, instruções de setup ou configuração. Não é preciso o usuário pedir explicitamente: se a tarefa toca uma lib ou API, buscar a doc atualizada no Context7 antes de escrever o código, porque o conhecimento de treino pode estar desatualizado.

## MCPs disponíveis

- Supabase: banco de dados, auth e storage.
- Context7: documentação atualizada de bibliotecas e APIs.
- Playwright: testes reais no browser.
