import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { urlLocal } from "./url-local";

type Banco = NodePgDatabase<typeof schema>;

// Em desenvolvimento o hot reload reavalia o módulo; guardar em globalThis evita abrir um pool novo a cada reload.
const globalDev = globalThis as typeof globalThis & { __usinagemDb?: Banco };
let instancia: Banco | undefined;

function criar(): Banco {
  // DATABASE_URL é sempre a role da aplicação (só DML).
  const pool = new Pool({ connectionString: urlLocal(process.env.DATABASE_URL), max: 10 });
  // Nunca registrar a string de conexão nem o objeto de configuração: só código e mensagem.
  pool.on("error", (erro: Error & { code?: string }) => {
    console.error("Erro no pool do Postgres:", erro.code ?? "sem_codigo", erro.message);
  });
  return drizzle({ client: pool, schema });
}

// Lazy: `next build` importa o módulo sem DATABASE_URL; o pool só nasce no primeiro uso.
export function db(): Banco {
  if (process.env.NODE_ENV === "development") return (globalDev.__usinagemDb ??= criar());
  return (instancia ??= criar());
}
