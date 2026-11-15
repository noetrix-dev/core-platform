import { createAuthClient } from "better-auth/react";
import { destinoSeguro, MENSAGEM_LOGIN_FALHOU } from "../dominio/seguranca/login";

// Módulo de navegador (sem server-only), no caminho que o plano fixou. Fala com /api/auth da mesma origem.
// Sessão nunca é lida daqui: só lib/servidor/sessao.ts (o scanner recusa a leitura em qualquer outro arquivo).
export const authCliente = createAuthClient();

export type ClienteAuth = Pick<typeof authCliente, "signIn" | "signOut">;

type Resposta = { data: unknown; error: unknown };
const falhou = (r: Resposta) => Boolean(r.error) || !r.data;

/**
 * Login do formulário. Devolve null no sucesso (depois de navegar) ou MENSAGEM_LOGIN_FALHOU para qualquer falha:
 * credencial, bloqueio, rate limit, rede. Nunca manda callbackURL; o destino é sempre destinoSeguro(volta).
 * Reautenticar: encerra a sessão atual antes (D1), para o login novo nascer com createdAt de agora.
 */
export async function entrarComSenha(
  d: { email: string; senha: string; reautenticar: boolean; volta: unknown },
  cliente: ClienteAuth,
  navegar: (destino: string) => void,
): Promise<string | null> {
  try {
    if (d.reautenticar && falhou(await cliente.signOut())) return MENSAGEM_LOGIN_FALHOU;
    if (falhou(await cliente.signIn.email({ email: d.email, password: d.senha }))) return MENSAGEM_LOGIN_FALHOU;
  } catch {
    return MENSAGEM_LOGIN_FALHOU;
  }
  navegar(destinoSeguro(d.volta));
  return null;
}
