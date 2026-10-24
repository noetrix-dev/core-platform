#!/usr/bin/env bash
# Cria as duas roles do ERP: migração (DDL) e aplicação (só DML). Sem senha no código.
set -euo pipefail
: "${MIGRACAO_DB_PASSWORD:?defina MIGRACAO_DB_PASSWORD}"
: "${APP_DB_PASSWORD:?defina APP_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" -v mig_pw="$MIGRACAO_DB_PASSWORD" -v app_pw="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE usinagem_migracao LOGIN PASSWORD :'mig_pw';
CREATE ROLE usinagem_app LOGIN PASSWORD :'app_pw';
GRANT CONNECT, CREATE ON DATABASE :"db" TO usinagem_migracao;
GRANT CONNECT ON DATABASE :"db" TO usinagem_app;
GRANT USAGE, CREATE ON SCHEMA public TO usinagem_migracao;
GRANT USAGE ON SCHEMA public TO usinagem_app;
-- Tudo que a role de migração criar fica acessível à aplicação só por DML.
-- Tabelas de log revogam UPDATE/DELETE na própria migration (ver Task 2, Step 7).
ALTER DEFAULT PRIVILEGES FOR ROLE usinagem_migracao IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO usinagem_app;
ALTER DEFAULT PRIVILEGES FOR ROLE usinagem_migracao IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO usinagem_app;
SQL
