/**
 * Tabelas em que a aplicação só insere (spec §6.8). Correção vira um novo registro de estorno.
 * Cada uma recebe REVOKE UPDATE, DELETE, TRUNCATE de usinagem_app numa migration custom gerada
 * depois da migration que cria a tabela. O seed.test.ts falha se alguma existir sem a revogação.
 */
export const TABELAS_APPEND_ONLY = ["eventos_auditoria", "movimentos_estoque", "baixas"] as const;
