import { z } from "zod";
import { reautenticacaoRecente } from "../usuarios/admin";

export const MENSAGEM_LOGIN_FALHOU = "E-mail ou senha incorretos.";
export const LIMITE_FALHAS_POR_EMAIL = 10;
export const JANELA_FALHAS_MS = 15 * 60 * 1000;
export const SENHA_MIN = 12;
export const SENHA_MAX = 128;
const MAX_USER_AGENT = 256;
const MAX_EMAIL = 254;

export const normalizarEmail = (email: unknown): string => (typeof email === "string" ? email.trim().toLowerCase() : "");

/** Só e-mail bem formado entra na auditoria; texto bruto do atacante vira null. */
export function emailParaAuditoria(email: unknown): string | null {
  const n = normalizarEmail(email);
  return n.length <= MAX_EMAIL && z.email().safeParse(n).success ? n : null;
}

/** Só para usuário existente: login de e-mail desconhecido não grava auditoria. */
export function registroLogin(d: { email: unknown; sucesso: boolean; ip: string | null; userAgent: string | null; usuarioId: string }) {
  return {
    autorId: d.usuarioId,
    operacao: d.sucesso ? "login_sucesso" : "login_falha",
    entidade: "usuarios",
    entidadeId: d.usuarioId,
    antes: null,
    depois: { email: emailParaAuditoria(d.email), ip: d.ip, userAgent: d.userAgent?.slice(0, MAX_USER_AGENT) ?? null },
    justificativa: null,
  };
}

export const senhaValida = (s: unknown): boolean => typeof s === "string" && s.length >= SENHA_MIN && s.length <= SENHA_MAX;

/** Sem sessão Better Auth (null) conta como velha: o seletor de dev nunca faz ação sensível. */
export const exigeReautenticacao = (sessaoCriadaEm: Date | null, agora: Date): boolean =>
  !sessaoCriadaEm || !reautenticacaoRecente(sessaoCriadaEm, agora);

export const excedeuFalhasPorEmail = (falhasRecentes: number): boolean => falhasRecentes >= LIMITE_FALHAS_POR_EMAIL;
