import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import type { UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { ErroPermissao, requirePermissao } from "./sessao";

export type RespostaAcao<T> = { ok: true; dados: T } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível concluir a operação.";

// Log nunca leva valores: erro de banco traz detail/cause com dados da linha. Só nome, mensagem e código.
function registrarErro(erro: unknown): void {
  if (!(erro instanceof Error)) return console.error({ nome: typeof erro });
  const { code } = erro as { code?: unknown };
  console.error({ nome: erro.name, mensagem: erro.message, codigo: typeof code === "string" ? code : undefined });
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
export function acao<E, S>(permissao: Permissao, esquema: ZodType<E>, fn: (entrada: E, usuario: UsuarioSessao) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => {
    let usuario: UsuarioSessao;
    try {
      usuario = await requirePermissao(permissao);
    } catch (erro) {
      if (erro instanceof ErroPermissao) return { ok: false, erro: erro.message };
      throw erro;
    }
    return executar(esquema, entrada, (e) => fn(e, usuario));
  };
}

/** Só para ações sem sessão por natureza (login). Cada uso é revisado; o teste de cobertura lista onde aparece. */
export function acaoPublica<E, S>(esquema: ZodType<E>, fn: (entrada: E) => Promise<S>) {
  return async (entrada: unknown): Promise<RespostaAcao<S>> => executar(esquema, entrada, fn);
}

/** Route Handler com permissão obrigatória. */
export function rota(permissao: Permissao, handler: (req: Request, usuario: UsuarioSessao) => Promise<Response>) {
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
