import type { Perfil } from "../lib/dominio/permissoes/perfis";
import { criarAuth } from "../lib/servidor/auth-config";
import { criarUsuarioComSenha } from "../lib/servidor/usuarios-auth";
import { type Banco, comRoleDaAplicacao, lerSenha, operadorAtual, rodarSeDireto } from "./operacao";

type Deps = {
  banco: Banco;
  hash: (senha: string) => Promise<string>;
  senha: () => Promise<string | null>;
  operador: string | null;
  log: (m: string) => void;
  erro: (m: string) => void;
};

const USO = 'Uso: pnpm usuario:criar "<nome>" <email> <perfil> [--ficticio] (senha pela entrada padrão).';

// Senha só pela entrada padrão (TTY sem eco, ou pipe). Nunca por argumento nem variável de ambiente. Mensagens fixas.
export async function main(argv: string[], { banco, hash, senha, operador, log, erro }: Deps): Promise<number> {
  const posicionais = argv.filter((a) => a !== "--ficticio");
  if (posicionais.length !== 3) {
    erro(USO);
    return 1;
  }
  const [nome, email, perfil] = posicionais;
  return comRoleDaAplicacao(banco, erro, async () => {
    const lida = await senha();
    if (lida === null) {
      erro("As senhas não conferem.");
      return 1;
    }
    // Bootstrap: sem criador (criadoPor null). Validação de senha, e-mail e perfil acontece antes de qualquer escrita.
    await criarUsuarioComSenha(banco, hash, { nome, email, senha: lida, perfil: perfil as Perfil, ficticio: argv.includes("--ficticio"), criadoPor: null, operador });
    log("Usuário criado.");
    return 0;
  });
}

// Hash do contexto do Better Auth: o mesmo que o login usa para verificar.
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
