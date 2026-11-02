import { criarAuth } from "../lib/servidor/auth-config";
import { redefinirSenha } from "../lib/servidor/usuarios-auth";
import { type Banco, comRoleDaAplicacao, lerSenha, operadorAtual, rodarSeDireto } from "./operacao";

type Deps = {
  banco: Banco;
  hash: (senha: string) => Promise<string>;
  senha: () => Promise<string | null>;
  operador: string | null;
  log: (m: string) => void;
  erro: (m: string) => void;
};

// Recuperação provisória (spec §9.2). Nova senha só pela entrada padrão. Mensagens fixas: nunca ecoam e-mail nem senha.
export async function main(argv: string[], { banco, hash, senha, operador, log, erro }: Deps): Promise<number> {
  if (argv.length !== 1) {
    erro("Uso: pnpm usuario:redefinir-senha <email> (senha pela entrada padrão).");
    return 1;
  }
  return comRoleDaAplicacao(banco, erro, async () => {
    const lida = await senha();
    if (lida === null) {
      erro("As senhas não conferem.");
      return 1;
    }
    if (!(await redefinirSenha(banco, hash, { email: argv[0], novaSenha: lida, operador }))) {
      erro("E-mail inválido ou não encontrado.");
      return 1;
    }
    log("Senha redefinida. Sessões encerradas.");
    return 0;
  });
}

rodarSeDireto(import.meta.url, async (banco) => {
  return main(process.argv.slice(2), {
    banco,
    // Preguiçoso: argumentos e role são checados antes de exigir a configuração do Better Auth.
    hash: async (senha) => (await criarAuth({ banco }).$context).password.hash(senha),
    senha: () => lerSenha(process.stdin, process.stderr),
    operador: operadorAtual(),
    log: console.log,
    erro: console.error,
  });
});
