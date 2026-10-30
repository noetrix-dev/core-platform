import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Perfil } from "../dominio/permissoes/perfis";
import { db } from "./db";
import { usuarios } from "./db/schema";

export const COOKIE_USUARIO_DEV = "usinagem_dev_usuario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só usuários fictícios e ativos. Usuário real nunca entra pelo seletor de dev. */
export async function usuarioDev(): Promise<UsuarioSessao | null> {
  const id = (await cookies()).get(COOKIE_USUARIO_DEV)?.value;
  if (!id || !UUID.test(id)) return null;
  const [u] = await db()
    .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.ativo, true), eq(usuarios.ficticio, true)));
  return u ? { ...u, perfil: u.perfil as Perfil } : null;
}
