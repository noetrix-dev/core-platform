import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { urlLocal } from "./url-local";

let instancia: NodePgDatabase<typeof schema> | undefined;

// Lazy: `next build` importa o módulo sem DATABASE_URL; a conexão só nasce no primeiro uso.
// DATABASE_URL é sempre a role da aplicação (só DML).
export function db(): NodePgDatabase<typeof schema> {
  instancia ??= drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  return instancia;
}
