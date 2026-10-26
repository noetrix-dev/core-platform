import { falha, ok, type Resultado } from "../comum";
import type { Perfil } from "../permissoes/perfis";

type UsuarioResumo = { id: string; perfil: Perfil; ativo: boolean; ficticio: boolean };

/** Não é atômica: o chamador precisa travar os Admins ativos (SELECT ... FOR UPDATE) na mesma transação. */
export function validarAlteracaoUsuario(
  usuarios: UsuarioResumo[],
  alvoId: string,
  mudanca: { perfil?: Perfil; ativo?: boolean },
): Resultado<true> {
  const alvo = usuarios.find((u) => u.id === alvoId);
  if (!alvo) return falha("Usuário não encontrado.");
  const eraAdminAtivo = alvo.perfil === "admin" && alvo.ativo;
  const continuaAdminAtivo = (mudanca.perfil ?? alvo.perfil) === "admin" && (mudanca.ativo ?? alvo.ativo);
  if (!eraAdminAtivo || continuaAdminAtivo) return ok(true);
  const outrosAdmins = usuarios.filter((u) => u.id !== alvoId && u.perfil === "admin" && u.ativo && (alvo.ficticio || !u.ficticio));
  return outrosAdmins.length > 0
    ? ok(true)
    : falha("A última conta Admin ativa não pode ser desativada nem perder o perfil.");
}

export const REAUTENTICACAO_MAX_MS = 10 * 60 * 1000;

export const reautenticacaoRecente = (ultima: Date, agora: Date): boolean =>
  agora.getTime() - ultima.getTime() >= 0 && agora.getTime() - ultima.getTime() <= REAUTENTICACAO_MAX_MS;
