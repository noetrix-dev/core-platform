import { pode, type Permissao } from "./catalogo";
import type { Perfil } from "./perfis";

export type UsuarioSessao = { id: string; nome: string; perfil: Perfil };

export function decidirAcesso(
  usuario: UsuarioSessao | null,
  permissao: Permissao,
  concedidas: readonly Permissao[],
): "permitido" | "nao_autenticado" | "negado" {
  if (!usuario) return "nao_autenticado";
  return pode(usuario.perfil, permissao, concedidas) ? "permitido" : "negado";
}
