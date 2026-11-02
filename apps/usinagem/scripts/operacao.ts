import { userInfo } from "node:os";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErroDominio } from "../lib/dominio/comum";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { operadorValido } from "../lib/servidor/usuarios-auth";

// Base comum dos scripts de operação (usuario:*). Mensagens fixas: nunca ecoam argumento, senha nem erro do pg.
export type Banco = NodePgDatabase<typeof schema>;
export const ROLE_APP = "usinagem_app";
export const MSG_ROLE = "Recusado: o script só roda com a role da aplicação.";
export const MSG_FALHA = "Falha ao acessar o banco ou a configuração.";

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
    erro(e instanceof ErroDominio ? e.message : MSG_FALHA);
    return 1;
  }
}

/**
 * Senha sem eco. Em TTY: pede duas vezes, o eco vai para um destino mudo; null se diferirem ou a entrada fechar (Ctrl+C/Ctrl+D).
 * Fora de TTY: lê toda a entrada e corta uma única quebra de linha final. Nunca escreve a senha em `saida`.
 */
export async function lerSenha(entrada: NodeJS.ReadableStream & { isTTY?: boolean }, saida: NodeJS.WritableStream): Promise<string | null> {
  if (!entrada.isTTY) {
    let texto = "";
    for await (const c of entrada) texto += String(c);
    return texto.replace(/\r?\n$/, "");
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
    console.error(MSG_FALHA);
    process.exitCode = 1;
    return;
  }
  executar(banco)
    .catch(() => {
      console.error(MSG_FALHA);
      return 1;
    })
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .finally(() => banco.$client.end().catch(() => {}));
}
