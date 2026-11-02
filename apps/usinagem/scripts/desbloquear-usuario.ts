import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { desbloquearUsuario } from "../lib/servidor/usuarios-auth";

type Deps = { banco: NodePgDatabase<typeof schema>; log: (m: string) => void; erro: (m: string) => void };

// Uso: pnpm usuario:desbloquear <email>. Nunca imprime o argumento: mensagens fixas.
export async function main(argv: string[], { banco, log, erro }: Deps): Promise<number> {
  if (argv.length === 1 && (await desbloquearUsuario(banco, argv[0]))) {
    log("Desbloqueado.");
    return 0;
  }
  erro("E-mail inválido ou não encontrado.");
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Role da aplicação (DATABASE_URL), nunca a de migração.
  const banco = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  main(process.argv.slice(2), { banco, log: console.log, erro: console.error })
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .finally(() => banco.$client.end());
}
