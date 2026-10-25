-- Custom SQL migration file, put your code below! --
-- Append-only: a aplicação só insere. Correção é um novo registro de estorno, nunca UPDATE.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "eventos_auditoria" FROM usinagem_app;
