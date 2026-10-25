---
paths:
  - "apps/usinagem/**/*.ts"
  - "apps/usinagem/**/*.tsx"
---

# Database (apps/usinagem)

As regras de Supabase de `database.md` não valem aqui. O usinagem usa Postgres 16 + Drizzle.

- Schema em `apps/usinagem/lib/servidor/db/schema.ts`. Migrations em `apps/usinagem/drizzle/`, geradas por `drizzle-kit generate` pelo responsável humano. Agente nunca cria, edita nem aplica migration.
- Só Postgres local (Docker) ou o serviço do CI. Nunca conectar a banco remoto; `lib/servidor/db/url-local.ts` recusa host que não seja local.
- Duas roles: migração (`DATABASE_URL_MIGRACAO`, só `drizzle-kit`) e aplicação (`DATABASE_URL`, app e seed). A role da aplicação não tem UPDATE/DELETE em tabelas de log (`eventos_auditoria`, `movimentos_estoque`, `baixas`).
- Tabela editável tem `versao` e toda atualização filtra pela versão lida (concorrência otimista).
- Toda Server Action e Route Handler usa o wrapper `acao`/`acaoPublica`/`rota` de `lib/servidor/acao.ts` (deny by default).
- Acesso a dados pelo query builder do Drizzle. `sql` só como template parametrizado, nunca por concatenação de string.
- Dinheiro em centavos inteiros (`bigint`), nunca float. Quantidade inteira.
- Registro de negócio não é apagado: cancelar e estornar mudam estado e geram evento.
- Operação repetível (remessa, recebimento, NF, movimento de estoque) carrega `chave_idempotencia` única.
- Reserva e movimento de estoque rodam em transação, com `SELECT ... FOR UPDATE` no lote.
- Escrita sensível grava `eventos_auditoria` na mesma transação.
- Permissão e sigilo por campo são checados no servidor (`requirePermissao`, serializadores de `lib/dominio/sigilo`).
