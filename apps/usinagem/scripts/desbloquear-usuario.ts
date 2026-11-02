import { desbloquearUsuario } from "../lib/servidor/usuarios-auth";
import { type Banco, comRoleDaAplicacao, rodarSeDireto } from "./operacao";

type Deps = { banco: Banco; log: (m: string) => void; erro: (m: string) => void };

// Uso: pnpm usuario:desbloquear <email>. Nunca imprime o argumento: mensagens fixas.
export async function main(argv: string[], { banco, log, erro }: Deps): Promise<number> {
  return comRoleDaAplicacao(banco, erro, async () => {
    if (argv.length === 1 && (await desbloquearUsuario(banco, argv[0]))) {
      log("Desbloqueado.");
      return 0;
    }
    erro("E-mail inválido ou não encontrado.");
    return 1;
  });
}

rodarSeDireto(import.meta.url, (banco) => main(process.argv.slice(2), { banco, log: console.log, erro: console.error }));
