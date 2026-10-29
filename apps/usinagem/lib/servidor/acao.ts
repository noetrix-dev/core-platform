import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { ErroDominio } from "../dominio/comum";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { ErroPermissao, requirePermissao, type SessaoAutorizada } from "./sessao";

export type RespostaAcao<T> = { ok: true; dados: T } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível concluir a operação.";

// Log nunca leva valores: DrizzleQueryError e erros do pg trazem SQL, params e dados da linha na mensagem.
// Só ErroDominio e ErroPermissao têm mensagem controlada por nós; o resto grava nome e código (erro.code ou erro.cause.code).
function codigoDe(erro: Error): string | undefined {
  const { code, cause } = erro as { code?: unknown; cause?: { code?: unknown } | null };
  if (typeof code === "string") return code;
  const doCause = cause?.code;
  return typeof doCause === "string" ? doCause : undefined;
}

function registrarErro(erro: unknown): void {
  if (!(erro instanceof Error)) return console.error({ nome: typeof erro });
  const seguro = erro instanceof ErroDominio || erro instanceof ErroPermissao;
  console.error({ nome: erro.name, ...(seguro ? { mensagem: erro.message } : {}), codigo: codigoDe(erro) });
}

async function executar<E, S>(esquema: ZodType<E>, entrada: unknown, fn: (e: E) => Promise<S>): Promise<RespostaAcao<S>> {
  const valida = esquema.safeParse(entrada);
  if (!valida.success) return { ok: false, erro: "Dados inválidos." };
  try {
    return { ok: true, dados: await fn(valida.data) };
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro(erro);
    return { ok: false, erro: ERRO_GENERICO };
  }
}

/** Server Action com permissão obrigatória. Sem permissão declarada não existe ação (deny by default). */
export function acao<E, S>(permissao: Permissao, esquema: ZodType<E>, fn: (entrada: E, usuario: SessaoAutorizada) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => {
    let usuario: SessaoAutorizada;
    try {
      usuario = await requirePermissao(permissao);
    } catch (erro) {
      unstable_rethrow(erro);
      if (erro instanceof ErroPermissao) return { ok: false, erro: erro.message };
      registrarErro(erro);
      return { ok: false, erro: ERRO_GENERICO };
    }
    return executar(esquema, entrada, (e) => fn(e, usuario));
  };
}

/** Só para ações sem sessão por natureza (login). Cada uso é revisado; o teste de cobertura lista onde aparece. */
export function acaoPublica<E, S>(esquema: ZodType<E>, fn: (entrada: E) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => executar(esquema, entrada, fn);
}

/** Route Handler com permissão obrigatória. */
export function rota(permissao: Permissao, handler: (req: Request, usuario: SessaoAutorizada) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      const usuario = await requirePermissao(permissao);
      return await handler(req, usuario);
    } catch (erro) {
      unstable_rethrow(erro);
      if (erro instanceof ErroPermissao) return Response.json({ erro: erro.message }, { status: erro.status });
      registrarErro(erro);
      return Response.json({ erro: ERRO_GENERICO }, { status: 500 });
    }
  };
}
