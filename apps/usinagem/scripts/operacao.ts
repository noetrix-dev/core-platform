import { userInfo } from "node:os";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErroDominio } from "../lib/dominio/comum";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { criarAuth } from "../lib/servidor/auth-config";
import { operadorValido } from "../lib/servidor/usuarios-auth";

// Base comum dos scripts de operação (usuario:*). Mensagens fixas: nunca ecoam argumento, senha nem erro do pg.
export type Banco = NodePgDatabase<typeof schema>;
export const ROLE_APP = "usinagem_app";
export const MSG_ROLE = "Recusado: o script só roda com a role da aplicação.";
export const MSG_CONEXAO = "Banco indisponível: conexão recusada ou interrompida.";
export const MSG_CONFIG = "Configuração ausente ou inválida: confira DATABASE_URL e BETTER_AUTH_SECRET.";
export const MSG_DUPLICADO = "E-mail já cadastrado.";
export const MSG_PERFIL = "Perfil inexistente.";
export const MSG_FALHA = "Falha inesperada na operação.";

/** Configuração ausente ou inválida (URL do banco, segredo do Better Auth). Sem mensagem: quem imprime é mensagemDeErro. */
export class ErroConfiguracao extends Error {}

const CONEXAO = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "57P03"]);

/** Uma frase fixa por classe, pelo código (do erro ou do `cause` que o drizzle embrulha). Nunca o texto do pg, que traz query e parâmetros. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDominio) return e.message;
  if (e instanceof ErroConfiguracao) return MSG_CONFIG;
  const pg = (e as { cause?: unknown } | null)?.cause ?? e;
  const { code, constraint } = (typeof pg === "object" && pg !== null ? pg : {}) as { code?: unknown; constraint?: unknown };
  if (typeof code !== "string") return MSG_FALHA;
  if (CONEXAO.has(code) || code.startsWith("08")) return MSG_CONEXAO;
  // 28: autenticação recusada (usuário/senha da URL); 3D000: banco inexistente na URL.
  if (code.startsWith("28") || code === "3D000") return MSG_CONFIG;
  if (code === "23505") return MSG_DUPLICADO;
  if (code === "23503" && constraint === "usuarios_perfil_id_perfis_id_fk") return MSG_PERFIL;
  return MSG_FALHA;
}

/** Hash do contexto do Better Auth (o mesmo que o login verifica), criado só quando a senha já foi lida. */
export const hashDoBetterAuth =
  (banco: Banco) =>
  async (senha: string): Promise<string> => {
    let auth: ReturnType<typeof criarAuth>;
    try {
      auth = criarAuth({ banco });
    } catch {
      throw new ErroConfiguracao();
    }
    return (await auth.$context).password.hash(senha);
  };

/** `import.meta.url` vem codificado (espaço = %20, acento em UTF-8): compara com a URL do argv[1], nunca com `file://` + caminho cru. */
export const ehExecucaoDireta = (importMetaUrl: string, argv1: string | undefined): boolean =>
  argv1 !== undefined && importMetaUrl === pathToFileURL(argv1).href;

/** Roda `fn` só se a conexão for a role da aplicação. ErroDominio sai com a mensagem dele; qualquer outro erro, com a fixa. */
export async function comRoleDaAplicacao(banco: Banco, erro: (m: string) => void, fn: () => Promise<number>): Promise<number> {
  try {
    const { rows } = await banco.execute<{ u: string }>(sql`select current_user as u`);
    if (rows[0]?.u !== ROLE_APP) {
      erro(MSG_ROLE);
      return 1;
    }
    return await fn();
  } catch (e) {
    erro(mensagemDeErro(e));
    return 1;
  }
}

/**
 * Senha sem eco. Em TTY: pede duas vezes, o eco vai para um destino mudo; null se diferirem ou a entrada fechar (Ctrl+C/Ctrl+D).
 * Fora de TTY: lê toda a entrada e corta uma única quebra de linha final. Nunca escreve a senha em `saida`.
 */
export async function lerSenha(entrada: NodeJS.ReadableStream & { isTTY?: boolean }, saida: NodeJS.WritableStream): Promise<string | null> {
  if (!entrada.isTTY) {
    // utf8 no stream: o decodificador junta caractere de vários bytes dividido entre pedaços (String(c) por pedaço viraria U+FFFD).
    entrada.setEncoding("utf8");
    let texto = "";
    for await (const c of entrada) texto += String(c);
    // Sem trim: espaços são da senha. Só um terminador final sai (\r\n, \n ou \r).
    return texto.replace(/(?:\r\n|\n|\r)$/, "");
  }
  const mudo = new Writable({ write: (_c, _e, cb) => cb() });
  const rl = createInterface({ input: entrada, output: mudo, terminal: true });
  rl.on("SIGINT", () => rl.close());
  const linhas = rl[Symbol.asyncIterator]();
  const ler = async (prompt: string) => {
    saida.write(prompt);
    const r = await linhas.next();
    saida.write("\n");
    return r.done ? null : r.value;
  };
  try {
    const a = await ler("Senha: ");
    const b = a === null ? null : await ler("Confirme a senha: ");
    return a !== null && a === b ? a : null;
  } finally {
    rl.close();
  }
}

export function operadorAtual(): string | null {
  try {
    return operadorValido(userInfo().username);
  } catch {
    return null;
  }
}

/** Execução direta (`node scripts/x.ts`): role da aplicação (DATABASE_URL), nunca a de migração. Falha sai com mensagem fixa e código 1. */
export function rodarSeDireto(importMetaUrl: string, executar: (banco: Banco) => Promise<number>): void {
  if (!ehExecucaoDireta(importMetaUrl, process.argv[1])) return;
  const banco = (() => {
    try {
      return drizzle(urlLocal(process.env.DATABASE_URL), { schema });
    } catch {
      return null;
    }
  })();
  if (!banco) {
    console.error(MSG_CONFIG);
    process.exitCode = 1;
    return;
  }
  executar(banco)
    .catch((e: unknown) => {
      console.error(mensagemDeErro(e));
      return 1;
    })
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .finally(() => banco.$client.end().catch(() => {}));
}
