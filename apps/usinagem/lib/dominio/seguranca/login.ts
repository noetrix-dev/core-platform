import { z } from "zod";
import { reautenticacaoRecente } from "../usuarios/admin";

export const MENSAGEM_LOGIN_FALHOU = "E-mail ou senha incorretos.";
export const LIMITE_FALHAS_POR_EMAIL = 10;
export const JANELA_FALHAS_MS = 15 * 60 * 1000;
export const SENHA_MIN = 12;
export const SENHA_MAX = 128;
const MAX_USER_AGENT = 256;
const MAX_EMAIL = 254;
const MAX_IP = 45; // IPv6 com IPv4 embutido, o maior texto válido

export const normalizarEmail = (email: unknown): string => (typeof email === "string" ? email.trim().toLowerCase() : "");

/** Só e-mail bem formado entra na auditoria; texto bruto do atacante vira null. */
export function emailParaAuditoria(email: unknown): string | null {
  const n = normalizarEmail(email);
  return n.length <= MAX_EMAIL && z.email().safeParse(n).success ? n : null;
}

export const CHAVE_IP_DESCONHECIDO = "desconhecido";

/** Header controlado pelo atacante: só IP bem formado (trim, IPv6 em minúsculas) passa. */
function ipValido(ip: unknown): string | null {
  if (typeof ip !== "string" || ip.length > MAX_IP) return null;
  const n = ip.trim();
  if (z.ipv4().safeParse(n).success) return n;
  return z.ipv6().safeParse(n).success ? n.toLowerCase() : null;
}

/** Chave do rate limit por IP: inválido ou ausente cai num balde único que também limita. */
export const chaveDeLimite = (ip: unknown): string => ipValido(ip) ?? CHAVE_IP_DESCONHECIDO;

/** Sem controle/NUL, cortado por pontos de código (não parte par substituto). */
const userAgentParaAuditoria = (ua: string | null): string | null =>
  ua === null ? null : Array.from(ua.replace(/\p{Cc}/gu, "")).slice(0, MAX_USER_AGENT).join("");

/** Só para usuário existente: login de e-mail desconhecido não grava auditoria. */
/** `bloqueado`: recusa pelo limite por e-mail; operação própria que não conta para o limite. */
export function registroLogin(d: { email: unknown; sucesso: boolean; bloqueado?: boolean; ip: string | null; userAgent: string | null; usuarioId: string }) {
  return {
    autorId: d.usuarioId,
    operacao: d.bloqueado ? "login_bloqueado" : d.sucesso ? "login_sucesso" : "login_falha",
    entidade: "usuarios",
    entidadeId: d.usuarioId,
    antes: null,
    depois: { email: emailParaAuditoria(d.email), ip: ipValido(d.ip), userAgent: userAgentParaAuditoria(d.userAgent) },
    justificativa: null,
  };
}

/** Conta unidades UTF-16 (`length`), igual ao Better Auth. Caractere de controle (\n, \r, \t, NUL) recusa: não se digita no campo de senha. */
export const senhaValida = (s: unknown): boolean => typeof s === "string" && s.length >= SENHA_MIN && s.length <= SENHA_MAX && !/\p{Cc}/u.test(s);

/** Sem sessão Better Auth (null) conta como velha: o seletor de dev nunca faz ação sensível. */
export const exigeReautenticacao = (sessaoCriadaEm: Date | null, agora: Date): boolean =>
  !sessaoCriadaEm || !reautenticacaoRecente(sessaoCriadaEm, agora);

export const excedeuFalhasPorEmail = (falhasRecentes: number): boolean => falhasRecentes >= LIMITE_FALHAS_POR_EMAIL;

/**
 * Janela deslizante: bloqueado enquanto a última falha contada tiver menos de 15 min e houver
 * ao menos 10 falhas nos 15 min que terminam nela. Falha no futuro (relógio do banco adiantado) conta, nunca é descartada.
 */
export function bloqueioAtivo(instantesDeFalha: readonly Date[], agora: Date): boolean {
  const fim = agora.getTime();
  const t = instantesDeFalha.map((d) => d.getTime());
  if (t.length === 0) return false;
  const ultima = Math.max(...t);
  if (fim - ultima >= JANELA_FALHAS_MS) return false;
  return excedeuFalhasPorEmail(t.filter((x) => x > ultima - JANELA_FALHAS_MS).length);
}
