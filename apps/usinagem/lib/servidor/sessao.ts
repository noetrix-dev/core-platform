import "server-only";
import { eq } from "drizzle-orm";
import { decidirAcesso, type UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Permissao } from "../dominio/permissoes/catalogo";
import { seletorDevAtivo } from "../dominio/seguranca/dev";
import { db } from "./db";
import { perfilPermissoes } from "./db/schema";

export class ErroPermissao extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Sessão ausente." : "Sem permissão para esta ação.");
  }
}

// Até o PR 1D (Better Auth) só existe a sessão de dev; fora do gate, ninguém entra.
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  // `process.env.NODE_ENV` literal: o Next substitui no build e elimina o ramo em produção.
  if (process.env.NODE_ENV === "development" && seletorDevAtivo(process.env)) {
    const { usuarioDev } = await import("./sessao-dev");
    return usuarioDev();
  }
  return null;
}

// Tabela perfil_permissoes vazia (seed não rodado) nega toda ação de não-admin: falha fechado.
export async function requirePermissao(permissao: Permissao): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  const concedidas = usuario
    ? (await db().select({ p: perfilPermissoes.permissao }).from(perfilPermissoes).where(eq(perfilPermissoes.perfilId, usuario.perfil))).map((r) => r.p as Permissao)
    : [];
  const decisao = decidirAcesso(usuario, permissao, concedidas);
  if (decisao === "nao_autenticado") throw new ErroPermissao(401);
  if (decisao === "negado") throw new ErroPermissao(403);
  return usuario!;
}
