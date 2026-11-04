import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decidirAcesso, type UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { seletorDevAtivo } from "../dominio/seguranca/dev";
import { exigeReautenticacao } from "../dominio/seguranca/login";
import { auth } from "./auth";
import { usuarioDaSessao } from "./auth-config";
import { db } from "./db";
import { perfilPermissoes } from "./db/schema";

type SessaoAtual = UsuarioSessao & { sessaoCriadaEm: Date | null };

/**
 * Sessão com as concedidas lidas de `perfil_permissoes`, as mesmas da decisão. Repasse-as ao sigilo e às regras de domínio.
 * `sessaoCriadaEm`: início do login do Better Auth; null no seletor de dev (que nunca faz ação sensível).
 */
export type SessaoAutorizada = SessaoAtual & { concedidas: readonly Permissao[] };

export class ErroPermissao extends Error {
  constructor(
    readonly status: 401 | 403,
    mensagem = status === 401 ? "Sessão ausente." : "Sem permissão para esta ação.",
  ) {
    super(mensagem);
  }
}

/** Ação sensível sem login recente. Mensagem fixa (segura para o log, como toda ErroPermissao). */
export class ErroReautenticacao extends ErroPermissao {
  constructor() {
    super(403, "Confirme sua senha para continuar.");
  }
}

// Única porta de leitura da sessão do Better Auth (o scanner recusa getSession/useSession fora deste arquivo).
export async function usuarioAtual(): Promise<SessaoAtual | null> {
  const real = await auth().api.getSession({ headers: await headers() });
  if (real) {
    // Relê o usuário a cada request: inativo ou senha trocada depois do login derruba a sessão (falha fechado, sem dev).
    const criadaEm = new Date(real.session.createdAt);
    const u = await usuarioDaSessao(db(), real.session.userId, criadaEm);
    return u && { ...u, sessaoCriadaEm: criadaEm };
  }
  // `process.env.NODE_ENV` literal: o Next substitui no build e elimina o ramo em produção.
  if (process.env.NODE_ENV === "development" && seletorDevAtivo(process.env)) {
    const { usuarioDev } = await import("./sessao-dev");
    const u = await usuarioDev();
    return u && { ...u, sessaoCriadaEm: null };
  }
  return null;
}

// Tabela perfil_permissoes vazia (seed não rodado) nega toda ação de não-admin: falha fechado.
export async function requirePermissao(permissao: Permissao): Promise<SessaoAutorizada> {
  const usuario = await usuarioAtual();
  const concedidas = usuario
    ? (await db().select({ p: perfilPermissoes.permissao }).from(perfilPermissoes).where(eq(perfilPermissoes.perfilId, usuario.perfil))).map((r) => r.p as Permissao)
    : [];
  const decisao = decidirAcesso(usuario, permissao, concedidas);
  if (decisao === "nao_autenticado") throw new ErroPermissao(401);
  if (decisao === "negado") throw new ErroPermissao(403);
  return { ...usuario!, concedidas };
}

/** Permissão e login recente (10 min). O seletor de dev (sessaoCriadaEm null) nunca passa. */
export async function requirePermissaoSensivel(permissao: Permissao): Promise<SessaoAutorizada> {
  const sessao = await requirePermissao(permissao);
  if (exigeReautenticacao(sessao.sessaoCriadaEm, new Date())) throw new ErroReautenticacao();
  return sessao;
}
